import {
  createApiClient,
  TrevvApiError,
} from "../../../packages/api-client/src/index.js";
import {
  createMemoryMailSink,
  type MemoryMailSink,
} from "@founderhq/auth-server";
import {
  appUserOrganizationSelections,
  authUserMappings,
  authUsers,
  boards,
  createDatabase,
  createPostgresRepositories,
  memberships,
  organizations,
  portfolioMembers,
  portfolios,
  users,
  workItems,
  workspaceMembers,
  workspaces,
} from "@founderhq/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApiApp } from "../src/app.js";
import { createPostgresAdapter } from "../src/postgres-adapter.js";
import {
  createTemporaryDatabase,
  migrateCurrent,
  type TemporaryDatabase,
} from "../../../packages/db/integration/database-test-helper.js";

const now = new Date("2026-08-29T12:00:00.000Z");

const fixture = {
  first: {
    organizationId: "org-api-first",
    ownerId: "user-api-first-owner",
    memberId: "user-api-first-member",
    portfolioId: "portfolio-api-first",
    emptyPortfolioId: "portfolio-api-first-empty",
    visibleWorkspaceId: "workspace-api-visible",
    hiddenWorkspaceId: "workspace-api-hidden",
    visibleBoardId: "board-api-visible",
    hiddenBoardId: "board-api-hidden",
    hiddenItemId: "item-api-hidden",
  },
  second: {
    organizationId: "org-api-second",
    ownerId: "user-api-second-owner",
    portfolioId: "portfolio-api-second",
    workspaceId: "workspace-api-second",
    boardId: "board-api-second",
    itemId: "item-api-second",
  },
} as const;

let temporary: TemporaryDatabase;
let seedConnection: ReturnType<typeof createDatabase>;

beforeAll(async () => {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
  if (!testDatabaseUrl)
    throw new Error(
      "API integration tests require TEST_DATABASE_URL; they never fall back to a demo adapter or a production DATABASE_URL.",
    );
  temporary = await createTemporaryDatabase(testDatabaseUrl);
  await migrateCurrent(temporary.url);
  seedConnection = createDatabase(temporary.url);
  await seedLiveApiFixture();
}, 120_000);

afterAll(async () => {
  await seedConnection?.close();
  await temporary?.drop();
}, 120_000);

