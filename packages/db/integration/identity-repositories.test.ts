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
    expect(
      await connection.db.$count(
        outboxEvents,
        and(
          eq(outboxEvents.organizationId, owner.result.organizationId),
          eq(outboxEvents.eventType, "membership.revoked"),
        ),
      ),
    ).toBe(1);
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

      await applyMigrationFiles(upgrade.url, ["0006_wet_spirit.sql"]);
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
      } finally {
        await upgraded.end();
      }
    } finally {
      await upgrade.drop();
    }
  });
});
