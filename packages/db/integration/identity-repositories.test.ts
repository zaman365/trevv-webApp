import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  appUserOrganizationSelections,
  auditLogs,
  authUserMappings,
  authUsers,
  blueprintInstances,
  blueprints,
  boards,
  collaborationEvents,
  conversations,
  conversationMessages,
  conversationParticipants,
  createDatabase,
  createIdentityScope,
  createOrganizationScope,
  createPostgresRepositories,
  fingerprintRequest,
  hashInvitationToken,
  idempotencyRecords,
  invitations,
  memberships,
  onboardingProgress,
  organizations,
  outboxEvents,
  portfolioMembers,
  portfolios,
  registrationInvitationClaims,
  teamMembers,
  teamRooms,
  teams,
  users,
  workspaceMembers,
  workspaces,
} from "../src/index.js";
import {
  applyMigrationFiles,
  createTemporaryDatabase,
  migrateCurrent,
  type TemporaryDatabase,
} from "./database-test-helper.js";

let temporary: TemporaryDatabase;
let connection: ReturnType<typeof createDatabase>;

beforeAll(async () => {
  temporary = await createTemporaryDatabase();
  await migrateCurrent(temporary.url);
  connection = createDatabase(temporary.url);
}, 120_000);

afterAll(async () => {
  await connection?.close();
  await temporary?.drop();
}, 120_000);

function opaqueToken() {
  return randomBytes(32).toString("base64url");
}

function identityScope(authUserId: string, suffix = randomUUID()) {
  return createIdentityScope({
    authUserId,
    requestId: `request-${suffix}`,
  });
}

function onboardingInput(label: string) {
  return {
    step: 5 as const,
    organizationName: `${label} Company`,
    organizationSlug: `${label}-company`,
    workspaceName: `${label} Operations`,
    workspaceSlug: `${label}-operations`,
    workspaceType: "business" as const,
    workspaceColor: "#334455",
    blueprintKey: "operating_business" as const,
  };
}

function mutation(route: string, now = new Date("2026-08-29T12:00:00.000Z")) {
  return {
    method: "POST",
    route,
    idempotencyKey: randomUUID(),
    now,
  };
}

async function seedAuthUser(input: {
  id: string;
  email: string;
  verified?: boolean;
  name?: string;
}) {
  await connection.db.insert(authUsers).values({
    id: input.id,
    email: input.email,
    name: input.name ?? "Identity Test User",
    emailVerified: input.verified ?? true,
  });
}

async function onboardOwner(label: string) {
  const authUserId = `auth-${label}-${randomUUID()}`;
  await seedAuthUser({
    id: authUserId,
    email: `${authUserId}@example.test`,
  });
  const scope = identityScope(authUserId);
  const identity = createPostgresRepositories(connection.db).forIdentity(scope);
  const input = onboardingInput(label);
  const context = { idempotencyKey: `onboard-${authUserId}` };
  const result = await identity.onboarding.complete(input, context);
  return { authUserId, scope, identity, input, context, result };
}