describe("PostgreSQL-backed API", () => {
  it("returns complete Workspace detail and rollups beyond one repository page", async () => {
    const live = createLiveHarness();
    try {
      const client = clientFor(
        live.app,
        fixture.first.ownerId,
        fixture.first.organizationId,
      );
      const workspace = await client.workspace("visible");
      expect(workspace.items).toHaveLength(101);
      expect(workspace.rollup.open).toBe(101);
      await expect(client.changeRadar()).resolves.toMatchObject({
        checkpoint: { portfolioId: fixture.first.portfolioId },
        changes: [],
      });
      await expect(client.managementMemory()).resolves.toEqual({
        workspaceSnapshots: [],
        reviewRituals: [],
        decisionOutcomes: [],
      });
      await expect(client.search("Visible item 100")).resolves.toMatchObject({
        items: [expect.objectContaining({ title: "Visible item 100" })],
      });
    } finally {
      await live.close();
    }
  });

  it("resolves server-owned organization context without leaking membership or Workspace access", async () => {
    const live = createLiveHarness();
    try {
      const health = await live.app.request("/api/v1/health");
      expect(health.status).toBe(200);
      await expect(health.json()).resolves.toMatchObject({ mode: "live" });

      const unauthenticated = await live.app.request("/api/v1/session");
      expect(unauthenticated.status).toBe(401);

      const serverSelectedOrganization = await live.app.request(
        "/api/v1/session",
        {
          headers: authorization(fixture.first.memberId),
        },
      );
      expect(serverSelectedOrganization.status).toBe(200);
      await expect(serverSelectedOrganization.json()).resolves.toMatchObject({
        organizationId: fixture.first.organizationId,
      });

      const ignoredClientOrganization = await live.app.request(
        "/api/v1/session",
        {
          headers: {
            ...authorization(fixture.first.memberId),
            "x-organization-id": fixture.second.organizationId,
          },
        },
      );
      expect(ignoredClientOrganization.status).toBe(200);
      await expect(ignoredClientOrganization.json()).resolves.toMatchObject({
        organizationId: fixture.first.organizationId,
      });

      const memberClient = clientFor(
        live.app,
        fixture.first.memberId,
        fixture.first.organizationId,
      );
      await expect(memberClient.session()).resolves.toMatchObject({
        organizationId: fixture.first.organizationId,
        user: { id: fixture.first.memberId, role: "member" },
      });
      await expect(memberClient.workspaces()).resolves.toEqual([
        expect.objectContaining({ id: fixture.first.visibleWorkspaceId }),
      ]);
      await expect(memberClient.portfolios()).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: fixture.first.portfolioId }),
          expect.objectContaining({ id: fixture.first.emptyPortfolioId }),
        ]),
      );
      await expect(
        memberClient.portfolio(fixture.first.emptyPortfolioId),
      ).resolves.toMatchObject({
        portfolio: { id: fixture.first.emptyPortfolioId },
        workspaces: [],
      });

      const hiddenWorkspace = await live.app.request(
        `/api/v1/items?workspaceId=${fixture.first.hiddenWorkspaceId}`,
        {
          headers: {
            ...authorization(fixture.first.memberId),
            "x-organization-id": fixture.first.organizationId,
          },
        },
      );
      expect(hiddenWorkspace.status).toBe(404);
      await expect(errorCode(hiddenWorkspace)).resolves.toBe(
        "resource_not_found",
      );

      const crossOrganization = await live.app.request(
        `/api/v1/items/${fixture.second.itemId}`,
        {
          method: "PATCH",
          headers: {
            ...authorization(fixture.first.ownerId),
            "content-type": "application/json",
            "if-match": '"0"',
            "x-organization-id": fixture.first.organizationId,
          },
          body: JSON.stringify({ title: "Must stay invisible" }),
        },
      );
      expect(crossOrganization.status).toBe(404);
      await expect(errorCode(crossOrganization)).resolves.toBe(
        "resource_not_found",
      );

      const crossTenantSearch = await memberClient.search(
        "Second organization item",
      );
      expect(crossTenantSearch.items).toEqual([]);
      expect(crossTenantSearch.workspaces).toEqual([]);

      const organizationExport = await live.app.request(
        "/api/v1/export/organization.json",
        { headers: authorization(fixture.first.ownerId) },
      );
      expect(organizationExport.status).toBe(501);
      await expect(errorCode(organizationExport)).resolves.toBe(
        "capability_unavailable",
      );

      const ownBoardExport = await live.app.request(
        `/api/v1/export/board/${fixture.first.visibleBoardId}.csv`,
        { headers: authorization(fixture.first.ownerId) },
      );
      const crossTenantBoardExport = await live.app.request(
        `/api/v1/export/board/${fixture.second.boardId}.csv`,
        { headers: authorization(fixture.first.ownerId) },
      );
      expect(ownBoardExport.status).toBe(501);
      expect(crossTenantBoardExport.status).toBe(501);
      await expect(errorCode(ownBoardExport)).resolves.toBe(
        "capability_unavailable",
      );
      await expect(errorCode(crossTenantBoardExport)).resolves.toBe(
        "capability_unavailable",
      );

      const anonymousEvents = await live.app.request("/api/v1/events");
      expect(anonymousEvents.status).toBe(401);
      const authenticatedEvents = await live.app.request("/api/v1/events", {
        headers: authorization(fixture.first.ownerId),
      });
      expect(authenticatedEvents.status).toBe(501);
      await expect(errorCode(authenticatedEvents)).resolves.toBe(
        "capability_unavailable",
      );
    } finally {
      await live.close();
    }
  });

  it("round-trips versions and idempotency through HTTP/client across live app instances and a connection restart", async () => {
    const first = createLiveHarness();
    const statuses: number[] = [];
    const firstClient = clientFor(
      first.app,
      fixture.first.ownerId,
      fixture.first.organizationId,
      statuses,
    );
    const createKey = "00000000-0000-4000-8000-000000000101";
    const updateKey = "00000000-0000-4000-8000-000000000102";
    const createInput = {
      workspaceId: fixture.first.visibleWorkspaceId,
      boardId: fixture.first.visibleBoardId,
      title: "Durable API work",
      type: "task" as const,
      priority: "high" as const,
      status: "working" as const,
      assigneeIds: [fixture.first.ownerId],
    };

    const created = await firstClient.createItem(createInput, createKey);
    expect(created).toMatchObject({
      etag: '"0"',
      idempotencyKey: createKey,
      replayed: false,
      data: { version: 0, title: createInput.title },
    });

    const createReplay = await firstClient.createItem(createInput, createKey);
    expect(createReplay).toEqual({ ...created, replayed: true });
    expect(statuses).toEqual([201, 201]);

    const second = createLiveHarness();
    let firstClosed = false;
    const secondClient = clientFor(
      second.app,
      fixture.first.ownerId,
      fixture.first.organizationId,
    );
    try {
      const persisted = await secondClient.items({
        workspaceId: fixture.first.visibleWorkspaceId,
      });
      expect(persisted.data).toContainEqual(created.data);

      await first.close();
      firstClosed = true;

      const updated = await secondClient.updateItem(
        created.data.id,
        { title: "Durable API work, updated" },
        created.data.version,
        updateKey,
      );
      expect(updated).toMatchObject({
        etag: '"1"',
        idempotencyKey: updateKey,
        replayed: false,
        data: { id: created.data.id, version: 1 },
      });

      const updateReplay = await secondClient.updateItem(
        created.data.id,
        { title: "Durable API work, updated" },
        created.data.version,
        updateKey,
      );
      expect(updateReplay).toEqual({ ...updated, replayed: true });

      await expect(
        secondClient.updateItem(
          created.data.id,
          { title: "Durable API work, updated" },
          updated.data.version,
          updateKey,
        ),
      ).rejects.toMatchObject({
        code: "idempotency_key_reused",
        status: 409,
      } satisfies Partial<TrevvApiError>);

      await expect(
        secondClient.updateItem(
          created.data.id,
          { title: "Stale update must fail" },
          created.data.version,
          "00000000-0000-4000-8000-000000000103",
        ),
      ).rejects.toMatchObject({
        code: "version_conflict",
        status: 409,
        details: { currentVersion: 1 },
        etag: '"1"',
      } satisfies Partial<TrevvApiError>);
    } finally {
      if (!firstClosed) await first.close();
      await second.close();
    }
  });

  it("persists versioned onboarding and completes it exactly once across API instances", async () => {
    const authUserId = "auth-api-onboarding";
    await seedAuthIdentity(
      authUserId,
      "api-onboarding@example.test",
      "API Onboarding",
    );
    const first = createLiveHarness();
    try {
      const initial = await first.app.request("/api/v1/onboarding", {
        headers: authorization(authUserId),
      });
      expect(initial.status).toBe(200);
      expect(initial.headers.get("etag")).toBe('"0"');
      await expect(initial.json()).resolves.toMatchObject({
        status: "not_started",
        step: 1,
        draft: {},
        version: 0,
      });

      const missingVersion = await first.app.request("/api/v1/onboarding", {
        method: "PUT",
        headers: {
          ...authorization(authUserId),
          "content-type": "application/json",
        },
        body: JSON.stringify({
          step: 1,
          organizationName: "API Onboarding Org",
        }),
      });
      expect(missingVersion.status).toBe(428);
      await expect(errorCode(missingVersion)).resolves.toBe(
        "precondition_required",
      );

      const firstSave = await first.app.request("/api/v1/onboarding", {
        method: "PUT",
        headers: {
          ...authorization(authUserId),
          "content-type": "application/json",
          "if-match": '"0"',
        },
        body: JSON.stringify({
          step: 1,
          organizationName: "API Onboarding Org",
          organizationSlug: "api-onboarding-org",
        }),
      });
      expect(firstSave.status).toBe(200);
      expect(firstSave.headers.get("etag")).toBe('"1"');

      const secondSave = await first.app.request("/api/v1/onboarding", {
        method: "PUT",
        headers: {
          ...authorization(authUserId),
          "content-type": "application/json",
          "if-match": '"1"',
        },
        body: JSON.stringify({
          step: 3,
          workspaceName: "API Workspace",
          workspaceSlug: "api-workspace",
          workspaceType: "business",
          workspaceColor: "#123abc",
        }),
      });
      expect(secondSave.status).toBe(200);
      expect(secondSave.headers.get("etag")).toBe('"2"');
      await expect(secondSave.json()).resolves.toMatchObject({
        status: "in_progress",
        step: 3,
        version: 2,
        draft: {
          organizationName: "API Onboarding Org",
          organizationSlug: "api-onboarding-org",
          workspaceName: "API Workspace",
          workspaceSlug: "api-workspace",
        },
      });

      const staleSave = await first.app.request("/api/v1/onboarding", {
        method: "PUT",
        headers: {
          ...authorization(authUserId),
          "content-type": "application/json",
          "if-match": '"1"',
        },
        body: JSON.stringify({ step: 4, blueprintKey: "blank" }),
      });
      expect(staleSave.status).toBe(409);
      expect(staleSave.headers.get("etag")).toBe('"2"');
      await expect(errorCode(staleSave)).resolves.toBe("version_conflict");

      const completionKey = "00000000-0000-4000-8000-000000000201";
      const completionBody = {
        step: 5,
        organizationName: "API Onboarding Org",
        organizationSlug: "api-onboarding-org",
        workspaceName: "API Workspace",
        workspaceSlug: "api-workspace",
        workspaceType: "business",
        workspaceColor: "#123abc",
        blueprintKey: "operating_business",
      } as const;
      const completed = await first.app.request("/api/v1/onboarding/complete", {
        method: "POST",
        headers: {
          ...authorization(authUserId),
          "content-type": "application/json",
          "idempotency-key": completionKey,
        },
        body: JSON.stringify(completionBody),
      });
      expect(completed.status).toBe(201);
      expect(completed.headers.get("idempotency-replayed")).toBe("false");
      const completedBody = (await completed.json()) as Record<string, unknown>;
      expect(completedBody).toMatchObject({
        status: "completed",
        step: 5,
        version: 3,
        organizationId: expect.any(String),
        portfolioId: expect.any(String),
        workspaceId: expect.any(String),
        boardId: expect.any(String),
        blueprintInstanceId: expect.any(String),
      });

      const second = createLiveHarness();
      try {
        const replay = await second.app.request("/api/v1/onboarding/complete", {
          method: "POST",
          headers: {
            ...authorization(authUserId),
            "content-type": "application/json",
            "idempotency-key": completionKey,
          },
          body: JSON.stringify(completionBody),
        });
        expect(replay.status).toBe(201);
        expect(replay.headers.get("idempotency-replayed")).toBe("true");
        await expect(replay.json()).resolves.toEqual(completedBody);

        const session = await second.app.request("/api/v1/session", {
          headers: authorization(authUserId),
        });
        expect(session.status).toBe(200);
        await expect(session.json()).resolves.toMatchObject({
          organizationId: completedBody.organizationId,
          user: { email: "api-onboarding@example.test", role: "owner" },
        });

        const conflictingCompletion = await second.app.request(
          "/api/v1/onboarding/complete",
          {
            method: "POST",
            headers: {
              ...authorization(authUserId),
              "content-type": "application/json",
              "idempotency-key": completionKey,
            },
            body: JSON.stringify({
              ...completionBody,
              workspaceName: "Different Workspace",
            }),
          },
        );
        expect(conflictingCompletion.status).toBe(409);
        await expect(errorCode(conflictingCompletion)).resolves.toBe(
          "onboarding_conflict",
        );
      } finally {
        await second.close();
      }
    } finally {
      await first.close();
    }
  });

  it("switches organization context only through validated server-owned membership", async () => {
    const switcherId = "user-api-switcher";
    await seedMappedIdentity({
      id: switcherId,
      email: "api-switcher@example.test",
      name: "API Switcher",
      memberships: [
        { organizationId: fixture.first.organizationId, role: "member" },
        { organizationId: fixture.second.organizationId, role: "member" },
      ],
    });
    const live = createLiveHarness();
    try {
      const client = clientFor(
        live.app,
        switcherId,
        fixture.first.organizationId,
      );
      await expect(client.session()).rejects.toMatchObject({
        code: "organization_selection_required",
        status: 409,
      } satisfies Partial<TrevvApiError>);
      await expect(client.organizations()).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: fixture.first.organizationId }),
          expect.objectContaining({ id: fixture.second.organizationId }),
        ]),
      );

      await expect(
        client.selectOrganization(fixture.first.organizationId),
      ).resolves.toMatchObject({
        organizationId: fixture.first.organizationId,
      });

      await expect(
        client.selectOrganization(fixture.second.organizationId),
      ).resolves.toMatchObject({
        organizationId: fixture.second.organizationId,
      });
      await expect(client.session()).resolves.toMatchObject({
        organizationId: fixture.second.organizationId,
      });

      const guessed = await live.app.request("/api/v1/session/organization", {
        method: "POST",
        headers: {
          ...authorization(switcherId),
          "content-type": "application/json",
        },
        body: JSON.stringify({ organizationId: "org-api-guessed" }),
      });
      expect(guessed.status).toBe(404);
      await expect(errorCode(guessed)).resolves.toBe("resource_not_found");
      await expect(client.session()).resolves.toMatchObject({
        organizationId: fixture.second.organizationId,
      });
    } finally {
      await live.close();
    }
  });

  it("enforces invitation and membership roles, never leaks tokens, and removes access on the next request", async () => {
    const inviteeAuthId = "auth-api-invitee";
    const inviteeEmail = "api-invitee@example.test";
    await seedAuthIdentity(inviteeAuthId, inviteeEmail, "API Invitee");
    const live = createLiveHarness();
    try {
      const memberClient = clientFor(
        live.app,
        fixture.first.memberId,
        fixture.first.organizationId,
      );
      await expect(memberClient.invitations()).rejects.toMatchObject({
        code: "resource_not_found",
        status: 404,
      } satisfies Partial<TrevvApiError>);
      await expect(
        memberClient.createInvitation(
          { email: "blocked-invite@example.test", role: "member" },
          "00000000-0000-4000-8000-000000000301",
        ),
      ).rejects.toMatchObject({
        code: "resource_not_found",
        status: 404,
      } satisfies Partial<TrevvApiError>);
      await expect(memberClient.memberships()).rejects.toMatchObject({
        code: "resource_not_found",
        status: 404,
      } satisfies Partial<TrevvApiError>);

      const ownerClient = clientFor(
        live.app,
        fixture.first.ownerId,
        fixture.first.organizationId,
      );
      const invitationKey = "00000000-0000-4000-8000-000000000302";
      const createdMutation = await ownerClient.createInvitation(
        { email: inviteeEmail.toUpperCase(), role: "member" },
        invitationKey,
      );
      expect(createdMutation).toMatchObject({
        etag: expect.stringMatching(/^"\d+"$/u),
        idempotencyKey: invitationKey,
        replayed: false,
      });
      const created = createdMutation.data;
      expect(created).toMatchObject({
        organizationId: fixture.first.organizationId,
        email: inviteeEmail,
        role: "member",
        status: "pending",
        deliveryStatus: "sent",
      });
      expect(JSON.stringify(created)).not.toMatch(/token/i);
      expect(live.mail.messages()).toHaveLength(1);
      const rawToken = invitationTokenFromMail(live.mail);
      expect(JSON.stringify(await ownerClient.invitations())).not.toContain(
        rawToken,
      );

      const replayed = await ownerClient.createInvitation(
        { email: inviteeEmail, role: "member" },
        invitationKey,
      );
      expect(replayed).toEqual({ ...createdMutation, replayed: true });
      expect(live.mail.messages()).toHaveLength(1);

      const wrongIdentityClient = clientFor(
        live.app,
        fixture.second.ownerId,
        fixture.second.organizationId,
      );
      await expect(
        wrongIdentityClient.acceptInvitation(rawToken),
      ).rejects.toMatchObject({
        code: "resource_not_found",
        status: 404,
      } satisfies Partial<TrevvApiError>);

      const crossTenantRevoke = await live.app.request(
        `/api/v1/invitations/${created.id}`,
        {
          method: "DELETE",
          headers: {
            ...authorization(fixture.second.ownerId),
            "if-match": `"${created.version}"`,
            "idempotency-key": "00000000-0000-4000-8000-000000000303",
          },
        },
      );
      expect(crossTenantRevoke.status).toBe(404);
      await expect(errorCode(crossTenantRevoke)).resolves.toBe(
        "resource_not_found",
      );

      const inviteeClient = clientFor(
        live.app,
        inviteeAuthId,
        fixture.first.organizationId,
      );
      await expect(
        inviteeClient.acceptInvitation(rawToken),
      ).resolves.toMatchObject({
        invitationId: created.id,
        organizationId: fixture.first.organizationId,
        role: "member",
      });
      await expect(
        inviteeClient.acceptInvitation(rawToken),
      ).rejects.toMatchObject({
        code: "resource_not_found",
        status: 404,
      } satisfies Partial<TrevvApiError>);
      await expect(inviteeClient.session()).resolves.toMatchObject({
        organizationId: fixture.first.organizationId,
        user: { email: inviteeEmail, role: "member" },
      });

      const accepted = await ownerClient.invitations();
      expect(accepted).toContainEqual(
        expect.objectContaining({ id: created.id, status: "accepted" }),
      );
      expect(JSON.stringify(accepted)).not.toContain(rawToken);
      const acceptedMembership = (await ownerClient.memberships()).find(
        (membership) => membership.user.email === inviteeEmail,
      );
      expect(acceptedMembership).toMatchObject({
        role: "member",
        active: true,
      });
      if (!acceptedMembership)
        throw new Error("Accepted invitation did not create a membership.");

      const removalKey = "00000000-0000-4000-8000-000000000304";
      const removed = await ownerClient.updateMembership(
        acceptedMembership.user.id,
        { active: false },
        removalKey,
      );
      expect(removed).toMatchObject({
        idempotencyKey: "00000000-0000-4000-8000-000000000304",
        replayed: false,
        data: { active: false },
      });
      await expect(
        ownerClient.updateMembership(
          acceptedMembership.user.id,
          { active: false },
          removalKey,
        ),
      ).resolves.toEqual({ ...removed, replayed: true });
      await expect(inviteeClient.session()).rejects.toMatchObject({
        code: "identity_access_unavailable",
        status: 403,
      } satisfies Partial<TrevvApiError>);
      const removedMemberEvents = await live.app.request("/api/v1/events", {
        headers: authorization(inviteeAuthId),
      });
      expect(removedMemberEvents.status).toBe(403);
      await expect(errorCode(removedMemberEvents)).resolves.toBe(
        "identity_access_unavailable",
      );

      await expect(
        ownerClient.updateMembership(
          fixture.second.ownerId,
          { active: false },
          "00000000-0000-4000-8000-000000000305",
        ),
      ).rejects.toMatchObject({
        code: "resource_not_found",
        status: 404,
      } satisfies Partial<TrevvApiError>);
    } finally {
      await live.close();
    }
  });
});

