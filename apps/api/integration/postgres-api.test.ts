import {
  createApiClient,
  TrevvApiError,
} from "../../../packages/api-client/src/index.js";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import {
  createMemoryMailSink,
  type MemoryMailSink,
} from "@founderhq/auth-server";
import {
  appUserOrganizationSelections,
  auditLogs,
  authUserMappings,
  authUsers,
  boards,
  createDatabase,
  createPostgresRepositories,
  hashInvitationToken,
  invitations,
  memberships,
  organizations,
  outboxEvents,
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

  it("preserves preset versus explicit Team feature provenance", async () => {
    const live = createLiveHarness();
    try {
      const client = clientFor(
        live.app,
        fixture.first.ownerId,
        fixture.first.organizationId,
      );
      const preset = await client.createTeam(
        {
          workspaceId: fixture.first.visibleWorkspaceId,
          name: "API preset Team",
          purpose: "Verify preset policy provenance.",
          preset: "technology",
          memberIds: [fixture.first.ownerId],
        },
        "00000000-0000-4000-8000-000000000401",
      );
      expect(preset.data).toMatchObject({
        preset: "technology",
        featurePolicySource: "preset",
        featureCapabilities: expect.arrayContaining(["work", "messages"]),
      });
      const emptyOverride = await client.createTeam(
        {
          workspaceId: fixture.first.visibleWorkspaceId,
          name: "API empty override Team",
          purpose: "Verify explicit empty policy provenance.",
          preset: "technology",
          featureCapabilities: [],
          memberIds: [fixture.first.ownerId],
        },
        "00000000-0000-4000-8000-000000000402",
      );
      expect(emptyOverride.data).toMatchObject({
        preset: "technology",
        featurePolicySource: "override",
        featureCapabilities: [],
      });
    } finally {
      await live.close();
    }
  });

  it("lets organization managers create Portfolios and durably edit Workspaces", async () => {
    const live = createLiveHarness();
    const ownerClient = clientFor(
      live.app,
      fixture.first.ownerId,
      fixture.first.organizationId,
    );
    const memberClient = clientFor(
      live.app,
      fixture.first.memberId,
      fixture.first.organizationId,
    );
    const keys = {
      portfolio: "00000000-0000-4000-8000-000000000421",
      workspace: "00000000-0000-4000-8000-000000000422",
      update: "00000000-0000-4000-8000-000000000423",
      staleUpdate: "00000000-0000-4000-8000-000000000424",
      memberPortfolio: "00000000-0000-4000-8000-000000000425",
      memberUpdate: "00000000-0000-4000-8000-000000000426",
    } as const;

    try {
      const portfolioInput = {
        name: "Operating Portfolio",
        slug: "operating-portfolio",
        description: "Owner-managed Portfolio coverage.",
        isDefault: false,
      };
      const createdPortfolio = await ownerClient.createPortfolio(
        portfolioInput,
        keys.portfolio,
      );
      expect(createdPortfolio).toMatchObject({
        idempotencyKey: keys.portfolio,
        replayed: false,
        data: portfolioInput,
      });
      await expect(
        ownerClient.createPortfolio(portfolioInput, keys.portfolio),
      ).resolves.toEqual({ ...createdPortfolio, replayed: true });

      await expect(
        memberClient.createPortfolio(
          {
            name: "Member Portfolio",
            slug: "member-portfolio",
            description: "Must not be created.",
            isDefault: false,
          },
          keys.memberPortfolio,
        ),
      ).rejects.toMatchObject({
        code: "resource_not_found",
        status: 404,
      } satisfies Partial<TrevvApiError>);

      const workspaceInput = {
        portfolioId: createdPortfolio.data.id,
        name: "Editable Workspace",
        slug: "editable-workspace",
        description: "Initial Workspace settings.",
        type: "project" as const,
        accent: "#5b56db",
        icon: "E",
        stage: "idea" as const,
        health: "on_track" as const,
        healthNote: "",
        priority: "Establish the operating rhythm",
        initialBoardName: "Editable Workspace Board",
      };
      const createdWorkspace = await ownerClient.createWorkspace(
        workspaceInput,
        keys.workspace,
      );
      expect(createdWorkspace).toMatchObject({
        idempotencyKey: keys.workspace,
        replayed: false,
        data: {
          workspace: {
            portfolioId: createdPortfolio.data.id,
            slug: workspaceInput.slug,
            versionTag: expect.any(String),
          },
          board: { name: workspaceInput.initialBoardName },
        },
      });

      const original = createdWorkspace.data.workspace;
      const updateInput = {
        name: "Edited Workspace",
        slug: "edited-workspace",
        description: "Durably edited Workspace settings.",
        stage: "build" as const,
        health: "watch" as const,
        healthNote: "A dependency needs active management.",
        priority: "Resolve the launch dependency",
        nextMilestoneTitle: "Launch readiness review",
        nextMilestoneDate: "2026-09-30",
      };
      const updated = await ownerClient.updateWorkspace(
        original.id,
        updateInput,
        original.versionTag,
        keys.update,
      );
      expect(updated).toMatchObject({
        idempotencyKey: keys.update,
        replayed: false,
        data: {
          id: original.id,
          name: updateInput.name,
          slug: updateInput.slug,
          description: updateInput.description,
          stage: updateInput.stage,
          health: updateInput.health,
          healthNote: updateInput.healthNote,
          priority: updateInput.priority,
          versionTag: expect.any(String),
          nextMilestone: {
            title: updateInput.nextMilestoneTitle,
            date: updateInput.nextMilestoneDate,
          },
        },
      });
      expect(updated.etag).toBe(`"${updated.data.versionTag}"`);
      expect(updated.data.versionTag).not.toBe(original.versionTag);
      await expect(
        ownerClient.updateWorkspace(
          original.id,
          updateInput,
          original.versionTag,
          keys.update,
        ),
      ).resolves.toEqual({ ...updated, replayed: true });
      await expect(
        ownerClient.updateWorkspace(
          updated.data.id,
          { priority: "A stale update must not replace the saved value." },
          original.versionTag,
          keys.staleUpdate,
        ),
      ).rejects.toMatchObject({
        code: "version_conflict",
        status: 409,
      } satisfies Partial<TrevvApiError>);
      await expect(
        memberClient.updateWorkspace(
          updated.data.id,
          { priority: "A member must not change Workspace settings." },
          updated.data.versionTag,
          keys.memberUpdate,
        ),
      ).rejects.toMatchObject({
        code: "resource_not_found",
        status: 404,
      } satisfies Partial<TrevvApiError>);
      await expect(
        ownerClient.workspace(updated.data.slug),
      ).resolves.toMatchObject({
        workspace: {
          id: original.id,
          priority: updateInput.priority,
          versionTag: updated.data.versionTag,
        },
      });
    } finally {
      await live.close();
    }
  });

  it("enforces the composed collaboration authorization matrix through live HTTP", async () => {
    const identities = {
      owner: fixture.first.ownerId,
      admin: "user-api-authz-admin",
      lead: "user-api-authz-lead",
      member: fixture.first.memberId,
      guest: "user-api-authz-guest",
      viewer: "user-api-authz-viewer",
      removed: "user-api-authz-removed",
    } as const;
    for (const [role, userId] of [
      ["admin", identities.admin],
      ["workspace_lead", identities.lead],
      ["guest", identities.guest],
      ["viewer", identities.viewer],
    ] as const) {
      await seedMappedIdentity({
        id: userId,
        email: `api-authz-${role}@example.test`,
        name: `API Authz ${role}`,
        memberships: [
          {
            organizationId: fixture.first.organizationId,
            role,
          },
        ],
        selectedOrganizationId: fixture.first.organizationId,
      });
    }
    await seedMappedIdentity({
      id: identities.removed,
      email: "api-authz-removed@example.test",
      name: "API Authz Removed",
      memberships: [
        { organizationId: fixture.first.organizationId, role: "member" },
      ],
      selectedOrganizationId: fixture.first.organizationId,
    });
    await seedConnection.db.insert(workspaceMembers).values([
      {
        organizationId: fixture.first.organizationId,
        workspaceId: fixture.first.visibleWorkspaceId,
        userId: identities.lead,
        canManage: true,
      },
      ...[identities.guest, identities.viewer, identities.removed].map(
        (userId) => ({
          organizationId: fixture.first.organizationId,
          workspaceId: fixture.first.visibleWorkspaceId,
          userId,
          canManage: false,
        }),
      ),
    ]);

    const live = createLiveHarness();
    try {
      const ownerClient = clientFor(
        live.app,
        identities.owner,
        fixture.first.organizationId,
      );
      const team = await ownerClient.createTeam(
        {
          workspaceId: fixture.first.visibleWorkspaceId,
          name: "HTTP authorization Team",
          purpose: "Exercise the complete live HTTP authorization chain.",
          preset: "technology",
          leadUserId: identities.lead,
          memberIds: [
            identities.owner,
            identities.lead,
            identities.member,
            identities.viewer,
          ],
        },
        "00000000-0000-4000-8000-000000000411",
      );
      const teamRoomId = team.data.room?.conversationId;
      if (!teamRoomId)
        throw new Error("The authorization Team did not create its room.");

      const createConversation = (
        input: Parameters<typeof ownerClient.createConversation>[0],
        idempotencyKey: string,
      ) => ownerClient.createConversation(input, idempotencyKey);
      const workspaceRoom = await createConversation(
        {
          workspaceId: fixture.first.visibleWorkspaceId,
          title: "HTTP organization room",
          purpose: "Organization-visible authorization coverage.",
          kind: "workspace",
          visibility: "organization",
          participantIds: [identities.owner],
          retentionDays: 365,
        },
        "00000000-0000-4000-8000-000000000412",
      );
      const privateRoom = await createConversation(
        {
          workspaceId: fixture.first.visibleWorkspaceId,
          title: "HTTP private room",
          purpose: "Private participant authorization coverage.",
          kind: "workspace",
          visibility: "private",
          participantIds: [
            identities.owner,
            identities.lead,
            identities.member,
            identities.viewer,
            identities.removed,
          ],
          retentionDays: 365,
        },
        "00000000-0000-4000-8000-000000000413",
      );
      const directRoom = await createConversation(
        {
          workspaceId: fixture.first.visibleWorkspaceId,
          title: "HTTP direct room",
          purpose: "Direct participant authorization coverage.",
          kind: "direct",
          visibility: "private",
          participantIds: [identities.owner, identities.member],
          retentionDays: 365,
        },
        "00000000-0000-4000-8000-000000000414",
      );
      const externalRoom = await createConversation(
        {
          workspaceId: fixture.first.visibleWorkspaceId,
          title: "HTTP external room",
          purpose: "Guest-scoped authorization coverage.",
          kind: "external",
          visibility: "guest_scoped",
          participantIds: [identities.owner, identities.guest],
          retentionDays: 365,
        },
        "00000000-0000-4000-8000-000000000415",
      );

      const roomIds = {
        workspace: workspaceRoom.data.id,
        team: teamRoomId,
        private: privateRoom.data.id,
        direct: directRoom.data.id,
        external: externalRoom.data.id,
      } as const;
      const readMatrix = {
        owner: ["workspace", "team", "private", "direct", "external"],
        admin: ["workspace"],
        lead: ["workspace", "team", "private"],
        member: ["workspace", "team", "private", "direct"],
        guest: ["external"],
        viewer: ["workspace", "team", "private"],
      } as const;
      for (const [role, userId] of Object.entries(identities)) {
        if (role === "removed") continue;
        const allowed = new Set<string>(
          readMatrix[role as keyof typeof readMatrix],
        );
        for (const [roomKind, conversationId] of Object.entries(roomIds)) {
          const response = await live.app.request(
            `/api/v1/conversations/${conversationId}`,
            { headers: authorization(userId) },
          );
          const expectedStatus = allowed.has(roomKind) ? 200 : 404;
          expect(
            response.status,
            `${role} read status for ${roomKind} room`,
          ).toBe(expectedStatus);
          if (expectedStatus === 404)
            await expect(errorCode(response)).resolves.toBe(
              "resource_not_found",
            );
        }
      }

      const internalTeamForAdmin = await live.app.request(
        `/api/v1/teams/${team.data.id}`,
        { headers: authorization(identities.admin) },
      );
      expect(internalTeamForAdmin.status).toBe(200);
      const internalTeamForGuest = await live.app.request(
        `/api/v1/teams/${team.data.id}`,
        { headers: authorization(identities.guest) },
      );
      expect(internalTeamForGuest.status).toBe(404);
      await expect(errorCode(internalTeamForGuest)).resolves.toBe(
        "resource_not_found",
      );

      for (const [label, userId, conversationId, expectedStatus] of [
        ["member direct send", identities.member, roomIds.direct, 201],
        ["guest external send", identities.guest, roomIds.external, 201],
        ["viewer Team send", identities.viewer, roomIds.team, 404],
        ["admin private send", identities.admin, roomIds.private, 404],
      ] as const) {
        const response = await live.app.request(
          `/api/v1/conversations/${conversationId}/messages`,
          {
            method: "POST",
            headers: {
              ...authorization(userId),
              "content-type": "application/json",
              "idempotency-key": crypto.randomUUID(),
            },
            body: JSON.stringify({
              clientMessageId: crypto.randomUUID(),
              body: `Authorization matrix: ${label}`,
              intent: "message",
              metadata: {},
            }),
          },
        );
        expect(response.status, label).toBe(expectedStatus);
        if (expectedStatus === 404)
          await expect(errorCode(response)).resolves.toBe("resource_not_found");
      }

      const removed = await ownerClient.removeConversationParticipant(
        privateRoom.data.id,
        identities.removed,
        privateRoom.data.version,
        "00000000-0000-4000-8000-000000000416",
      );
      expect(removed.data.participants).not.toContainEqual(
        expect.objectContaining({ user: { id: identities.removed } }),
      );
      const removedRead = await live.app.request(
        `/api/v1/conversations/${privateRoom.data.id}`,
        { headers: authorization(identities.removed) },
      );
      expect(removedRead.status).toBe(404);
      await expect(errorCode(removedRead)).resolves.toBe("resource_not_found");

      const secondOwnerClient = clientFor(
        live.app,
        fixture.second.ownerId,
        fixture.second.organizationId,
      );
      const foreignTeam = await secondOwnerClient.createTeam(
        {
          workspaceId: fixture.second.workspaceId,
          name: "Foreign authorization Team",
          purpose: "Cross-tenant non-leaking authorization coverage.",
          preset: "custom",
          memberIds: [fixture.second.ownerId],
        },
        "00000000-0000-4000-8000-000000000417",
      );
      const foreignRoomId = foreignTeam.data.room?.conversationId;
      if (!foreignRoomId)
        throw new Error("The foreign authorization Team has no room.");
      for (const [userId, resourcePath] of [
        [identities.owner, `/api/v1/teams/${foreignTeam.data.id}`],
        [identities.owner, `/api/v1/conversations/${foreignRoomId}`],
        [fixture.second.ownerId, `/api/v1/teams/${team.data.id}`],
        [fixture.second.ownerId, `/api/v1/conversations/${roomIds.workspace}`],
      ] as const) {
        const response = await live.app.request(resourcePath, {
          headers: authorization(userId),
        });
        expect(response.status).toBe(404);
        await expect(errorCode(response)).resolves.toBe("resource_not_found");
      }
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
      const readiness = await live.app.request("/api/v1/readyz");
      expect(readiness.status).toBe(200);
      await expect(readiness.json()).resolves.toMatchObject({
        status: "ready",
        mode: "live",
        database: "ready",
      });

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

      const crossTenantWorkspaceSlug = await live.app.request(
        "/api/v1/workspaces/second",
        { headers: authorization(fixture.first.ownerId) },
      );
      expect(crossTenantWorkspaceSlug.status).toBe(404);
      await expect(errorCode(crossTenantWorkspaceSlug)).resolves.toBe(
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
      const accessFilteredSearch =
        await memberClient.search("Search saturation");
      expect(accessFilteredSearch.items).toEqual([
        expect.objectContaining({ title: "Search saturation visible" }),
      ]);

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
      const authenticatedEvents = await live.app.request(
        `/api/v1/events?workspaceId=${fixture.first.visibleWorkspaceId}&format=json`,
        { headers: authorization(fixture.first.ownerId) },
      );
      expect(authenticatedEvents.status).toBe(200);
      await expect(authenticatedEvents.json()).resolves.toMatchObject({
        events: expect.any(Array),
        nextCursor: expect.any(Number),
      });

      const crossTenantEvents = await live.app.request(
        `/api/v1/events?workspaceId=${fixture.second.workspaceId}&format=json`,
        { headers: authorization(fixture.first.ownerId) },
      );
      expect(crossTenantEvents.status).toBe(404);
      await expect(errorCode(crossTenantEvents)).resolves.toBe(
        "resource_not_found",
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
      description: "Exercise persistence and optimistic concurrency.",
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

  it("serves the same canonical WorkItem after a full API process restart", async () => {
    const port = await availablePort();
    const first = await startRestartTestServer(port);
    let firstStopped = false;
    const createKey = "00000000-0000-4000-8000-000000000121";
    try {
      const client = restartClient(port);
      const created = await client.createItem(
        {
          workspaceId: fixture.first.visibleWorkspaceId,
          boardId: fixture.first.visibleBoardId,
          title: "Process restart durability",
          description: "Created before the API process exits.",
          type: "task",
          priority: "high",
          status: "working",
          assigneeIds: [fixture.first.ownerId],
        },
        createKey,
      );
      await first.stop();
      firstStopped = true;

      const second = await startRestartTestServer(port);
      try {
        await expect(
          restartClient(port).item(created.data.id),
        ).resolves.toEqual(created.data);
        await expect(
          restartClient(port).createItem(
            {
              workspaceId: fixture.first.visibleWorkspaceId,
              boardId: fixture.first.visibleBoardId,
              title: "Process restart durability",
              description: "Created before the API process exits.",
              type: "task",
              priority: "high",
              status: "working",
              assigneeIds: [fixture.first.ownerId],
            },
            createKey,
          ),
        ).resolves.toEqual({ ...created, replayed: true });
      } finally {
        await second.stop();
      }
    } finally {
      if (!firstStopped) await first.stop();
    }
  }, 30_000);

  it("executes the durable founder golden path through typed HTTP transport", async () => {
    const live = createLiveHarness();
    const ownerClient = clientFor(
      live.app,
      fixture.first.ownerId,
      fixture.first.organizationId,
    );
    const otherTenantClient = clientFor(
      live.app,
      fixture.second.ownerId,
      fixture.second.organizationId,
    );
    const keys = {
      workspace: "00000000-0000-4000-8000-000000000501",
      capturedDone: "00000000-0000-4000-8000-000000000502",
      updateCaptured: "00000000-0000-4000-8000-000000000503",
      capturedConvert: "00000000-0000-4000-8000-000000000504",
      convert: "00000000-0000-4000-8000-000000000505",
      assign: "00000000-0000-4000-8000-000000000506",
      block: "00000000-0000-4000-8000-000000000507",
      evidence: "00000000-0000-4000-8000-000000000508",
      waiting: "00000000-0000-4000-8000-000000000509",
      resolve: "00000000-0000-4000-8000-000000000510",
      resolveWaiting: "00000000-0000-4000-8000-000000000511",
      decision: "00000000-0000-4000-8000-000000000512",
      approval: "00000000-0000-4000-8000-000000000513",
      review: "00000000-0000-4000-8000-000000000514",
      stale: "00000000-0000-4000-8000-000000000515",
      invalid: "00000000-0000-4000-8000-000000000516",
      decisionItem: "00000000-0000-4000-8000-000000000517",
      approvalItem: "00000000-0000-4000-8000-000000000518",
    } as const;
    const workspaceInput = {
      portfolioId: fixture.first.portfolioId,
      name: "Golden Transport",
      slug: "golden-transport",
      description: "A durable golden-path Workspace.",
      type: "project" as const,
      accent: "#0f766e",
      icon: "G",
      stage: "build" as const,
      health: "on_track" as const,
      healthNote: "",
      priority: "Prove the operating loop",
      leadUserId: fixture.first.ownerId,
      initialBoardName: "Golden Board",
    };

    try {
      const createdWorkspace = await ownerClient.createWorkspace(
        workspaceInput,
        keys.workspace,
      );
      expect(createdWorkspace).toMatchObject({
        idempotencyKey: keys.workspace,
        replayed: false,
        data: {
          workspace: {
            slug: workspaceInput.slug,
            description: workspaceInput.description,
            versionTag: expect.any(String),
            updatedAt: expect.any(String),
          },
          board: {
            name: workspaceInput.initialBoardName,
            templateKey: "trevv_default",
            versionTag: expect.any(String),
            updatedAt: expect.any(String),
          },
        },
      });
      await expect(
        ownerClient.createWorkspace(workspaceInput, keys.workspace),
      ).resolves.toEqual({ ...createdWorkspace, replayed: true });

      const { workspace, board } = createdWorkspace.data;
      await expect(
        ownerClient.workspace(workspace.slug),
      ).resolves.toMatchObject({
        workspace: { id: workspace.id },
        items: [],
      });
      await expect(ownerClient.boards(workspace.id)).resolves.toContainEqual(
        board,
      );

      const capturedDone = await ownerClient.captureInboxItem(
        {
          category: "note",
          title: "Record a completed thought",
          body: "This capture remains durable after completion.",
          resource: { source: "golden_path" },
        },
        keys.capturedDone,
      );
      expect(capturedDone).toMatchObject({
        etag: '"0"',
        idempotencyKey: keys.capturedDone,
        replayed: false,
        data: { version: 0 },
      });
      await expect(
        ownerClient.captureInboxItem(
          {
            category: "note",
            title: "Record a completed thought",
            body: "This capture remains durable after completion.",
            resource: { source: "golden_path" },
          },
          keys.capturedDone,
        ),
      ).resolves.toEqual({ ...capturedDone, replayed: true });
      const completedCapture = await ownerClient.updateInboxItem(
        capturedDone.data.id,
        { done: true },
        capturedDone.data.version,
        keys.updateCaptured,
      );
      expect(completedCapture).toMatchObject({
        etag: '"1"',
        data: { doneAt: expect.any(String), version: 1 },
      });

      const capturedForConversion = await ownerClient.captureInboxItem(
        {
          category: "task",
          title: "Turn a signal into canonical work",
          body: "Carry the original capture into the canonical item.",
          resource: { source: "golden_path", confidence: 1 },
        },
        keys.capturedConvert,
      );
      const converted = await ownerClient.convertInboxItem(
        capturedForConversion.data.id,
        {
          workspaceId: workspace.id,
          boardId: board.id,
          title: "Canonical founder task",
          description: "Converted from durable Inbox capture.",
          type: "task",
          priority: "high",
          status: "working",
          assigneeIds: [],
        },
        capturedForConversion.data.version,
        keys.convert,
      );
      expect(converted).toMatchObject({
        etag: '"1"',
        replayed: false,
        data: {
          inboxItem: {
            id: capturedForConversion.data.id,
            convertedItemId: expect.any(String),
            version: 1,
          },
          workItem: {
            title: "Canonical founder task",
            description: "Converted from durable Inbox capture.",
            version: 0,
          },
        },
      });
      expect(converted.data.inboxItem.convertedItemId).toBe(
        converted.data.workItem.id,
      );

      const assigned = await ownerClient.assignItem(
        converted.data.workItem.id,
        { assigneeIds: [fixture.first.ownerId] },
        converted.data.workItem.version,
        keys.assign,
      );
      expect(assigned).toMatchObject({
        etag: '"1"',
        data: {
          item: {
            version: 1,
            assignees: [{ id: fixture.first.ownerId, name: "First Owner" }],
          },
          attentionRefreshQueued: true,
        },
      });
      const blocked = await ownerClient.setItemBlocked(
        assigned.data.item.id,
        { blocked: true, reason: "Waiting for the launch evidence." },
        assigned.data.item.version,
        keys.block,
      );
      expect(blocked).toMatchObject({
        etag: '"2"',
        data: { item: { status: "blocked", version: 2 } },
      });
      const recordedEvidence = await ownerClient.addItemEvidence(
        blocked.data.item.id,
        { body: "The founder confirmed the blocked dependency." },
        blocked.data.item.version,
        keys.evidence,
      );
      expect(recordedEvidence).toMatchObject({
        etag: '"3"',
        data: {
          evidence: {
            body: "The founder confirmed the blocked dependency.",
          },
          itemVersion: 3,
        },
      });

      const waiting = await ownerClient.createWaiting(
        {
          workspaceId: workspace.id,
          entityType: "work_item",
          entityId: blocked.data.item.id,
          title: "Wait for launch evidence",
          waitingType: "person",
          waitingReferenceId: fixture.first.ownerId,
          waitingLabel: "First Owner",
          expectedBy: "2026-09-05",
          followUpOwnerId: fixture.first.ownerId,
          nextFollowUp: "2026-09-01",
          note: "Follow up with evidence before resolving.",
        },
        recordedEvidence.data.itemVersion,
        keys.waiting,
      );
      expect(waiting).toMatchObject({
        etag: '"0"',
        data: {
          entityType: "work_item",
          entityId: blocked.data.item.id,
          version: 0,
        },
      });
      const afterWaiting = await ownerClient.item(blocked.data.item.id);
      expect(afterWaiting.version).toBeGreaterThan(
        recordedEvidence.data.itemVersion,
      );

      const resolved = await ownerClient.resolveItem(
        afterWaiting.id,
        { evidence: "Launch evidence was accepted and archived." },
        afterWaiting.version,
        keys.resolve,
      );
      expect(resolved).toMatchObject({
        etag: `"${afterWaiting.version + 1}"`,
        data: {
          item: { status: "done", version: afterWaiting.version + 1 },
          evidence: {
            body: "Launch evidence was accepted and archived.",
          },
        },
      });
      await expect(
        ownerClient.actOnWaiting(
          waiting.data.id,
          { action: "resolve", note: "Canonical work is complete." },
          waiting.data.version,
          keys.resolveWaiting,
        ),
      ).resolves.toMatchObject({
        etag: '"1"',
        data: { resolvedAt: expect.any(String), version: 1 },
      });

      const decision = await ownerClient.createItem(
        {
          workspaceId: workspace.id,
          boardId: board.id,
          title: "Choose the release cohort",
          description: "Select the smallest safe founder cohort.",
          type: "decision",
          priority: "high",
          status: "working",
          assigneeIds: [fixture.first.ownerId],
          decisionState: "needed",
        },
        keys.decisionItem,
      );
      const decided = await ownerClient.transitionDecision(
        decision.data.id,
        {
          state: "decided",
          rationale: "The invited-founder cohort has the lowest risk.",
          evidence: "Five founders completed the workflow successfully.",
        },
        decision.data.version,
        keys.decision,
      );
      expect(decided).toMatchObject({
        etag: '"1"',
        data: {
          item: { decisionState: "decided", version: 1 },
          evidence: {
            body: "Five founders completed the workflow successfully.",
          },
        },
      });

      const approval = await ownerClient.createItem(
        {
          workspaceId: workspace.id,
          boardId: board.id,
          title: "Approve the founder release",
          description: "Approve the evidence-backed release.",
          type: "approval",
          priority: "high",
          status: "working",
          assigneeIds: [fixture.first.ownerId],
          approvalState: "pending",
        },
        keys.approvalItem,
      );
      await expect(
        ownerClient.transitionApproval(
          approval.data.id,
          {
            state: "approved",
            rationale: "All acceptance evidence is present.",
            evidence: "The golden path and tenant tests passed.",
          },
          approval.data.version,
          keys.approval,
        ),
      ).resolves.toMatchObject({
        etag: '"1"',
        data: {
          item: { approvalState: "approved", version: 1 },
          evidence: {
            body: "The golden path and tenant tests passed.",
          },
        },
      });

      const review = await ownerClient.submitWeeklyReview(
        {
          workspaceId: workspace.id,
          health: "on_track",
          progress: "The canonical operating loop is durable.",
          blocker: "No active blocker remains.",
          nextMilestone: "Invite the first founder cohort.",
          decisionNeeded: "Confirm the cohort size.",
          priorityNextWeek: "Observe real founder usage.",
        },
        keys.review,
      );
      expect(review).toMatchObject({
        replayed: false,
        data: {
          update: { workspaceId: workspace.id },
          snapshot: {
            workspaceId: workspace.id,
            source: "weekly_review",
          },
          attentionRefreshQueued: true,
        },
      });
      await expect(
        ownerClient.weeklyReviews(workspace.id),
      ).resolves.toContainEqual(
        expect.objectContaining({
          id: review.data.update.id,
          workspaceId: workspace.id,
          progress: "The canonical operating loop is durable.",
        }),
      );
      await expect(
        ownerClient.workspaceSnapshots({ workspaceId: workspace.id }),
      ).resolves.toContainEqual(
        expect.objectContaining({
          id: review.data.snapshot.id,
          workspaceId: workspace.id,
          source: "weekly_review",
        }),
      );

      const history = await ownerClient.itemHistory(resolved.data.item.id);
      expect(history.map(({ type }) => type)).toEqual(
        expect.arrayContaining([
          "item_created",
          "assignment_changed",
          "item_transitioned",
          "comment_added",
          "waiting_started",
        ]),
      );
      expect(history.every(({ reasonCode }) => reasonCode.length > 0)).toBe(
        true,
      );
      await expect(
        ownerClient.itemEvidence(resolved.data.item.id),
      ).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            body: "The founder confirmed the blocked dependency.",
          }),
          expect.objectContaining({
            body: "Launch evidence was accepted and archived.",
          }),
        ]),
      );
      const operations = await ownerClient.operationStatus();
      expect(operations.pendingOutbox).toBeGreaterThan(0);
      expect(operations.failedCount).toBe(0);

      await expect(
        ownerClient.setItemBlocked(
          resolved.data.item.id,
          { blocked: true, reason: "This stale write must fail." },
          recordedEvidence.data.itemVersion,
          keys.stale,
        ),
      ).rejects.toMatchObject({
        code: "version_conflict",
        status: 409,
        details: { currentVersion: resolved.data.item.version },
        etag: `"${resolved.data.item.version}"`,
      } satisfies Partial<TrevvApiError>);

      const invalidTransition = await live.app.request(
        `/api/v1/items/${decision.data.id}/decision`,
        {
          method: "POST",
          headers: {
            ...authorization(fixture.first.ownerId),
            "content-type": "application/json",
            "if-match": `"${decided.data.item.version}"`,
            "idempotency-key": keys.invalid,
          },
          body: JSON.stringify({ state: "decided" }),
        },
      );
      expect(invalidTransition.status).toBe(422);
      await expect(errorCode(invalidTransition)).resolves.toBe(
        "validation_error",
      );

      await expect(
        otherTenantClient.item(resolved.data.item.id),
      ).rejects.toMatchObject({
        code: "resource_not_found",
        status: 404,
      } satisfies Partial<TrevvApiError>);
    } finally {
      await live.close();
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
      const firstAcceptance = await inviteeClient.acceptInvitation(rawToken);
      expect(firstAcceptance).toMatchObject({
        invitationId: created.id,
        organizationId: fixture.first.organizationId,
        role: "member",
      });
      const effectsBeforeReplay = await apiInvitationReplaySnapshot({
        organizationId: fixture.first.organizationId,
        invitationId: created.id,
        authUserId: inviteeAuthId,
      });
      expect(effectsBeforeReplay).toMatchObject({
        acceptanceAuditCount: 1,
        acceptanceOutboxCount: 1,
        membershipCount: 1,
        mappingCount: 1,
      });
      await expect(inviteeClient.acceptInvitation(rawToken)).resolves.toEqual(
        firstAcceptance,
      );
      expect(
        await apiInvitationReplaySnapshot({
          organizationId: fixture.first.organizationId,
          invitationId: created.id,
          authUserId: inviteeAuthId,
        }),
      ).toEqual(effectsBeforeReplay);
      await expect(
        wrongIdentityClient.acceptInvitation(rawToken),
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
      await expect(
        inviteeClient.acceptInvitation(rawToken),
      ).rejects.toMatchObject({
        code: "resource_not_found",
        status: 404,
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

  it("keeps expired and revoked invitation tokens non-leaking through live HTTP", async () => {
    let currentTime = now;
    const live = createLiveHarness(() => currentTime);
    try {
      const ownerClient = clientFor(
        live.app,
        fixture.first.ownerId,
        fixture.first.organizationId,
      );

      const revokedAuthId = `auth-api-revoked-${crypto.randomUUID()}`;
      const revokedEmail = `${revokedAuthId}@example.test`;
      await seedAuthIdentity(revokedAuthId, revokedEmail, "Revoked invitee");
      const revoked = await ownerClient.createInvitation(
        { email: revokedEmail, role: "member" },
        crypto.randomUUID(),
      );
      const revokedToken = invitationTokenFromMail(live.mail);
      await ownerClient.revokeInvitation(
        revoked.data.id,
        revoked.data.version,
        crypto.randomUUID(),
      );
      await expect(
        clientFor(
          live.app,
          revokedAuthId,
          fixture.first.organizationId,
        ).acceptInvitation(revokedToken),
      ).rejects.toMatchObject({
        code: "resource_not_found",
        status: 404,
      } satisfies Partial<TrevvApiError>);

      const expiredAuthId = `auth-api-expired-${crypto.randomUUID()}`;
      const expiredEmail = `${expiredAuthId}@example.test`;
      await seedAuthIdentity(expiredAuthId, expiredEmail, "Expired invitee");
      await ownerClient.createInvitation(
        { email: expiredEmail, role: "member" },
        crypto.randomUUID(),
      );
      const expiredToken = invitationTokenFromMail(live.mail);
      const expiredClient = clientFor(
        live.app,
        expiredAuthId,
        fixture.first.organizationId,
      );
      await expect(
        expiredClient.acceptInvitation(expiredToken),
      ).resolves.toMatchObject({
        organizationId: fixture.first.organizationId,
        role: "member",
      });
      currentTime = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1_000);
      await expect(
        expiredClient.acceptInvitation(expiredToken),
      ).rejects.toMatchObject({
        code: "resource_not_found",
        status: 404,
      } satisfies Partial<TrevvApiError>);
    } finally {
      await live.close();
    }
  });

  it("accepts a registration invitation from its durable authenticated claim and blocks onboarding", async () => {
    const suffix = crypto.randomUUID();
    const inviteeAuthId = `auth-api-claimed-invite-${suffix}`;
    const inviteeEmail = `${inviteeAuthId}@example.test`;
    const unclaimedAuthId = `auth-api-unclaimed-${suffix}`;
    const live = createLiveHarness();
    try {
      const ownerClient = clientFor(
        live.app,
        fixture.first.ownerId,
        fixture.first.organizationId,
      );
      const created = await ownerClient.createInvitation(
        { email: inviteeEmail, role: "member" },
        crypto.randomUUID(),
      );
      const rawToken = invitationTokenFromMail(live.mail);
      await seedConnection.db.insert(authUsers).values([
        {
          id: inviteeAuthId,
          name: "Durably claimed invitee",
          email: inviteeEmail,
          emailVerified: true,
          registrationInvitationTokenHash: hashInvitationToken(rawToken),
        },
        {
          id: unclaimedAuthId,
          name: "Unclaimed identity",
          email: `${unclaimedAuthId}@example.test`,
          emailVerified: true,
        },
      ]);

      const pending = await live.app.request("/api/v1/session/organizations", {
        headers: authorization(inviteeAuthId),
      });
      expect(pending.status).toBe(409);
      await expect(errorCode(pending)).resolves.toBe(
        "invitation_acceptance_required",
      );

      const onboarding = await live.app.request("/api/v1/onboarding", {
        headers: authorization(inviteeAuthId),
      });
      expect(onboarding.status).toBe(409);
      await expect(errorCode(onboarding)).resolves.toBe(
        "invitation_acceptance_required",
      );

      const anonymous = await live.app.request(
        "/api/v1/invitations/accept-claim",
        { method: "POST" },
      );
      expect(anonymous.status).toBe(401);
      await expect(errorCode(anonymous)).resolves.toBe("unauthenticated");

      const missing = await live.app.request(
        "/api/v1/invitations/accept-claim",
        {
          method: "POST",
          headers: authorization(unclaimedAuthId),
        },
      );
      expect(missing.status).toBe(404);
      await expect(errorCode(missing)).resolves.toBe("resource_not_found");

      const accepted = await live.app.request(
        "/api/v1/invitations/accept-claim",
        {
          method: "POST",
          headers: authorization(inviteeAuthId),
        },
      );
      expect(accepted.status).toBe(200);
      await expect(accepted.json()).resolves.toMatchObject({
        invitationId: created.data.id,
        organizationId: fixture.first.organizationId,
        role: "member",
      });

      const session = await live.app.request("/api/v1/session", {
        headers: authorization(inviteeAuthId),
      });
      expect(session.status).toBe(200);
      await expect(session.json()).resolves.toMatchObject({
        organizationId: fixture.first.organizationId,
        user: { email: inviteeEmail, role: "member" },
      });
    } finally {
      await live.close();
    }
  });
});

function createLiveHarness(clock: () => Date = () => now) {
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
          expiresAt: new Date(clock().getTime() + 3_600_000),
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
            expiresAt: new Date(clock().getTime() + 3_600_000),
          }
        : null;
    },
  });
  return {
    app: createApiApp({
      mode: "live",
      ...adapter,
      clock,
      authIdentityResolver: { resolve: resolveAuthIdentity },
      preMembershipPaths: [
        "/api/v1/session/organizations",
        "/api/v1/session/organization",
        "/api/v1/onboarding",
        "/api/v1/onboarding/complete",
        "/api/v1/invitations/accept",
        "/api/v1/invitations/accept-claim",
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

function restartClient(port: number) {
  return createApiClient({
    baseUrl: `http://127.0.0.1:${port}/api/v1`,
    getAccessToken: async () => fixture.first.ownerId,
  });
}

async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Could not allocate a local API restart test port.");
  }
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

async function startRestartTestServer(port: number): Promise<{
  stop: () => Promise<void>;
}> {
  const executable = fileURLToPath(
    new URL("../node_modules/.bin/tsx", import.meta.url),
  );
  const child = spawn(executable, ["integration/restart-server-fixture.ts"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: {
      ...process.env,
      DATABASE_URL: temporary.url,
      PORT: String(port),
      RESTART_TEST_USER_ID: fixture.first.ownerId,
    },
  });
  await waitForRestartServer(child, port);
  return {
    stop: async () => {
      if (child.exitCode !== null) return;
      const stopped = once(child, "exit");
      child.kill("SIGTERM");
      try {
        await Promise.race([
          stopped,
          delay(5_000).then(() => {
            throw new Error("The restart test API did not stop gracefully.");
          }),
        ]);
      } catch (error) {
        if (child.exitCode === null) {
          const forced = once(child, "exit");
          child.kill("SIGKILL");
          await forced;
        }
        throw error;
      }
    },
  };
}

async function waitForRestartServer(
  child: ChildProcessWithoutNullStreams,
  port: number,
) {
  let standardError = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    standardError += chunk;
  });
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null)
      throw new Error(
        `The restart test API exited before readiness: ${standardError}`,
      );
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/v1/health`);
      if (response.ok) return;
    } catch {
      // The child process is still starting.
    }
    await delay(50);
  }
  child.kill("SIGTERM");
  throw new Error(
    `The restart test API did not become ready: ${standardError}`,
  );
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

async function apiInvitationReplaySnapshot(input: {
  organizationId: string;
  invitationId: string;
  authUserId: string;
}) {
  const [audits, outbox, membershipRows, mappings, invitationRows, selections] =
    await Promise.all([
      seedConnection.db.select().from(auditLogs),
      seedConnection.db.select().from(outboxEvents),
      seedConnection.db.select().from(memberships),
      seedConnection.db.select().from(authUserMappings),
      seedConnection.db.select().from(invitations),
      seedConnection.db.select().from(appUserOrganizationSelections),
    ]);
  const mapping = mappings.find(
    (candidate) => candidate.authUserId === input.authUserId,
  );
  const invitation = invitationRows.find(
    (candidate) => candidate.id === input.invitationId,
  );
  const selection = selections.find(
    (candidate) => candidate.appUserId === mapping?.appUserId,
  );
  return {
    acceptanceAuditCount: audits.filter(
      (audit) =>
        audit.organizationId === input.organizationId &&
        audit.action === "invitation.accepted" &&
        audit.targetId === input.invitationId,
    ).length,
    acceptanceOutboxCount: outbox.filter(
      (event) =>
        event.organizationId === input.organizationId &&
        event.eventType === "invitation.accepted" &&
        event.aggregateId === input.invitationId,
    ).length,
    membershipCount: membershipRows.filter(
      (membership) =>
        membership.organizationId === input.organizationId &&
        membership.userId === mapping?.appUserId,
    ).length,
    mappingCount: mappings.filter(
      (candidate) => candidate.authUserId === input.authUserId,
    ).length,
    invitationVersion: invitation?.version,
    invitationAcceptedAt: invitation?.acceptedAt,
    invitationUpdatedAt: invitation?.updatedAt,
    selectedOrganizationId: selection?.organizationId,
    selectionUpdatedAt: selection?.updatedAt,
  };
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
        title:
          index === 0
            ? "Search saturation visible"
            : `Visible item ${index + 1}`,
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
      ...Array.from({ length: 60 }, (_, index) => ({
        id: `item-api-hidden-search-${String(index).padStart(3, "0")}`,
        organizationId: first.organizationId,
        workspaceId: first.hiddenWorkspaceId,
        boardId: first.hiddenBoardId,
        title: `Search saturation ${String(index).padStart(3, "0")}`,
        itemType: "task" as const,
        priority: "normal" as const,
        status: "working" as const,
        creatorId: first.ownerId,
      })),
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
