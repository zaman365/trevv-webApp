import {
  createApiClient,
  TrevvApiError,
} from "../../../packages/api-client/src/index.js";
import {
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

  it("resolves identity and mandatory organization context without leaking membership or Workspace access", async () => {
    const live = createLiveHarness();
    try {
      const health = await live.app.request("/api/v1/health");
      expect(health.status).toBe(200);
      await expect(health.json()).resolves.toMatchObject({ mode: "live" });

      const unauthenticated = await live.app.request("/api/v1/session");
      expect(unauthenticated.status).toBe(401);

      const missingOrganization = await live.app.request("/api/v1/session", {
        headers: authorization(fixture.first.memberId),
      });
      expect(missingOrganization.status).toBe(400);
      await expect(errorCode(missingOrganization)).resolves.toBe(
        "organization_context_required",
      );

      const wrongOrganization = await live.app.request("/api/v1/session", {
        headers: {
          ...authorization(fixture.first.memberId),
          "x-organization-id": fixture.second.organizationId,
        },
      });
      expect(wrongOrganization.status).toBe(404);
      await expect(errorCode(wrongOrganization)).resolves.toBe(
        "resource_not_found",
      );

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
});

function createLiveHarness() {
  const connection = createDatabase(temporary.url);
  const adapter = createPostgresAdapter({
    repositories: createPostgresRepositories(connection.db),
    async resolveIdentity(request) {
      const token = request.headers
        .get("authorization")
        ?.match(/^Bearer (.+)$/)?.[1];
      return token
        ? { userId: token, expiresAt: new Date(now.getTime() + 3_600_000) }
        : null;
    },
  });
  return {
    app: createApiApp({
      mode: "live",
      ...adapter,
      clock: () => now,
    }),
    close: connection.close,
  };
}

function clientFor(
  app: ReturnType<typeof createApiApp>,
  userId: string,
  organizationId: string,
  statuses?: number[],
) {
  return createApiClient({
    baseUrl: "http://trevv.test/api/v1",
    getAccessToken: async () => userId,
    getOrganizationId: async () => organizationId,
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

async function errorCode(response: Response): Promise<string | undefined> {
  const body = (await response.json()) as { error?: { code?: string } };
  return body.error?.code;
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