function createLiveHarness() {
  const connection = createDatabase(temporary.url);
  const repositories = createPostgresRepositories(connection.db);
  const mail = createMemoryMailSink();
  const resolveAuthIdentity = async (request: Request) => {
    const authUserId = bearerToken(request);
    return authUserId
      ? {
          authUserId,
          email: `${authUserId}@identity.test`,
          name: authUserId,
          emailVerified: true,
          sessionId: `session-${authUserId}`,
          expiresAt: new Date(now.getTime() + 3_600_000),
        }
      : null;
  };
  const adapter = createPostgresAdapter({
    repositories,
    async resolveIdentity(request) {
      const authUserId = bearerToken(request);
      return authUserId
        ? {
            authUserId,
            expiresAt: new Date(now.getTime() + 3_600_000),
          }
        : null;
    },
  });
  return {
    app: createApiApp({
      mode: "live",
      ...adapter,
      clock: () => now,
      authIdentityResolver: { resolve: resolveAuthIdentity },
      preMembershipPaths: [
        "/api/v1/session/organizations",
        "/api/v1/session/organization",
        "/api/v1/onboarding",
        "/api/v1/onboarding/complete",
        "/api/v1/invitations/accept",
      ],
      repositories,
      mailDelivery: mail,
      mailFrom: "no-reply@trevv.test",
      webOrigin: "http://web.trevv.test",
    }),
    mail,
    close: connection.close,
  };
}