describe("Phase 2 identity repositories", () => {
  it("fails closed before verification and persists a versioned recoverable draft", async () => {
    const authUserId = `auth-draft-${randomUUID()}`;
    await seedAuthUser({
      id: authUserId,
      email: `${authUserId}@example.test`,
      verified: false,
    });
    const scope = identityScope(authUserId);
    const identity = createPostgresRepositories(connection.db).forIdentity(
      scope,
    );
    await expect(identity.resolve()).resolves.toMatchObject({
      status: "verification_required",
    });
    await expect(
      identity.onboarding.complete(onboardingInput("unverified"), {
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "identity_not_verified" });

    await connection.db
      .update(authUsers)
      .set({ emailVerified: true })
      .where(eq(authUsers.id, authUserId));
    await expect(identity.resolve()).resolves.toMatchObject({
      status: "onboarding_required",
    });
    const saved = await identity.onboarding.saveProgress({
      step: 2,
      organizationName: "Recoverable Company",
      organizationSlug: "recoverable-company",
    });
    expect(saved).toMatchObject({
      status: "in_progress",
      step: 2,
      draft: { organizationSlug: "recoverable-company" },
    });

    const restarted = createDatabase(temporary.url);
    try {
      const progress = await createPostgresRepositories(restarted.db)
        .forIdentity(scope)
        .onboarding.getProgress();
      expect(progress).toEqual(saved);
      await expect(
        createPostgresRepositories(restarted.db)
          .forIdentity(scope)
          .onboarding.saveProgress(
            { step: 3, workspaceName: "Outdated write" },
            saved.version - 1,
          ),
      ).rejects.toMatchObject({ code: "version_conflict" });
    } finally {
      await restarted.close();
    }
  });

  it("provisions the complete tenant graph atomically and replays completion", async () => {
    const authUserId = `auth-onboarding-${randomUUID()}`;
    await seedAuthUser({
      id: authUserId,
      email: `${authUserId}@example.test`,
      name: "Durable Founder",
    });
    const scope = identityScope(authUserId, "onboarding");
    const identity = createPostgresRepositories(connection.db).forIdentity(
      scope,
    );
    const input = onboardingInput(`durable-${randomUUID()}`);
    const context = { idempotencyKey: randomUUID() };
    const first = await identity.onboarding.complete(input, context);
    expect(first.replayed).toBe(false);
    const replay = await identity.onboarding.complete(input, context);
    expect(replay).toEqual({ ...first, replayed: true });
    await expect(
      identity.onboarding.complete(
        { ...input, workspaceName: "Different request" },
        { idempotencyKey: randomUUID() },
      ),
    ).rejects.toMatchObject({ code: "onboarding_conflict" });

    const [
      mapping,
      membership,
      portfolio,
      workspace,
      board,
      blueprint,
      instance,
    ] = await Promise.all([
      connection.db.query.authUserMappings.findFirst({
        where: eq(authUserMappings.authUserId, authUserId),
      }),
      connection.db.query.memberships.findFirst({
        where: and(
          eq(memberships.organizationId, first.organizationId),
          eq(memberships.userId, first.appUserId),
        ),
      }),
      connection.db.query.portfolios.findFirst({
        where: eq(portfolios.id, first.portfolioId),
      }),
      connection.db.query.workspaces.findFirst({
        where: eq(workspaces.id, first.workspaceId),
      }),
      connection.db.query.boards.findFirst({
        where: eq(boards.id, first.boardId),
      }),
      connection.db.query.blueprints.findFirst({
        where: eq(blueprints.id, first.blueprintId),
      }),
      connection.db.query.blueprintInstances.findFirst({
        where: eq(blueprintInstances.id, first.blueprintInstanceId),
      }),
    ]);
    expect(mapping?.appUserId).toBe(first.appUserId);
    expect(membership).toMatchObject({ role: "owner", archivedAt: null });
    expect(portfolio).toMatchObject({ isDefault: true });
    expect(workspace).toMatchObject({ leadUserId: first.appUserId });
    expect(board).toMatchObject({ templateKey: "operating_business" });
    expect(blueprint?.currentVersionId).toBe(instance?.blueprintVersionId);
    expect(instance).toMatchObject({
      workspaceId: first.workspaceId,
      boardId: first.boardId,
    });
    await expect(identity.resolve()).resolves.toMatchObject({
      status: "active",
      appUser: { id: first.appUserId },
      organization: { id: first.organizationId },
      membership: { role: "owner" },
      portfolioIds: [first.portfolioId],
      workspaceIds: [first.workspaceId],
    });

    const [auditCount, outboxCount] = await Promise.all([
      connection.db.$count(
        auditLogs,
        and(
          eq(auditLogs.organizationId, first.organizationId),
          eq(auditLogs.action, "organization.onboarded"),
        ),
      ),
      connection.db.$count(
        outboxEvents,
        and(
          eq(outboxEvents.organizationId, first.organizationId),
          eq(outboxEvents.eventType, "organization.onboarded"),
        ),
      ),
    ]);
    expect({ auditCount, outboxCount }).toEqual({
      auditCount: 1,
      outboxCount: 1,
    });
  });

  it("rolls back every provisioning effect while retaining the prior draft", async () => {
    const existing = await onboardOwner(`collision-${randomUUID()}`);
    const authUserId = `auth-rollback-${randomUUID()}`;
    const email = `${authUserId}@example.test`;
    await seedAuthUser({ id: authUserId, email });
    const identity = createPostgresRepositories(connection.db).forIdentity(
      identityScope(authUserId),
    );
    await identity.onboarding.saveProgress({
      step: 2,
      organizationName: "Still recoverable",
    });
    await expect(
      identity.onboarding.complete(
        {
          ...onboardingInput(`rollback-${randomUUID()}`),
          organizationSlug: existing.input.organizationSlug,
        },
        { idempotencyKey: randomUUID() },
      ),
    ).rejects.toMatchObject({ code: "constraint_conflict" });

    const [mapping, appUser, progress] = await Promise.all([
      connection.db.query.authUserMappings.findFirst({
        where: eq(authUserMappings.authUserId, authUserId),
      }),
      connection.db.query.users.findFirst({ where: eq(users.email, email) }),
      identity.onboarding.getProgress(),
    ]);
    expect(mapping).toBeUndefined();
    expect(appUser).toBeUndefined();
    expect(progress).toMatchObject({
      status: "in_progress",
      draft: { organizationName: "Still recoverable" },
    });
  });

  it("serializes concurrent onboarding completion to one durable tenant", async () => {
    const authUserId = `auth-concurrent-${randomUUID()}`;
    await seedAuthUser({
      id: authUserId,
      email: `${authUserId}@example.test`,
    });
    const scope = identityScope(authUserId, "concurrent-onboarding");
    const input = onboardingInput(`concurrent-${randomUUID()}`);
    const context = { idempotencyKey: randomUUID() };
    const secondConnection = createDatabase(temporary.url);
    try {
      const [left, right] = await Promise.all([
        createPostgresRepositories(connection.db)
          .forIdentity(scope)
          .onboarding.complete(input, context),
        createPostgresRepositories(secondConnection.db)
          .forIdentity(scope)
          .onboarding.complete(input, context),
      ]);
      expect([left.replayed, right.replayed].sort()).toEqual([false, true]);
      expect(left.organizationId).toBe(right.organizationId);
      expect(
        await connection.db.$count(
          organizations,
          eq(organizations.id, left.organizationId),
        ),
      ).toBe(1);
    } finally {
      await secondConnection.close();
    }
  });

  it("rolls back the tenant graph, audit, and outbox after a late transaction fault", async () => {
    const authUserId = `auth-late-fault-${randomUUID()}`;
    const email = `${authUserId}@example.test`;
    const requestId = "request-late-onboarding-fault";
    await seedAuthUser({ id: authUserId, email });
    const identity = createPostgresRepositories(connection.db).forIdentity(
      identityScope(authUserId, "late-onboarding-fault"),
    );
    await identity.onboarding.saveProgress({
      step: 4,
      organizationName: "Late fault draft",
    });
    await connection.db.execute(sql`
      create function reject_onboarding_completion()
      returns trigger
      language plpgsql
      as $$
      begin
        if new.status = 'completed' then
          raise exception 'injected onboarding completion fault';
        end if;
        return new;
      end
      $$
    `);
    await connection.db.execute(sql`
      create trigger reject_onboarding_completion_trigger
      before update on onboarding_progress
      for each row execute function reject_onboarding_completion()
    `);
    const input = onboardingInput(`late-fault-${randomUUID()}`);
    try {
      await expect(
        identity.onboarding.complete(input, { idempotencyKey: randomUUID() }),
      ).rejects.toThrow();
    } finally {
      await connection.db.execute(sql`
        drop trigger reject_onboarding_completion_trigger on onboarding_progress
      `);
      await connection.db.execute(
        sql`drop function reject_onboarding_completion()`,
      );
    }
    const [
      mappingCount,
      userCount,
      organizationCount,
      auditCount,
      outboxCount,
    ] = await Promise.all([
      connection.db.$count(
        authUserMappings,
        eq(authUserMappings.authUserId, authUserId),
      ),
      connection.db.$count(users, eq(users.email, email)),
      connection.db.$count(
        organizations,
        eq(organizations.slug, input.organizationSlug),
      ),
      connection.db.$count(
        auditLogs,
        sql`${auditLogs.payload}->>'requestId' = ${requestId}`,
      ),
      connection.db.$count(outboxEvents, eq(outboxEvents.requestId, requestId)),
    ]);
    expect({ mappingCount, userCount, organizationCount }).toEqual({
      mappingCount: 0,
      userCount: 0,
      organizationCount: 0,
    });
    expect({ auditCount, outboxCount }).toEqual({
      auditCount: 0,
      outboxCount: 0,
    });
    await expect(identity.onboarding.getProgress()).resolves.toMatchObject({
      status: "in_progress",
      step: 4,
    });
  });

  it("switches only among server-derived active organization memberships", async () => {
    const owner = await onboardOwner(`selection-${randomUUID()}`);
    const secondOrganizationId = `org-selection-${randomUUID()}`;
    await connection.db.transaction(async (transaction) => {
      await transaction.insert(organizations).values({
        id: secondOrganizationId,
        name: "Second Organization",
        slug: `second-${randomUUID()}`,
      });
      await transaction.insert(memberships).values({
        organizationId: secondOrganizationId,
        userId: owner.result.appUserId,
        role: "admin",
      });
    });
    const initialResolution = await owner.identity.resolve();
    expect(initialResolution).toMatchObject({
      status: "active",
      organization: { id: owner.result.organizationId },
    });
    expect(
      initialResolution.status === "active"
        ? initialResolution.organizations.map(({ id }) => id)
        : [],
    ).toEqual(
      expect.arrayContaining([
        owner.result.organizationId,
        secondOrganizationId,
      ]),
    );
    await expect(
      owner.identity.selectOrganization(secondOrganizationId),
    ).resolves.toMatchObject({
      status: "active",
      organization: { id: secondOrganizationId },
      membership: { role: "admin" },
    });
    await expect(
      owner.identity.selectOrganization(`org-unavailable-${randomUUID()}`),
    ).rejects.toMatchObject({ code: "resource_not_found" });
    const selection =
      await connection.db.query.appUserOrganizationSelections.findFirst({
        where: eq(
          appUserOrganizationSelections.appUserId,
          owner.result.appUserId,
        ),
      });
    expect(selection?.organizationId).toBe(secondOrganizationId);
  });

  it("replaces an archived selected organization with the sole active choice", async () => {
    const owner = await onboardOwner(`archived-selection-${randomUUID()}`);
    const archivedOrganizationId = `org-archived-${randomUUID()}`;
    await connection.db.transaction(async (transaction) => {
      await transaction.insert(organizations).values({
        id: archivedOrganizationId,
        name: "Organization to archive",
        slug: `archived-${randomUUID()}`,
      });
      await transaction.insert(memberships).values({
        organizationId: archivedOrganizationId,
        userId: owner.result.appUserId,
        role: "admin",
      });
    });
    await owner.identity.selectOrganization(archivedOrganizationId);

    const archivedAt = new Date("2026-08-29T13:00:00.000Z");
    await connection.db
      .update(organizations)
      .set({ archivedAt, updatedAt: archivedAt })
      .where(eq(organizations.id, archivedOrganizationId));

    await expect(owner.identity.resolve()).resolves.toMatchObject({
      status: "active",
      organization: { id: owner.result.organizationId },
      organizations: [{ id: owner.result.organizationId }],
    });
    await expect(
      owner.identity.selectOrganization(archivedOrganizationId),
    ).rejects.toMatchObject({ code: "resource_not_found" });
    const selection =
      await connection.db.query.appUserOrganizationSelections.findFirst({
        where: eq(
          appUserOrganizationSelections.appUserId,
          owner.result.appUserId,
        ),
      });
    expect(selection?.organizationId).toBe(owner.result.organizationId);
  });

  it("rolls back auth-user creation when an invitation is revoked across the admission race", async () => {
    const suffix = randomUUID();
    const organizationId = `org-registration-race-${suffix}`;
    const invitationId = `invitation-registration-race-${suffix}`;
    const authUserId = `auth-registration-race-${suffix}`;
    const email = `${authUserId}@example.test`;
    const tokenHash = hashInvitationToken(opaqueToken());
    await connection.db.insert(organizations).values({
      id: organizationId,
      name: "Registration race test",
      slug: `registration-race-${suffix}`,
    });
    await connection.db.insert(invitations).values({
      id: invitationId,
      organizationId,
      email,
      role: "member",
      tokenHash,
      expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
    });

    const locker = createDatabase(temporary.url);
    const contender = createDatabase(temporary.url);
    let creation:
      | Promise<
          | { ok: true }
          | {
              ok: false;
              error: unknown;
            }
        >
      | undefined;
    try {
      await locker.db.transaction(async (transaction) => {
        await transaction
          .select({ id: invitations.id })
          .from(invitations)
          .where(eq(invitations.id, invitationId))
          .for("update");
        creation = contender.db
          .insert(authUsers)
          .values({
            id: authUserId,
            name: "Registration race contender",
            email,
            emailVerified: false,
            registrationInvitationTokenHash: tokenHash,
          })
          .then(
            () => ({ ok: true }) as const,
            (error: unknown) => ({ ok: false, error }) as const,
          );
        await transaction
          .update(invitations)
          .set({ revokedAt: new Date() })
          .where(eq(invitations.id, invitationId));
      });

      const result = await creation;
      expect(result?.ok).toBe(false);
      expect(
        await connection.db.query.authUsers.findFirst({
          where: eq(authUsers.id, authUserId),
        }),
      ).toBeUndefined();
      expect(
        await connection.db.query.registrationInvitationClaims.findFirst({
          where: eq(registrationInvitationClaims.invitationId, invitationId),
        }),
      ).toBeUndefined();
    } finally {
      await Promise.all([locker.close(), contender.close()]);
    }
  });

  it("binds a registration claim to the auth identity that may accept the invitation", async () => {
    const suffix = randomUUID();
    const organizationId = `org-registration-claim-${suffix}`;
    const invitationId = `invitation-registration-claim-${suffix}`;
    const claimedAuthUserId = `auth-registration-claim-${suffix}`;
    const otherAuthUserId = `auth-registration-other-${suffix}`;
    const email = `${claimedAuthUserId}@example.test`;
    const tokenHash = hashInvitationToken(opaqueToken());
    await connection.db.insert(organizations).values({
      id: organizationId,
      name: "Registration claim test",
      slug: `registration-claim-${suffix}`,
    });
    await connection.db.insert(invitations).values({
      id: invitationId,
      organizationId,
      email,
      role: "member",
      tokenHash,
      expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
    });
    await connection.db.insert(authUsers).values({
      id: claimedAuthUserId,
      name: "Claimed invitation identity",
      email,
      emailVerified: true,
      registrationInvitationTokenHash: tokenHash,
    });
    await connection.db.insert(authUsers).values({
      id: otherAuthUserId,
      name: "Case-variant identity",
      email: email.toUpperCase(),
      emailVerified: true,
    });

    const claim =
      await connection.db.query.registrationInvitationClaims.findFirst({
        where: eq(registrationInvitationClaims.invitationId, invitationId),
      });
    expect(claim).toMatchObject({ authUserId: claimedAuthUserId });
    await expect(
      createPostgresRepositories(connection.db)
        .forIdentity(identityScope(otherAuthUserId, "wrong-claim-owner"))
        .invitations.accept(tokenHash),
    ).rejects.toMatchObject({ code: "invitation_invalid" });
    await expect(
      createPostgresRepositories(connection.db)
        .forIdentity(identityScope(claimedAuthUserId, "claim-owner"))
        .invitations.accept(tokenHash),
    ).resolves.toMatchObject({
      invitationId,
      organizationId,
    });
  });

  it("keeps a one-time registration claim consumed after auth-account deletion", async () => {
    const suffix = randomUUID();
    const organizationId = `org-deleted-registration-${suffix}`;
    const invitationId = `invitation-deleted-registration-${suffix}`;
    const originalAuthUserId = `auth-deleted-registration-${suffix}`;
    const replacementAuthUserId = `auth-replacement-registration-${suffix}`;
    const email = `${originalAuthUserId}@example.test`;
    const tokenHash = hashInvitationToken(opaqueToken());
    await connection.db.insert(organizations).values({
      id: organizationId,
      name: "Deleted registration account test",
      slug: `deleted-registration-${suffix}`,
    });
    await connection.db.insert(invitations).values({
      id: invitationId,
      organizationId,
      email,
      role: "member",
      tokenHash,
      expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
    });
    await connection.db.insert(authUsers).values({
      id: originalAuthUserId,
      name: "Original invited account",
      email,
      emailVerified: false,
      registrationInvitationTokenHash: tokenHash,
    });

    await connection.db
      .delete(authUsers)
      .where(eq(authUsers.id, originalAuthUserId));
    await expect(
      connection.db.query.registrationInvitationClaims.findFirst({
        where: eq(registrationInvitationClaims.invitationId, invitationId),
      }),
    ).resolves.toMatchObject({ authUserId: null });

    await expect(
      connection.db.insert(authUsers).values({
        id: replacementAuthUserId,
        name: "Replacement invited account",
        email,
        emailVerified: false,
        registrationInvitationTokenHash: tokenHash,
      }),
    ).rejects.toThrow();
    await expect(
      connection.db.query.authUsers.findFirst({
        where: eq(authUsers.id, replacementAuthUserId),
      }),
    ).resolves.toBeUndefined();
  });

  it("rotates, records delivery, accepts once, and never exposes token hashes", async () => {
    const owner = await onboardOwner(`invite-owner-${randomUUID()}`);
    const ownerRepositories = createPostgresRepositories(
      connection.db,
    ).forOrganization(
      createOrganizationScope({
        organizationId: owner.result.organizationId,
        userId: owner.result.appUserId,
        requestId: "request-invite-owner",
      }),
    );
    const inviteeAuthUserId = `auth-invitee-${randomUUID()}`;
    const inviteeEmail = `${inviteeAuthUserId}@example.test`;
    await seedAuthUser({ id: inviteeAuthUserId, email: inviteeEmail });
    const firstTokenHash = hashInvitationToken(opaqueToken());
    const now = new Date("2026-08-29T12:00:00.000Z");
    const createContext = {
      ...mutation("/invitations", now),
      requestFingerprint: fingerprintRequest({
        action: "create-invitation",
        email: inviteeEmail,
      }),
      responseStatus: 201,
    };
    const createInput = {
      email: inviteeEmail,
      role: "member" as const,
      tokenHash: firstTokenHash,
      expiresAt: new Date("2026-08-31T12:00:00.000Z"),
    };
    const created = await ownerRepositories.invitations.create(
      createInput,
      createContext,
    );
    expect(created.value).not.toHaveProperty("tokenHash");
    expect(created.value).toMatchObject({
      invitedByUserId: owner.result.appUserId,
      deliveryStatus: "pending",
      version: 1,
    });
    await expect(
      ownerRepositories.invitations.create(createInput, createContext),
    ).rejects.toMatchObject({
      code: "repository_unavailable",
      message: "The original idempotent request has not completed.",
    });
    await expect(
      connection.db.query.idempotencyRecords.findFirst({
        where: and(
          eq(idempotencyRecords.organizationId, owner.result.organizationId),
          eq(idempotencyRecords.userId, owner.result.appUserId),
          eq(idempotencyRecords.key, createContext.idempotencyKey),
        ),
      }),
    ).resolves.toMatchObject({
      state: "pending",
      responseStatus: null,
      responseBody: null,
    });
    await expect(
      ownerRepositories.invitations.create(
        {
          email: inviteeEmail.toLocaleUpperCase("en-US"),
          role: "viewer",
          tokenHash: hashInvitationToken(opaqueToken()),
          expiresAt: new Date("2026-09-03T12:00:00.000Z"),
        },
        mutation("/invitations/duplicate", now),
      ),
    ).rejects.toMatchObject({ code: "constraint_conflict" });
    await expect(
      ownerRepositories.invitations.recordDelivery(
        created.value.id,
        created.value.version,
        { status: "sent", providerMessageId: "must-roll-back" },
        mutation(`/invitations/${created.value.id}/delivery/wrong`, now),
        {
          ...createContext,
          requestFingerprint: fingerprintRequest({ wrong: true }),
        },
      ),
    ).rejects.toMatchObject({
      code: "repository_unavailable",
      message: "The originating idempotency result could not be finalized.",
    });
    await expect(
      ownerRepositories.invitations.get(created.value.id),
    ).resolves.toMatchObject({
      deliveryStatus: "pending",
      providerMessageId: null,
      sendCount: 0,
      version: 1,
    });
    const delivered = await ownerRepositories.invitations.recordDelivery(
      created.value.id,
      created.value.version,
      { status: "sent", providerMessageId: "mail-sink-1" },
      mutation(`/invitations/${created.value.id}/delivery`, now),
      createContext,
    );
    expect(delivered.value).toMatchObject({
      deliveryStatus: "sent",
      providerMessageId: "mail-sink-1",
      sendCount: 1,
      version: 2,
    });
    await expect(
      connection.db.query.idempotencyRecords.findFirst({
        where: and(
          eq(idempotencyRecords.organizationId, owner.result.organizationId),
          eq(idempotencyRecords.userId, owner.result.appUserId),
          eq(idempotencyRecords.key, createContext.idempotencyKey),
        ),
      }),
    ).resolves.toMatchObject({
      state: "completed",
      responseStatus: 201,
      resultType: "resource",
      resultId: created.value.id,
      responseBody: {
        deliveryStatus: "sent",
        sendCount: 1,
        version: 2,
      },
    });
    const createReplay = await ownerRepositories.invitations.create(
      createInput,
      createContext,
    );
    expect(createReplay).toMatchObject({
      replayed: true,
      value: { deliveryStatus: "sent", sendCount: 1, version: 2 },
    });

    const secondTokenHash = hashInvitationToken(opaqueToken());
    const resendRepositories = createPostgresRepositories(
      connection.db,
    ).forOrganization(
      createOrganizationScope({
        organizationId: owner.result.organizationId,
        userId: owner.result.appUserId,
        requestId: "request-invite-resend",
      }),
    );
    const resendContext = {
      ...mutation(`/invitations/${created.value.id}/resend`, now),
      requestFingerprint: fingerprintRequest({
        action: "resend-invitation",
        invitationId: created.value.id,
      }),
    };
    const resendInput = {
      tokenHash: secondTokenHash,
      expiresAt: new Date("2026-09-02T12:00:00.000Z"),
    };
    const resent = await resendRepositories.invitations.resend(
      created.value.id,
      delivered.value.version,
      resendInput,
      resendContext,
    );
    expect(resent.value).toMatchObject({
      deliveryStatus: "pending",
      providerMessageId: null,
      version: 3,
    });
    await expect(
      resendRepositories.invitations.resend(
        created.value.id,
        delivered.value.version,
        resendInput,
        resendContext,
      ),
    ).rejects.toMatchObject({
      code: "repository_unavailable",
      message: "The original idempotent request has not completed.",
    });
    const redelivered = await resendRepositories.invitations.recordDelivery(
      resent.value.id,
      resent.value.version,
      { status: "sent", providerMessageId: "mail-sink-2" },
      mutation(`/invitations/${created.value.id}/delivery`, now),
      resendContext,
    );
    expect(redelivered.value).toMatchObject({
      deliveryStatus: "sent",
      providerMessageId: "mail-sink-2",
      sendCount: 2,
      version: 4,
    });
    const resendReplay = await resendRepositories.invitations.resend(
      created.value.id,
      delivered.value.version,
      resendInput,
      resendContext,
    );
    expect(resendReplay).toMatchObject({
      replayed: true,
      value: { deliveryStatus: "sent", sendCount: 2, version: 4 },
    });
    const inviteeIdentity = createPostgresRepositories(
      connection.db,
    ).forIdentity(identityScope(inviteeAuthUserId, "accept-invite"));
    await expect(
      inviteeIdentity.invitations.accept(firstTokenHash, now),
    ).rejects.toMatchObject({ code: "invitation_invalid" });
    const accepted = await inviteeIdentity.invitations.accept(
      secondTokenHash,
      now,
    );
    expect(accepted).toMatchObject({
      invitationId: created.value.id,
      organizationId: owner.result.organizationId,
      membership: { role: "member" },
    });
    await expect(
      inviteeIdentity.invitations.accept(secondTokenHash, now),
    ).rejects.toMatchObject({ code: "invitation_invalid" });
    await expect(inviteeIdentity.resolve()).resolves.toMatchObject({
      status: "active",
      organization: { id: owner.result.organizationId },
      appUser: { id: accepted.appUserId },
    });
    const stored = await connection.db.query.invitations.findFirst({
      where: eq(invitations.id, created.value.id),
    });
    expect(stored).toMatchObject({
      acceptedByUserId: accepted.appUserId,
      tokenHash: secondTokenHash,
      version: 5,
    });
  });

  it("accepts Team-scoped invitations atomically and invalidates open clients", async () => {
    const owner = await onboardOwner(`team-invite-owner-${randomUUID()}`);
    const ownerRepositories = createPostgresRepositories(
      connection.db,
    ).forOrganization(
      createOrganizationScope({
        organizationId: owner.result.organizationId,
        userId: owner.result.appUserId,
        requestId: "request-team-invite-owner",
      }),
    );
    const team = await ownerRepositories.collaboration.createTeam(
      {
        workspaceId: owner.result.workspaceId,
        name: "Invited operators",
        memberIds: [owner.result.appUserId],
      },
      mutation("/teams/invited-operators"),
    );
    const inviteeAuthUserId = `auth-team-invitee-${randomUUID()}`;
    const inviteeEmail = `${inviteeAuthUserId}@example.test`;
    await seedAuthUser({ id: inviteeAuthUserId, email: inviteeEmail });
    const tokenHash = hashInvitationToken(opaqueToken());
    const invitation = await ownerRepositories.invitations.create(
      {
        email: inviteeEmail,
        role: "member",
        tokenHash,
        expiresAt: new Date("2026-09-01T12:00:00.000Z"),
        workspaceId: owner.result.workspaceId,
        teamId: team.value.team.id,
      },
      mutation("/invitations/team"),
    );
    expect(invitation.value).toMatchObject({
      workspaceId: owner.result.workspaceId,
      teamId: team.value.team.id,
    });
    const inviteeIdentity = createPostgresRepositories(
      connection.db,
    ).forIdentity(identityScope(inviteeAuthUserId, "accept-team-invite"));
    const accepted = await inviteeIdentity.invitations.accept(
      tokenHash,
      new Date("2026-08-29T12:00:00.000Z"),
    );
    expect(accepted).toMatchObject({
      invitationId: invitation.value.id,
      organizationId: owner.result.organizationId,
      workspaceId: owner.result.workspaceId,
      teamId: team.value.team.id,
      membership: { role: "member" },
    });
    const [room] = await connection.db
      .select()
      .from(teamRooms)
      .where(
        and(
          eq(teamRooms.organizationId, owner.result.organizationId),
          eq(teamRooms.teamId, team.value.team.id),
        ),
      );
    const [workspaceGrant, teamGrant, roomGrant, updatedTeam, updatedRoom] =
      await Promise.all([
        connection.db.query.workspaceMembers.findFirst({
          where: and(
            eq(workspaceMembers.organizationId, owner.result.organizationId),
            eq(workspaceMembers.workspaceId, owner.result.workspaceId),
            eq(workspaceMembers.userId, accepted.appUserId),
          ),
        }),
        connection.db.query.teamMembers.findFirst({
          where: and(
            eq(teamMembers.organizationId, owner.result.organizationId),
            eq(teamMembers.teamId, team.value.team.id),
            eq(teamMembers.userId, accepted.appUserId),
          ),
        }),
        connection.db.query.conversationParticipants.findFirst({
          where: and(
            eq(
              conversationParticipants.organizationId,
              owner.result.organizationId,
            ),
            eq(conversationParticipants.conversationId, room!.conversationId),
            eq(conversationParticipants.userId, accepted.appUserId),
          ),
        }),
        connection.db.query.teams.findFirst({
          where: and(
            eq(teams.organizationId, owner.result.organizationId),
            eq(teams.id, team.value.team.id),
          ),
        }),
        connection.db.query.conversations.findFirst({
          where: and(
            eq(conversations.organizationId, owner.result.organizationId),
            eq(conversations.id, room!.conversationId),
          ),
        }),
      ]);
    expect(workspaceGrant).toMatchObject({
      canManage: false,
      archivedAt: null,
      deletedAt: null,
    });
    expect(teamGrant).toMatchObject({
      role: "member",
      removedAt: null,
    });
    expect(roomGrant).toMatchObject({
      participantRole: "member",
      source: "team",
      removedAt: null,
    });
    expect(updatedTeam?.version).toBe(team.value.team.version + 1);
    expect(updatedRoom?.version).toBe(2);
    expect(
      await connection.db.$count(
        collaborationEvents,
        and(
          eq(collaborationEvents.organizationId, owner.result.organizationId),
          eq(collaborationEvents.eventType, "team.membership_changed"),
          eq(collaborationEvents.aggregateId, team.value.team.id),
        ),
      ),
    ).toBe(1);
    expect(
      await connection.db.$count(
        outboxEvents,
        and(
          eq(outboxEvents.organizationId, owner.result.organizationId),
          eq(outboxEvents.eventType, "team.membership_changed"),
          eq(outboxEvents.aggregateId, team.value.team.id),
        ),
      ),
    ).toBe(1);
    await expect(
      inviteeIdentity.invitations.accept(
        tokenHash,
        new Date("2026-08-29T12:00:00.000Z"),
      ),
    ).rejects.toMatchObject({ code: "invitation_invalid" });

    const rollbackTeam = await ownerRepositories.collaboration.createTeam(
      {
        workspaceId: owner.result.workspaceId,
        name: "Missing room rollback",
        memberIds: [owner.result.appUserId],
      },
      mutation("/teams/missing-room"),
    );
    const rollbackAuthUserId = `auth-team-rollback-${randomUUID()}`;
    const rollbackEmail = `${rollbackAuthUserId}@example.test`;
    await seedAuthUser({ id: rollbackAuthUserId, email: rollbackEmail });
    const rollbackTokenHash = hashInvitationToken(opaqueToken());
    const rollbackInvitation = await ownerRepositories.invitations.create(
      {
        email: rollbackEmail,
        role: "member",
        tokenHash: rollbackTokenHash,
        expiresAt: new Date("2026-09-01T12:00:00.000Z"),
        workspaceId: owner.result.workspaceId,
        teamId: rollbackTeam.value.team.id,
      },
      mutation("/invitations/team-missing-room"),
    );
    await connection.db
      .delete(teamRooms)
      .where(
        and(
          eq(teamRooms.organizationId, owner.result.organizationId),
          eq(teamRooms.teamId, rollbackTeam.value.team.id),
        ),
      );
    await expect(
      createPostgresRepositories(connection.db)
        .forIdentity(identityScope(rollbackAuthUserId, "rollback-team-invite"))
        .invitations.accept(
          rollbackTokenHash,
          new Date("2026-08-29T12:00:00.000Z"),
        ),
    ).rejects.toMatchObject({ code: "invitation_invalid" });
    expect(
      await connection.db.$count(
        authUserMappings,
        eq(authUserMappings.authUserId, rollbackAuthUserId),
      ),
    ).toBe(0);
    await expect(
      connection.db.query.invitations.findFirst({
        where: eq(invitations.id, rollbackInvitation.value.id),
      }),
    ).resolves.toMatchObject({ acceptedAt: null, acceptedByUserId: null });
  });

  it("rolls back a Team-scoped invitation that would exceed the active member cap", async () => {
    const owner = await onboardOwner(`team-invite-cap-owner-${randomUUID()}`);
    const ownerRepositories = createPostgresRepositories(
      connection.db,
    ).forOrganization(
      createOrganizationScope({
        organizationId: owner.result.organizationId,
        userId: owner.result.appUserId,
        requestId: "request-team-invite-cap-owner",
      }),
    );
    const team = await ownerRepositories.collaboration.createTeam(
      {
        workspaceId: owner.result.workspaceId,
        name: "Full invitation Team",
        memberIds: [owner.result.appUserId],
      },
      mutation("/teams/full-invitation"),
    );
    const generatedIds = Array.from(
      { length: 249 },
      (_, index) => `team-invite-cap-member-${index}-${randomUUID()}`,
    );
    await connection.db.transaction(async (transaction) => {
      await transaction.insert(users).values(
        generatedIds.map((id) => ({
          id,
          email: `${id}@example.test`,
          name: "Capacity member",
        })),
      );
      await transaction.insert(memberships).values(
        generatedIds.map((userId) => ({
          organizationId: owner.result.organizationId,
          userId,
          role: "member" as const,
        })),
      );
      await transaction.insert(workspaceMembers).values(
        generatedIds.map((userId) => ({
          organizationId: owner.result.organizationId,
          workspaceId: owner.result.workspaceId,
          userId,
          canManage: false,
        })),
      );
      await transaction.insert(teamMembers).values(
        generatedIds.map((userId) => ({
          organizationId: owner.result.organizationId,
          workspaceId: owner.result.workspaceId,
          teamId: team.value.team.id,
          userId,
          role: "member" as const,
        })),
      );
      await transaction.insert(conversationParticipants).values(
        generatedIds.map((userId) => ({
          organizationId: owner.result.organizationId,
          workspaceId: owner.result.workspaceId,
          conversationId: team.value.room!.conversationId,
          userId,
          participantRole: "member" as const,
          source: "team" as const,
        })),
      );
    });
    const inviteeAuthUserId = `auth-team-invite-cap-${randomUUID()}`;
    const inviteeEmail = `${inviteeAuthUserId}@example.test`;
    await seedAuthUser({ id: inviteeAuthUserId, email: inviteeEmail });
    const tokenHash = hashInvitationToken(opaqueToken());
    const invitation = await ownerRepositories.invitations.create(
      {
        email: inviteeEmail,
        role: "member",
        tokenHash,
        expiresAt: new Date("2026-09-01T12:00:00.000Z"),
        workspaceId: owner.result.workspaceId,
        teamId: team.value.team.id,
      },
      mutation("/invitations/team-cap"),
    );
    await expect(
      createPostgresRepositories(connection.db)
        .forIdentity(identityScope(inviteeAuthUserId, "accept-team-cap"))
        .invitations.accept(tokenHash, new Date("2026-08-29T12:00:00.000Z")),
    ).rejects.toMatchObject({ code: "invitation_invalid" });
    expect(
      await connection.db.$count(
        authUserMappings,
        eq(authUserMappings.authUserId, inviteeAuthUserId),
      ),
    ).toBe(0);
    await expect(
      connection.db.query.invitations.findFirst({
        where: eq(invitations.id, invitation.value.id),
      }),
    ).resolves.toMatchObject({ acceptedAt: null, acceptedByUserId: null });
  });

  it("rejects expired, revoked, and wrong-email invitation acceptance without mappings", async () => {
    const owner = await onboardOwner(`invite-guard-${randomUUID()}`);
    const ownerRepositories = createPostgresRepositories(
      connection.db,
    ).forOrganization(
      createOrganizationScope({
        organizationId: owner.result.organizationId,
        userId: owner.result.appUserId,
        requestId: "request-invite-guards",
      }),
    );
    const now = new Date("2026-08-29T12:00:00.000Z");

    const expiredAuthId = `auth-expired-${randomUUID()}`;
    const expiredEmail = `${expiredAuthId}@example.test`;
    await seedAuthUser({ id: expiredAuthId, email: expiredEmail });
    const expiredHash = hashInvitationToken(opaqueToken());
    await ownerRepositories.invitations.create(
      {
        email: expiredEmail,
        role: "viewer",
        tokenHash: expiredHash,
        expiresAt: new Date("2026-08-29T13:00:00.000Z"),
      },
      mutation("/invitations/expired", now),
    );
    await expect(
      createPostgresRepositories(connection.db)
        .forIdentity(identityScope(expiredAuthId))
        .invitations.accept(expiredHash, new Date("2026-08-29T13:00:00.000Z")),
    ).rejects.toMatchObject({ code: "invitation_invalid" });

    const revokedAuthId = `auth-revoked-${randomUUID()}`;
    const revokedEmail = `${revokedAuthId}@example.test`;
    await seedAuthUser({ id: revokedAuthId, email: revokedEmail });
    const revokedHash = hashInvitationToken(opaqueToken());
    const revokedInvite = await ownerRepositories.invitations.create(
      {
        email: revokedEmail,
        role: "member",
        tokenHash: revokedHash,
        expiresAt: new Date("2026-09-01T12:00:00.000Z"),
      },
      mutation("/invitations/revoked", now),
    );
    await ownerRepositories.invitations.revoke(
      revokedInvite.value.id,
      revokedInvite.value.version,
      mutation(`/invitations/${revokedInvite.value.id}/revoke`, now),
    );
    await expect(
      createPostgresRepositories(connection.db)
        .forIdentity(identityScope(revokedAuthId))
        .invitations.accept(revokedHash, now),
    ).rejects.toMatchObject({ code: "invitation_invalid" });

    const wrongAuthId = `auth-wrong-email-${randomUUID()}`;
    await seedAuthUser({
      id: wrongAuthId,
      email: `${wrongAuthId}@example.test`,
    });
    const wrongHash = hashInvitationToken(opaqueToken());
    await ownerRepositories.invitations.create(
      {
        email: `different-${wrongAuthId}@example.test`,
        role: "member",
        tokenHash: wrongHash,
        expiresAt: new Date("2026-09-01T12:00:00.000Z"),
      },
      mutation("/invitations/wrong-email", now),
    );
    await expect(
      createPostgresRepositories(connection.db)
        .forIdentity(identityScope(wrongAuthId))
        .invitations.accept(wrongHash, now),
    ).rejects.toMatchObject({ code: "invitation_invalid" });
    expect(
      await connection.db.$count(
        authUserMappings,
        eq(authUserMappings.authUserId, wrongAuthId),
      ),
    ).toBe(0);
  });

  it("removes all tenant grants and active selection on the next request", async () => {
    const owner = await onboardOwner(`removal-owner-${randomUUID()}`);
    const ownerScope = createOrganizationScope({
      organizationId: owner.result.organizationId,
      userId: owner.result.appUserId,
      requestId: "request-remove-member",
    });
    const ownerRepositories = createPostgresRepositories(
      connection.db,
    ).forOrganization(ownerScope);
    const inviteeAuthUserId = `auth-removed-${randomUUID()}`;
    const inviteeEmail = `${inviteeAuthUserId}@example.test`;
    await seedAuthUser({ id: inviteeAuthUserId, email: inviteeEmail });
    const tokenHash = hashInvitationToken(opaqueToken());
    const invitation = await ownerRepositories.invitations.create(
      {
        email: inviteeEmail,
        role: "member",
        tokenHash,
        expiresAt: new Date("2026-09-01T12:00:00.000Z"),
      },
      mutation("/invitations/removal"),
    );
    const inviteeScope = identityScope(inviteeAuthUserId, "removed-member");
    const inviteeIdentity = createPostgresRepositories(
      connection.db,
    ).forIdentity(inviteeScope);
    const accepted = await inviteeIdentity.invitations.accept(
      tokenHash,
      new Date("2026-08-29T12:00:00.000Z"),
    );
    await connection.db.insert(portfolioMembers).values({
      organizationId: owner.result.organizationId,
      portfolioId: owner.result.portfolioId,
      userId: accepted.appUserId,
      role: "member",
    });
    await connection.db.insert(workspaceMembers).values({
      organizationId: owner.result.organizationId,
      workspaceId: owner.result.workspaceId,
      userId: accepted.appUserId,
      canManage: false,
    });
    await expect(inviteeIdentity.resolve()).resolves.toMatchObject({
      status: "active",
      portfolioIds: [owner.result.portfolioId],
      workspaceIds: [owner.result.workspaceId],
    });
    const oldTeam = await ownerRepositories.collaboration.createTeam(
      {
        workspaceId: owner.result.workspaceId,
        name: "Old private Team",
        memberIds: [owner.result.appUserId, accepted.appUserId],
        leadUserId: accepted.appUserId,
      },
      mutation("/teams/old-private"),
    );
    const replacementTeam = await ownerRepositories.collaboration.createTeam(
      {
        workspaceId: owner.result.workspaceId,
        name: "Explicit replacement Team",
        memberIds: [owner.result.appUserId],
      },
      mutation("/teams/replacement"),
    );
    const privateRoom =
      await ownerRepositories.collaboration.createConversation(
        {
          workspaceId: owner.result.workspaceId,
          title: "Old private room",
          kind: "workspace",
          visibility: "private",
          participantIds: [owner.result.appUserId, accepted.appUserId],
        },
        mutation("/conversations/old-private"),
      );
    const directRoom = await ownerRepositories.collaboration.createConversation(
      {
        workspaceId: owner.result.workspaceId,
        title: "Old direct room",
        kind: "direct",
        visibility: "private",
        participantIds: [owner.result.appUserId, accepted.appUserId],
      },
      mutation("/conversations/old-direct"),
    );
    await ownerRepositories.collaboration.setConversationParticipant(
      privateRoom.value.conversation.id,
      accepted.appUserId,
      privateRoom.value.conversation.version,
      true,
      mutation("/conversations/old-private/transfer-owner"),
      "owner",
    );
    const inviteeRepositories = createPostgresRepositories(
      connection.db,
    ).forOrganization(
      createOrganizationScope({
        organizationId: owner.result.organizationId,
        userId: accepted.appUserId,
        requestId: "request-member-private-message",
      }),
    );
    const openRequest = await inviteeRepositories.collaboration.sendMessage(
      privateRoom.value.conversation.id,
      {
        clientMessageId: "9c088ea2-41cf-46f2-8c02-a586a2a25b99",
        body: "Private state that must not survive an access replay",
        intent: "request",
        responseOwnerId: accepted.appUserId,
      },
      {
        method: "POST",
        route: `/api/v1/conversations/${privateRoom.value.conversation.id}/messages`,
        idempotencyKey: "revoked-member-private-message",
      },
    );

    await ownerRepositories.memberships.update(
      accepted.appUserId,
      { archived: true },
      mutation(`/memberships/${accepted.appUserId}/revoke`),
    );
    await expect(
      ownerRepositories.users.get(accepted.appUserId),
    ).rejects.toMatchObject({ code: "resource_not_found" });
    await expect(
      ownerRepositories.users.getMemberHistory(accepted.appUserId),
    ).resolves.toMatchObject({
      id: accepted.appUserId,
      email: inviteeEmail,
    });
    await expect(inviteeIdentity.resolve()).resolves.toMatchObject({
      status: "access_unavailable",
    });
    await expect(
      inviteeIdentity.onboarding.complete(
        onboardingInput("removed-reonboard"),
        {
          idempotencyKey: randomUUID(),
        },
      ),
    ).rejects.toMatchObject({ code: "onboarding_conflict" });
    await expect(
      createPostgresRepositories(connection.db)
        .forOrganization(
          createOrganizationScope({
            organizationId: owner.result.organizationId,
            userId: accepted.appUserId,
            requestId: "request-after-removal",
          }),
        )
        .session.resolve(),
    ).rejects.toMatchObject({ code: "resource_not_found" });
    const [portfolioGrant, workspaceGrant, selection, storedInvitation] =
      await Promise.all([
        connection.db.query.portfolioMembers.findFirst({
          where: and(
            eq(portfolioMembers.organizationId, owner.result.organizationId),
            eq(portfolioMembers.userId, accepted.appUserId),
          ),
        }),
        connection.db.query.workspaceMembers.findFirst({
          where: and(
            eq(workspaceMembers.organizationId, owner.result.organizationId),
            eq(workspaceMembers.userId, accepted.appUserId),
          ),
        }),
        connection.db.query.appUserOrganizationSelections.findFirst({
          where: eq(
            appUserOrganizationSelections.appUserId,
            accepted.appUserId,
          ),
        }),
        connection.db.query.invitations.findFirst({
          where: eq(invitations.id, invitation.value.id),
        }),
      ]);
    expect(portfolioGrant?.archivedAt).toBeInstanceOf(Date);
    expect(workspaceGrant?.archivedAt).toBeInstanceOf(Date);
    expect(selection).toBeUndefined();
    expect(storedInvitation?.acceptedByUserId).toBe(accepted.appUserId);
    const [oldTeamGrant, oldTeamRoomGrant, privateGrant, directGrant] =
      await Promise.all([
        connection.db.query.teamMembers.findFirst({
          where: and(
            eq(teamMembers.organizationId, owner.result.organizationId),
            eq(teamMembers.teamId, oldTeam.value.team.id),
            eq(teamMembers.userId, accepted.appUserId),
          ),
        }),
        connection.db.query.conversationParticipants.findFirst({
          where: and(
            eq(
              conversationParticipants.organizationId,
              owner.result.organizationId,
            ),
            eq(
              conversationParticipants.conversationId,
              oldTeam.value.room.conversationId,
            ),
            eq(conversationParticipants.userId, accepted.appUserId),
          ),
        }),
        connection.db.query.conversationParticipants.findFirst({
          where: and(
            eq(
              conversationParticipants.organizationId,
              owner.result.organizationId,
            ),
            eq(
              conversationParticipants.conversationId,
              privateRoom.value.conversation.id,
            ),
            eq(conversationParticipants.userId, accepted.appUserId),
          ),
        }),
        connection.db.query.conversationParticipants.findFirst({
          where: and(
            eq(
              conversationParticipants.organizationId,
              owner.result.organizationId,
            ),
            eq(
              conversationParticipants.conversationId,
              directRoom.value.conversation.id,
            ),
            eq(conversationParticipants.userId, accepted.appUserId),
          ),
        }),
      ]);
    expect(oldTeamGrant?.removedAt).toBeInstanceOf(Date);
    expect(oldTeamRoomGrant?.removedAt).toBeInstanceOf(Date);
    expect(privateGrant?.removedAt).toBeInstanceOf(Date);
    expect(directGrant?.removedAt).toBeInstanceOf(Date);
    await expect(
      ownerRepositories.collaboration.getTeam(oldTeam.value.team.id),
    ).resolves.toMatchObject({
      team: { archivedAt: null },
      members: [
        expect.objectContaining({
          membership: expect.objectContaining({
            userId: owner.result.appUserId,
            role: "lead",
          }),
        }),
      ],
    });
    await expect(
      ownerRepositories.collaboration.getConversation(
        privateRoom.value.conversation.id,
      ),
    ).resolves.toMatchObject({
      participants: expect.arrayContaining([
        expect.objectContaining({
          participant: expect.objectContaining({
            userId: owner.result.appUserId,
            participantRole: "owner",
          }),
        }),
      ]),
    });
    await expect(
      connection.db.query.conversationMessages.findFirst({
        where: and(
          eq(conversationMessages.organizationId, owner.result.organizationId),
          eq(conversationMessages.id, openRequest.value.message.id),
        ),
      }),
    ).resolves.toMatchObject({
      responseState: "open",
      responseOwnerId: owner.result.appUserId,
    });
    await expect(
      ownerRepositories.collaboration.sendMessage(
        directRoom.value.conversation.id,
        {
          clientMessageId: "103f060e-d7f5-4fd7-a036-50aa1d2f0229",
          body: "A one-person direct room must not remain writable",
        },
        mutation("/conversations/old-direct/messages/after-revoke"),
      ),
    ).rejects.toMatchObject({ code: "resource_not_found" });
    expect(
      await connection.db.$count(
        idempotencyRecords,
        and(
          eq(idempotencyRecords.organizationId, owner.result.organizationId),
          eq(idempotencyRecords.userId, accepted.appUserId),
          eq(idempotencyRecords.state, "completed"),
        ),
      ),
    ).toBe(0);

    const replacementTokenHash = hashInvitationToken(opaqueToken());
    await ownerRepositories.invitations.create(
      {
        email: inviteeEmail,
        role: "member",
        tokenHash: replacementTokenHash,
        expiresAt: new Date("2026-09-02T12:00:00.000Z"),
        workspaceId: owner.result.workspaceId,
        teamId: replacementTeam.value.team.id,
      },
      mutation("/invitations/replacement-team"),
    );
    await inviteeIdentity.invitations.accept(
      replacementTokenHash,
      new Date("2026-08-29T12:30:00.000Z"),
    );
    await expect(inviteeIdentity.resolve()).resolves.toMatchObject({
      status: "active",
      workspaceIds: [owner.result.workspaceId],
    });
    const reactivatedRepositories = createPostgresRepositories(
      connection.db,
    ).forOrganization(
      createOrganizationScope({
        organizationId: owner.result.organizationId,
        userId: accepted.appUserId,
        requestId: "request-reactivated-member",
      }),
    );
    await expect(
      reactivatedRepositories.collaboration.getConversation(
        oldTeam.value.room.conversationId,
      ),
    ).rejects.toMatchObject({ code: "resource_not_found" });
    await expect(
      reactivatedRepositories.collaboration.getConversation(
        privateRoom.value.conversation.id,
      ),
    ).rejects.toMatchObject({ code: "resource_not_found" });
    await expect(
      reactivatedRepositories.collaboration.getConversation(
        directRoom.value.conversation.id,
      ),
    ).rejects.toMatchObject({ code: "resource_not_found" });
    await expect(
      reactivatedRepositories.collaboration.getConversation(
        replacementTeam.value.room.conversationId,
      ),
    ).resolves.toMatchObject({
      conversation: { id: replacementTeam.value.room.conversationId },
    });
    const replacementDirect =
      await reactivatedRepositories.collaboration.createConversation(
        {
          workspaceId: owner.result.workspaceId,
          title: "Re-established direct room",
          kind: "direct",
          visibility: "private",
          participantIds: [accepted.appUserId, owner.result.appUserId],
        },
        mutation("/conversations/re-established-direct"),
      );
    expect(replacementDirect.value.conversation.id).not.toBe(
      directRoom.value.conversation.id,
    );
    const [archivedDirect] = await connection.db
      .select({ archivedAt: conversations.archivedAt })
      .from(conversations)
      .where(eq(conversations.id, directRoom.value.conversation.id));
    expect(archivedDirect?.archivedAt).toBeInstanceOf(Date);
    await expect(
      ownerRepositories.collaboration.getConversation(
        replacementDirect.value.conversation.id,
      ),
    ).resolves.toMatchObject({
      conversation: { id: replacementDirect.value.conversation.id },
    });
    const currentPrivateRoom =
      await ownerRepositories.collaboration.getConversation(
        privateRoom.value.conversation.id,
      );
    await ownerRepositories.collaboration.setConversationParticipant(
      privateRoom.value.conversation.id,
      accepted.appUserId,
      currentPrivateRoom.conversation.version,
      true,
      mutation("/conversations/old-private/explicit-readd"),
    );
    await expect(
      reactivatedRepositories.collaboration.getConversation(
        privateRoom.value.conversation.id,
      ),
    ).resolves.toMatchObject({
      conversation: { id: privateRoom.value.conversation.id },
    });
    expect(
      await connection.db.$count(
        outboxEvents,
        and(
          eq(outboxEvents.organizationId, owner.result.organizationId),
          eq(outboxEvents.eventType, "membership.revoked"),
        ),
      ),
    ).toBe(1);
    expect(
      await connection.db.$count(
        outboxEvents,
        and(
          eq(outboxEvents.organizationId, owner.result.organizationId),
          eq(outboxEvents.eventType, "team.membership_changed"),
          eq(outboxEvents.aggregateId, oldTeam.value.team.id),
        ),
      ),
    ).toBe(2);
  });

  it("hands off Team, room, and response ownership on a viewer downgrade", async () => {
    const owner = await onboardOwner(`viewer-transition-owner-${randomUUID()}`);
    const targetId = `viewer-transition-target-${randomUUID()}`;
    await connection.db.transaction(async (transaction) => {
      await transaction.insert(users).values({
        id: targetId,
        email: `${targetId}@example.test`,
        name: "Future viewer",
      });
      await transaction.insert(memberships).values({
        organizationId: owner.result.organizationId,
        userId: targetId,
        role: "member",
      });
      await transaction.insert(workspaceMembers).values({
        organizationId: owner.result.organizationId,
        workspaceId: owner.result.workspaceId,
        userId: targetId,
        canManage: false,
      });
    });
    const ownerRepositories = createPostgresRepositories(
      connection.db,
    ).forOrganization(
      createOrganizationScope({
        organizationId: owner.result.organizationId,
        userId: owner.result.appUserId,
        requestId: "request-viewer-transition-owner",
      }),
    );
    const team = await ownerRepositories.collaboration.createTeam(
      {
        workspaceId: owner.result.workspaceId,
        name: "Viewer transition Team",
        memberIds: [owner.result.appUserId, targetId],
        leadUserId: targetId,
      },
      mutation("/teams/viewer-transition"),
    );
    const room = await ownerRepositories.collaboration.createConversation(
      {
        workspaceId: owner.result.workspaceId,
        title: "Viewer transition room",
        kind: "workspace",
        visibility: "private",
        participantIds: [owner.result.appUserId, targetId],
      },
      mutation("/conversations/viewer-transition"),
    );
    const targetOwner =
      await ownerRepositories.collaboration.setConversationParticipant(
        room.value.conversation.id,
        targetId,
        room.value.conversation.version,
        true,
        mutation("/conversations/viewer-transition/owner"),
        "owner",
      );
    const request = await ownerRepositories.collaboration.sendMessage(
      room.value.conversation.id,
      {
        clientMessageId: "a172e841-8ca1-4ee1-948f-2aa1fe160022",
        body: "Ownership must be handed off",
        intent: "request",
        responseOwnerId: targetId,
      },
      mutation("/conversations/viewer-transition/messages"),
    );
    const targetRepositories = createPostgresRepositories(
      connection.db,
    ).forOrganization(
      createOrganizationScope({
        organizationId: owner.result.organizationId,
        userId: targetId,
        requestId: "request-viewer-transition-target",
      }),
    );
    const orphanRoom =
      await targetRepositories.collaboration.createConversation(
        {
          workspaceId: owner.result.workspaceId,
          title: "Viewer transition orphan room",
          kind: "workspace",
          visibility: "private",
          participantIds: [targetId],
        },
        mutation("/conversations/viewer-transition-orphan"),
      );
    const orphanRequest = await targetRepositories.collaboration.sendMessage(
      orphanRoom.value.conversation.id,
      {
        clientMessageId: "cd4bcc9f-8f94-470c-ac1a-4e1ec97cd19c",
        body: "Cancel when no authorized handoff exists",
        intent: "request",
        responseOwnerId: targetId,
      },
      mutation("/conversations/viewer-transition-orphan/messages"),
    );
    await ownerRepositories.memberships.update(
      targetId,
      { role: "viewer" },
      mutation(`/memberships/${targetId}/viewer`),
    );

    await expect(
      ownerRepositories.collaboration.getTeam(team.value.team.id),
    ).resolves.toMatchObject({
      team: { archivedAt: null },
      members: expect.arrayContaining([
        expect.objectContaining({
          membership: expect.objectContaining({
            userId: owner.result.appUserId,
            role: "lead",
          }),
        }),
        expect.objectContaining({
          membership: expect.objectContaining({
            userId: targetId,
            role: "member",
          }),
          user: expect.objectContaining({ organizationRole: "viewer" }),
        }),
      ]),
    });
    await expect(
      ownerRepositories.collaboration.getConversation(
        room.value.conversation.id,
      ),
    ).resolves.toMatchObject({
      conversation: {
        version: expect.any(Number),
      },
      participants: expect.arrayContaining([
        expect.objectContaining({
          participant: expect.objectContaining({
            userId: owner.result.appUserId,
            participantRole: "owner",
          }),
        }),
        expect.objectContaining({
          participant: expect.objectContaining({
            userId: targetId,
            participantRole: "member",
          }),
        }),
      ]),
    });
    expect(targetOwner.value.conversation.version).toBeLessThan(
      (
        await ownerRepositories.collaboration.getConversation(
          room.value.conversation.id,
        )
      ).conversation.version,
    );
    await expect(
      connection.db.query.conversationMessages.findFirst({
        where: and(
          eq(conversationMessages.organizationId, owner.result.organizationId),
          eq(conversationMessages.id, request.value.message.id),
        ),
      }),
    ).resolves.toMatchObject({
      responseState: "open",
      responseOwnerId: owner.result.appUserId,
    });
    await expect(
      connection.db.query.conversationMessages.findFirst({
        where: eq(conversationMessages.id, orphanRequest.value.message.id),
      }),
    ).resolves.toMatchObject({
      responseState: "cancelled",
      responseOwnerId: null,
    });
    await expect(
      connection.db.query.conversations.findFirst({
        where: eq(conversations.id, orphanRoom.value.conversation.id),
      }),
    ).resolves.toMatchObject({ archivedAt: expect.any(Date) });
    const viewerRepositories = createPostgresRepositories(
      connection.db,
    ).forOrganization(
      createOrganizationScope({
        organizationId: owner.result.organizationId,
        userId: targetId,
        requestId: "request-viewer-transition-viewer",
      }),
    );
    await expect(
      viewerRepositories.collaboration.sendMessage(
        team.value.room.conversationId,
        {
          clientMessageId: "581f635d-743a-4399-939f-c7f75496d701",
          body: "Viewers remain read-only",
        },
        mutation("/conversations/viewer-transition-team/messages"),
      ),
    ).rejects.toMatchObject({ code: "resource_not_found" });
  });

  it("removes internal collaboration grants when a member becomes a guest", async () => {
    const owner = await onboardOwner(`guest-transition-owner-${randomUUID()}`);
    const ownerRepositories = createPostgresRepositories(
      connection.db,
    ).forOrganization(
      createOrganizationScope({
        organizationId: owner.result.organizationId,
        userId: owner.result.appUserId,
        requestId: "request-guest-transition-owner",
      }),
    );
    const invite = async (label: string, role: "member" | "guest") => {
      const authUserId = `auth-${label}-${randomUUID()}`;
      const email = `${authUserId}@example.test`;
      await seedAuthUser({ id: authUserId, email });
      const tokenHash = hashInvitationToken(opaqueToken());
      await ownerRepositories.invitations.create(
        {
          email,
          role,
          tokenHash,
          expiresAt: new Date("2026-09-02T12:00:00.000Z"),
          workspaceId: owner.result.workspaceId,
        },
        mutation(`/invitations/${label}`),
      );
      const identity = createPostgresRepositories(connection.db).forIdentity(
        identityScope(authUserId, `${label}-accept`),
      );
      const accepted = await identity.invitations.accept(
        tokenHash,
        new Date("2026-08-29T12:00:00.000Z"),
      );
      return { authUserId, identity, appUserId: accepted.appUserId };
    };
    const target = await invite("guest-transition-target", "member");
    const externalGuest = await invite("external-room-guest", "guest");
    const team = await ownerRepositories.collaboration.createTeam(
      {
        workspaceId: owner.result.workspaceId,
        name: "Internal Team before guest transition",
        memberIds: [owner.result.appUserId, target.appUserId],
      },
      mutation("/teams/guest-transition"),
    );
    const privateRoom =
      await ownerRepositories.collaboration.createConversation(
        {
          workspaceId: owner.result.workspaceId,
          title: "Internal private room before guest transition",
          kind: "workspace",
          visibility: "private",
          participantIds: [owner.result.appUserId, target.appUserId],
        },
        mutation("/conversations/guest-transition-private"),
      );
    const directRoom = await ownerRepositories.collaboration.createConversation(
      {
        workspaceId: owner.result.workspaceId,
        title: "Internal direct room before guest transition",
        kind: "direct",
        visibility: "private",
        participantIds: [owner.result.appUserId, target.appUserId],
      },
      mutation("/conversations/guest-transition-direct"),
    );
    const targetRepositories = createPostgresRepositories(
      connection.db,
    ).forOrganization(
      createOrganizationScope({
        organizationId: owner.result.organizationId,
        userId: target.appUserId,
        requestId: "request-guest-transition-target",
      }),
    );
    const externalRoom =
      await targetRepositories.collaboration.createConversation(
        {
          workspaceId: owner.result.workspaceId,
          title: "Explicit external room",
          kind: "external",
          visibility: "guest_scoped",
          participantIds: [
            owner.result.appUserId,
            target.appUserId,
            externalGuest.appUserId,
          ],
        },
        mutation("/conversations/guest-transition-external"),
      );

    await ownerRepositories.memberships.update(
      target.appUserId,
      { role: "guest" },
      mutation(`/memberships/${target.appUserId}/role/guest`),
    );
    const [teamGrant, teamRoomGrant, privateGrant, directGrant, externalGrant] =
      await Promise.all([
        connection.db.query.teamMembers.findFirst({
          where: and(
            eq(teamMembers.organizationId, owner.result.organizationId),
            eq(teamMembers.teamId, team.value.team.id),
            eq(teamMembers.userId, target.appUserId),
          ),
        }),
        connection.db.query.conversationParticipants.findFirst({
          where: and(
            eq(
              conversationParticipants.organizationId,
              owner.result.organizationId,
            ),
            eq(
              conversationParticipants.conversationId,
              team.value.room.conversationId,
            ),
            eq(conversationParticipants.userId, target.appUserId),
          ),
        }),
        connection.db.query.conversationParticipants.findFirst({
          where: and(
            eq(
              conversationParticipants.organizationId,
              owner.result.organizationId,
            ),
            eq(
              conversationParticipants.conversationId,
              privateRoom.value.conversation.id,
            ),
            eq(conversationParticipants.userId, target.appUserId),
          ),
        }),
        connection.db.query.conversationParticipants.findFirst({
          where: and(
            eq(
              conversationParticipants.organizationId,
              owner.result.organizationId,
            ),
            eq(
              conversationParticipants.conversationId,
              directRoom.value.conversation.id,
            ),
            eq(conversationParticipants.userId, target.appUserId),
          ),
        }),
        connection.db.query.conversationParticipants.findFirst({
          where: and(
            eq(
              conversationParticipants.organizationId,
              owner.result.organizationId,
            ),
            eq(
              conversationParticipants.conversationId,
              externalRoom.value.conversation.id,
            ),
            eq(conversationParticipants.userId, target.appUserId),
          ),
        }),
      ]);
    expect(teamGrant?.removedAt).toBeInstanceOf(Date);
    expect(teamRoomGrant?.removedAt).toBeInstanceOf(Date);
    expect(privateGrant?.removedAt).toBeInstanceOf(Date);
    expect(directGrant?.removedAt).toBeInstanceOf(Date);
    expect(externalGrant).toMatchObject({
      removedAt: null,
      participantRole: "guest",
    });
    const guestRepositories = createPostgresRepositories(
      connection.db,
    ).forOrganization(
      createOrganizationScope({
        organizationId: owner.result.organizationId,
        userId: target.appUserId,
        requestId: "request-transitioned-guest",
      }),
    );
    for (const conversationId of [
      team.value.room.conversationId,
      privateRoom.value.conversation.id,
      directRoom.value.conversation.id,
    ])
      await expect(
        guestRepositories.collaboration.getConversation(conversationId),
      ).rejects.toMatchObject({ code: "resource_not_found" });
    await expect(
      guestRepositories.collaboration.getConversation(
        externalRoom.value.conversation.id,
      ),
    ).resolves.toMatchObject({
      conversation: { id: externalRoom.value.conversation.id },
    });
    const guestExternal = await guestRepositories.collaboration.getConversation(
      externalRoom.value.conversation.id,
    );
    await expect(
      guestRepositories.collaboration.setConversationParticipant(
        externalRoom.value.conversation.id,
        externalGuest.appUserId,
        guestExternal.conversation.version,
        false,
        mutation("/conversations/external/guest-manage-participants"),
      ),
    ).rejects.toMatchObject({ code: "resource_not_found" });

    await ownerRepositories.memberships.update(
      target.appUserId,
      { role: "member" },
      mutation(`/memberships/${target.appUserId}/role/member`),
    );
    const promotedExternalGrant =
      await connection.db.query.conversationParticipants.findFirst({
        where: and(
          eq(
            conversationParticipants.organizationId,
            owner.result.organizationId,
          ),
          eq(
            conversationParticipants.conversationId,
            externalRoom.value.conversation.id,
          ),
          eq(conversationParticipants.userId, target.appUserId),
        ),
      });
    expect(promotedExternalGrant?.participantRole).toBe("member");
    await expect(
      ownerRepositories.memberships.update(
        externalGuest.appUserId,
        { role: "member" },
        mutation(`/memberships/${externalGuest.appUserId}/role/member`),
      ),
    ).rejects.toMatchObject({ code: "constraint_conflict" });
    await expect(
      connection.db.query.memberships.findFirst({
        where: and(
          eq(memberships.organizationId, owner.result.organizationId),
          eq(memberships.userId, externalGuest.appUserId),
        ),
      }),
    ).resolves.toMatchObject({ role: "guest" });
    await ownerRepositories.memberships.update(
      externalGuest.appUserId,
      { archived: true },
      mutation(`/memberships/${externalGuest.appUserId}/revoke`),
    );
    await expect(
      ownerRepositories.collaboration.getConversation(
        externalRoom.value.conversation.id,
      ),
    ).rejects.toMatchObject({ code: "resource_not_found" });
    await expect(
      connection.db.query.conversations.findFirst({
        where: and(
          eq(conversations.organizationId, owner.result.organizationId),
          eq(conversations.id, externalRoom.value.conversation.id),
        ),
      }),
    ).resolves.toMatchObject({ archivedAt: expect.any(Date) });
  });
});

describe("Phase 2 migration upgrade", () => {
  it("backfills Better Auth issuers and preserves populated legacy invitations", async () => {
    const upgrade = await createTemporaryDatabase();
    try {
      await applyMigrationFiles(upgrade.url, [
        "0000_cool_loa.sql",
        "0001_adorable_sue_storm.sql",
        "0002_trevv_commercial_delta.sql",
        "0003_wandering_prowler.sql",
        "0004_workspace_domain_rename.sql",
        "0005_persistent_data_plane.sql",
      ]);
      const client = postgres(upgrade.url, { max: 1, prepare: false });
      try {
        await client.unsafe(`
          insert into "user" (
            "id", "name", "email", "emailVerified", "createdAt", "updatedAt"
          ) values (
            'auth-upgrade', 'Upgrade User', 'upgrade-auth@example.test', true,
            now(), now()
          );
          insert into "account" (
            "id", "accountId", "providerId", "userId", "password",
            "createdAt", "updatedAt"
          ) values
            (
              'account-credential', 'auth-upgrade', 'credential',
              'auth-upgrade', 'fixture-password-hash', now(), now()
            ),
            (
              'account-oauth', 'remote-account', 'oidc:legacy',
              'auth-upgrade', null, now(), now()
            );
          insert into organizations (id, name, slug)
          values ('org-auth-upgrade', 'Auth Upgrade', 'auth-upgrade');
          insert into app_users (id, email, name)
          values ('user-auth-upgrade', 'accepted@example.test', 'Accepted User');
          insert into memberships (organization_id, user_id, role)
          values ('org-auth-upgrade', 'user-auth-upgrade', 'member');
          insert into invitations (
            id, organization_id, email, role, token_hash, expires_at, accepted_at
          ) values (
            'invite-auth-upgrade', 'org-auth-upgrade', 'accepted@example.test',
            'member', 'legacy-token-format', now() + interval '1 day', now()
          );
        `);
      } finally {
        await client.end();
      }

      await applyMigrationFiles(upgrade.url, [
        "0006_wet_spirit.sql",
        "0007_normalized_app_user_email.sql",
      ]);
      const upgraded = postgres(upgrade.url, { max: 1, prepare: false });
      try {
        const accounts = await upgraded<
          Array<{ id: string; issuer: string }>
        >`select id, issuer from account order by id`;
        expect(accounts).toEqual([
          { id: "account-credential", issuer: "local:credential" },
          {
            id: "account-oauth",
            issuer: "local:oauth:oidc%3Alegacy",
          },
        ]);
        const [legacyInvitation] = await upgraded<
          Array<{ acceptedAt: Date; acceptedByUserId: string | null }>
        >`
          select
            accepted_at as "acceptedAt",
            accepted_by_user_id as "acceptedByUserId"
          from invitations
          where id = 'invite-auth-upgrade'
        `;
        expect(legacyInvitation?.acceptedAt).toBeInstanceOf(Date);
        expect(legacyInvitation?.acceptedByUserId).toBeNull();
        await expect(
          upgraded.unsafe(`
            insert into app_users (id, email, name)
            values (
              'user-auth-upgrade-duplicate',
              'ACCEPTED@EXAMPLE.TEST',
              'Duplicate User'
            )
          `),
        ).rejects.toMatchObject({ code: "23505" });
      } finally {
        await upgraded.end();
      }
    } finally {
      await upgrade.drop();
    }
  });

  it("fails closed before mapping a case-ambiguous legacy app user", async () => {
    const upgrade = await createTemporaryDatabase();
    try {
      await applyMigrationFiles(upgrade.url, [
        "0000_cool_loa.sql",
        "0001_adorable_sue_storm.sql",
        "0002_trevv_commercial_delta.sql",
        "0003_wandering_prowler.sql",
        "0004_workspace_domain_rename.sql",
        "0005_persistent_data_plane.sql",
        "0006_wet_spirit.sql",
      ]);
      const legacy = postgres(upgrade.url, { max: 1, prepare: false });
      try {
        await legacy.unsafe(`
          insert into "user" (
            "id", "name", "email", "emailVerified", "createdAt", "updatedAt"
          ) values (
            'auth-ambiguous', 'Ambiguous User', 'ambiguous@example.test', true,
            now(), now()
          );
          insert into app_users (id, email, name) values
            ('user-ambiguous-one', 'ambiguous@example.test', 'First User'),
            ('user-ambiguous-two', 'AMBIGUOUS@EXAMPLE.TEST', 'Second User');
        `);
      } finally {
        await legacy.end();
      }

      const database = createDatabase(upgrade.url);
      try {
        const identity = createPostgresRepositories(database.db).forIdentity(
          createIdentityScope({
            authUserId: "auth-ambiguous",
            requestId: "request-ambiguous",
          }),
        );
        await expect(
          identity.onboarding.complete(onboardingInput("ambiguous"), {
            idempotencyKey: "ambiguous-onboarding",
          }),
        ).rejects.toMatchObject({ code: "identity_access_unavailable" });
      } finally {
        await database.close();
      }

      await expect(
        applyMigrationFiles(upgrade.url, [
          "0007_normalized_app_user_email.sql",
        ]),
      ).rejects.toThrow(/active case-insensitive duplicates exist/u);
    } finally {
      await upgrade.drop();
    }
  });
});