function clientFor(
  app: ReturnType<typeof createApiApp>,
  userId: string,
  _organizationId: string,
  statuses?: number[],
) {
  return createApiClient({
    baseUrl: "http://trevv.test/api/v1",
    getAccessToken: async () => userId,
    fetchImpl: async (input, init) => {
      const response = await app.request(input, init);
      statuses?.push(response.status);
      return response;
    },
  });
}

function authorization(userId: string) {
  return { authorization: `Bearer ${userId}` };
}

function bearerToken(request: Request): string | undefined {
  return request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
}

function invitationTokenFromMail(mail: MemoryMailSink): string {
  const message = mail.messages().at(-1);
  const url = message?.text.match(/https?:\/\/\S+/u)?.[0];
  const token = url ? new URL(url).searchParams.get("token") : null;
  if (!token) throw new Error("Invitation delivery did not include a token.");
  return token;
}

async function errorCode(response: Response): Promise<string | undefined> {
  const body = (await response.json()) as { error?: { code?: string } };
  return body.error?.code;
}

async function seedAuthIdentity(id: string, email: string, name: string) {
  await seedConnection.db.insert(authUsers).values({
    id,
    email,
    name,
    emailVerified: true,
  });
}

async function seedMappedIdentity(input: {
  id: string;
  email: string;
  name: string;
  memberships: Array<{
    organizationId: string;
    role: "owner" | "admin" | "workspace_lead" | "member" | "guest" | "viewer";
  }>;
  selectedOrganizationId?: string;
}) {
  await seedConnection.db.transaction(async (transaction) => {
    await transaction.insert(users).values({
      id: input.id,
      email: input.email,
      name: input.name,
    });
    await transaction.insert(authUsers).values({
      id: input.id,
      email: input.email,
      name: input.name,
      emailVerified: true,
    });
    await transaction.insert(authUserMappings).values({
      authUserId: input.id,
      appUserId: input.id,
    });
    await transaction.insert(memberships).values(
      input.memberships.map((membership) => ({
        ...membership,
        userId: input.id,
      })),
    );
    if (input.selectedOrganizationId)
      await transaction.insert(appUserOrganizationSelections).values({
        appUserId: input.id,
        organizationId: input.selectedOrganizationId,
      });
  });
}

async function seedLiveApiFixture(): Promise<void> {
  const { first, second } = fixture;
  await seedConnection.db.transaction(async (transaction) => {
    await transaction.insert(organizations).values([
      { id: first.organizationId, name: "First Org", slug: "api-first" },
      { id: second.organizationId, name: "Second Org", slug: "api-second" },
    ]);
    await transaction.insert(users).values([
      {
        id: first.ownerId,
        email: "api-first-owner@example.test",
        name: "First Owner",
      },
      {
        id: first.memberId,
        email: "api-first-member@example.test",
        name: "First Member",
      },
      {
        id: second.ownerId,
        email: "api-second-owner@example.test",
        name: "Second Owner",
      },
    ]);
    await transaction.insert(authUsers).values([
      {
        id: first.ownerId,
        email: "api-first-owner@example.test",
        name: "First Owner",
        emailVerified: true,
      },
      {
        id: first.memberId,
        email: "api-first-member@example.test",
        name: "First Member",
        emailVerified: true,
      },
      {
        id: second.ownerId,
        email: "api-second-owner@example.test",
        name: "Second Owner",
        emailVerified: true,
      },
    ]);
    await transaction.insert(authUserMappings).values([
      { authUserId: first.ownerId, appUserId: first.ownerId },
      { authUserId: first.memberId, appUserId: first.memberId },
      { authUserId: second.ownerId, appUserId: second.ownerId },
    ]);
    await transaction.insert(memberships).values([
      {
        organizationId: first.organizationId,
        userId: first.ownerId,
        role: "owner",
      },
      {
        organizationId: first.organizationId,
        userId: first.memberId,
        role: "member",
      },
      {
        organizationId: second.organizationId,
        userId: second.ownerId,
        role: "owner",
      },
    ]);
    await transaction.insert(appUserOrganizationSelections).values([
      {
        appUserId: first.ownerId,
        organizationId: first.organizationId,
      },
      {
        appUserId: first.memberId,
        organizationId: first.organizationId,
      },
      {
        appUserId: second.ownerId,
        organizationId: second.organizationId,
      },
    ]);
    await transaction.insert(portfolios).values([
      {
        id: first.portfolioId,
        organizationId: first.organizationId,
        name: "First Portfolio",
        slug: "first",
        isDefault: true,
      },
      {
        id: first.emptyPortfolioId,
        organizationId: first.organizationId,
        name: "Empty Portfolio",
        slug: "empty",
      },
      {
        id: second.portfolioId,
        organizationId: second.organizationId,
        name: "Second Portfolio",
        slug: "second",
        isDefault: true,
      },
    ]);
    await transaction.insert(portfolioMembers).values({
      organizationId: first.organizationId,
      portfolioId: first.emptyPortfolioId,
      userId: first.memberId,
      role: "member",
    });
    await transaction.insert(workspaces).values([
      {
        id: first.visibleWorkspaceId,
        organizationId: first.organizationId,
        portfolioId: first.portfolioId,
        name: "Visible Workspace",
        slug: "visible",
        type: "business",
        accentColor: "#123456",
        icon: "V",
        lifecycleStage: "build",
        health: "on_track",
        leadUserId: first.ownerId,
      },
      {
        id: first.hiddenWorkspaceId,
        organizationId: first.organizationId,
        portfolioId: first.portfolioId,
        name: "Hidden Workspace",
        slug: "hidden",
        type: "business",
        accentColor: "#654321",
        icon: "H",
        lifecycleStage: "build",
        health: "watch",
        leadUserId: first.ownerId,
      },
      {
        id: second.workspaceId,
        organizationId: second.organizationId,
        portfolioId: second.portfolioId,
        name: "Second Workspace",
        slug: "second",
        type: "business",
        accentColor: "#abcdef",
        icon: "S",
        lifecycleStage: "build",
        health: "on_track",
        leadUserId: second.ownerId,
      },
    ]);
    await transaction.insert(workspaceMembers).values({
      organizationId: first.organizationId,
      workspaceId: first.visibleWorkspaceId,
      userId: first.memberId,
      canManage: false,
    });
    await transaction.insert(boards).values([
      {
        id: first.visibleBoardId,
        organizationId: first.organizationId,
        workspaceId: first.visibleWorkspaceId,
        name: "Visible Board",
      },
      {
        id: first.hiddenBoardId,
        organizationId: first.organizationId,
        workspaceId: first.hiddenWorkspaceId,
        name: "Hidden Board",
      },
      {
        id: second.boardId,
        organizationId: second.organizationId,
        workspaceId: second.workspaceId,
        name: "Second Board",
      },
    ]);
    await transaction.insert(workItems).values([
      ...Array.from({ length: 101 }, (_, index) => ({
        id: `item-api-visible-${String(index).padStart(3, "0")}`,
        organizationId: first.organizationId,
        workspaceId: first.visibleWorkspaceId,
        boardId: first.visibleBoardId,
        title: `Visible item ${index + 1}`,
        itemType: "task" as const,
        priority: "normal" as const,
        status: "working" as const,
        creatorId: first.ownerId,
      })),
      {
        id: first.hiddenItemId,
        organizationId: first.organizationId,
        workspaceId: first.hiddenWorkspaceId,
        boardId: first.hiddenBoardId,
        title: "Hidden item",
        itemType: "task",
        priority: "normal",
        status: "working",
        creatorId: first.ownerId,
      },
      {
        id: second.itemId,
        organizationId: second.organizationId,
        workspaceId: second.workspaceId,
        boardId: second.boardId,
        title: "Second organization item",
        itemType: "task",
        priority: "normal",
        status: "working",
        creatorId: second.ownerId,
      },
    ]);
  });
}
