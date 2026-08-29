import { and, eq } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDatabase,
  hashInvitationToken,
  createOrganizationScope,
  createPostgresRepositories,
  type TenantScope,
} from "../src/index.js";
import {
  attentionSignals,
  auditLogs,
  boards,
  decisionOutcomes,
  idempotencyRecords,
  inboxItems,
  itemDependencies,
  memberships,
  organizations,
  outboxEvents,
  portfolioMembers,
  portfolios,
  users,
  waitingStates,
  workItems,
  workspaceMembers,
  workspaces,
} from "../src/schema.js";
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

interface TenantFixture {
  organizationId: string;
  userId: string;
  portfolioId: string;
  workspaceA: string;
  workspaceB: string;
  boardA: string;
  boardB: string;
  scope: TenantScope;
}

let fixtureSequence = 0;

async function seedTenant(label: string): Promise<TenantFixture> {
  fixtureSequence += 1;
  const prefix = `${label}-${fixtureSequence}`;
  const organizationId = `org-${prefix}`;
  const userId = `user-${prefix}`;
  const portfolioId = `portfolio-${prefix}`;
  const workspaceA = `workspace-${prefix}-a`;
  const workspaceB = `workspace-${prefix}-b`;
  const boardA = `board-${prefix}-a`;
  const boardB = `board-${prefix}-b`;
  await connection.db.transaction(async (transaction) => {
    await transaction.insert(organizations).values({
      id: organizationId,
      name: "Shared Name",
      slug: prefix,
    });
    await transaction.insert(users).values({
      id: userId,
      email: `${prefix}@example.test`,
      name: "Test Owner",
    });
    await transaction.insert(memberships).values({
      organizationId,
      userId,
      role: "owner",
    });
    await transaction.insert(portfolios).values({
      id: portfolioId,
      organizationId,
      name: "Shared Portfolio",
      slug: "shared",
      isDefault: true,
    });
    await transaction.insert(portfolioMembers).values({
      organizationId,
      portfolioId,
      userId,
      role: "owner",
    });
    await transaction.insert(workspaces).values([
      {
        id: workspaceA,
        organizationId,
        portfolioId,
        name: "Shared Workspace",
        slug: "shared-a",
        type: "business",
        accentColor: "#334455",
        icon: "A",
        lifecycleStage: "build",
        health: "on_track",
        leadUserId: userId,
      },
      {
        id: workspaceB,
        organizationId,
        portfolioId,
        name: "Shared Workspace B",
        slug: "shared-b",
        type: "business",
        accentColor: "#556677",
        icon: "B",
        lifecycleStage: "build",
        health: "watch",
        leadUserId: userId,
      },
    ]);
    await transaction.insert(workspaceMembers).values([
      { organizationId, workspaceId: workspaceA, userId, canManage: true },
      { organizationId, workspaceId: workspaceB, userId, canManage: false },
    ]);
    await transaction.insert(boards).values([
      {
        id: boardA,
        organizationId,
        workspaceId: workspaceA,
        name: "Shared Board",
      },
      {
        id: boardB,
        organizationId,
        workspaceId: workspaceB,
        name: "Shared Board",
      },
    ]);
  });
  return {
    organizationId,
    userId,
    portfolioId,
    workspaceA,
    workspaceB,
    boardA,
    boardB,
    scope: createOrganizationScope({
      organizationId,
      userId,
      requestId: `request-${prefix}`,
    }),
  };
}

function mutation(
  key: string | undefined,
  route: string,
  now = new Date("2026-08-29T10:00:00.000Z"),
) {
  return {
    method: route.includes("create") ? "POST" : "PATCH",
    route,
    ...(key ? { idempotencyKey: key } : {}),
    now,
  };
}

function createInput(fixture: TenantFixture, title: string, id?: string) {
  return {
    ...(id ? { id } : {}),
    workspaceId: fixture.workspaceA,
    boardId: fixture.boardA,
    title,
    type: "task" as const,
    priority: "high" as const,
    status: "working" as const,
    assigneeIds: [fixture.userId],
  };
}

describe("PostgreSQL repositories", () => {
  it("survives connection restart and exposes scoped access truth", async () => {
    const fixture = await seedTenant("restart");
    const firstConnection = createDatabase(temporary.url);
    const first = createPostgresRepositories(
      firstConnection.db,
    ).forOrganization(fixture.scope);
    const created = await first.workItems.create(
      createInput(fixture, "Survives restart"),
      mutation(undefined, "/items/create"),
    );
    await firstConnection.close();

    const secondConnection = createDatabase(temporary.url);
    try {
      const second = createPostgresRepositories(
        secondConnection.db,
      ).forOrganization(fixture.scope);
      await expect(second.workItems.get(created.value.id)).resolves.toEqual(
        created.value,
      );
      const session = await second.session.resolve();
      expect(session.workspaceIds).toEqual([
        fixture.workspaceA,
        fixture.workspaceB,
      ]);
      expect(session.managedWorkspaceIds).toEqual([
        fixture.workspaceA,
        fixture.workspaceB,
      ]);
    } finally {
      await secondConnection.close();
    }
  });

  it("keeps overlapping-looking organizations isolated", async () => {
    const firstFixture = await seedTenant("overlap-a");
    const secondFixture = await seedTenant("overlap-b");
    const repositories = createPostgresRepositories(connection.db);
    const first = repositories.forOrganization(firstFixture.scope);
    const second = repositories.forOrganization(secondFixture.scope);
    const firstItem = await first.workItems.create(
      createInput(firstFixture, "Same title"),
      mutation(undefined, "/items/create"),
    );
    await second.workItems.create(
      createInput(secondFixture, "Same title"),
      mutation(undefined, "/items/create"),
    );
    expect(await first.portfolios.list()).toHaveLength(1);
    expect(await second.portfolios.list()).toHaveLength(1);
    await expect(
      second.workItems.get(firstItem.value.id),
    ).rejects.toMatchObject({
      code: "resource_not_found",
    });
    expect((await first.workItems.list()).map(({ title }) => title)).toEqual([
      "Same title",
    ]);
  });

  it("rejects a board from another Workspace at repository and database boundaries", async () => {
    const fixture = await seedTenant("board-scope");
    const scoped = createPostgresRepositories(connection.db).forOrganization(
      fixture.scope,
    );
    await expect(
      scoped.workItems.create(
        {
          ...createInput(fixture, "Wrong board"),
          boardId: fixture.boardB,
        },
        mutation(undefined, "/items/create"),
      ),
    ).rejects.toMatchObject({ code: "resource_not_found" });
    await expect(
      connection.db.insert(workItems).values({
        id: `item-${fixture.organizationId}-invalid`,
        organizationId: fixture.organizationId,
        workspaceId: fixture.workspaceA,
        boardId: fixture.boardB,
        title: "Direct mismatch",
        itemType: "task",
        status: "working",
        creatorId: fixture.userId,
      }),
    ).rejects.toBeTruthy();
  });

  it("allows cross-Workspace dependencies inside one organization and rejects cross-tenant endpoints", async () => {
    const firstFixture = await seedTenant("dependency-a");
    const secondFixture = await seedTenant("dependency-b");
    const first = createPostgresRepositories(connection.db).forOrganization(
      firstFixture.scope,
    );
    const second = createPostgresRepositories(connection.db).forOrganization(
      secondFixture.scope,
    );
    const firstItem = await first.workItems.create(
      createInput(firstFixture, "First dependency source"),
      mutation(undefined, "/items/create"),
    );
    const secondWorkspaceItem = await first.workItems.create(
      {
        ...createInput(firstFixture, "Other workspace"),
        workspaceId: firstFixture.workspaceB,
        boardId: firstFixture.boardB,
      },
      mutation(undefined, "/items/create"),
    );
    const foreignItem = await second.workItems.create(
      createInput(secondFixture, "Foreign dependency"),
      mutation(undefined, "/items/create"),
    );
    await expect(
      connection.db.insert(itemDependencies).values({
        organizationId: firstFixture.organizationId,
        itemId: firstItem.value.id,
        dependsOnItemId: secondWorkspaceItem.value.id,
      }),
    ).resolves.toBeDefined();
    await expect(
      connection.db.insert(itemDependencies).values({
        organizationId: firstFixture.organizationId,
        itemId: secondWorkspaceItem.value.id,
        dependsOnItemId: foreignItem.value.id,
      }),
    ).rejects.toBeTruthy();
  });

  it("uses durable optimistic concurrency", async () => {
    const fixture = await seedTenant("version");
    const scoped = createPostgresRepositories(connection.db).forOrganization(
      fixture.scope,
    );
    const created = await scoped.workItems.create(
      createInput(fixture, "Versioned item"),
      mutation(undefined, "/items/create"),
    );
    const first = await scoped.workItems.update(
      created.value.id,
      0,
      { title: "Committed title" },
      mutation(undefined, `/items/${created.value.id}`),
    );
    expect(first.value.version).toBe(1);
    await expect(
      scoped.workItems.update(
        created.value.id,
        0,
        { title: "Stale title" },
        mutation(undefined, `/items/${created.value.id}`),
      ),
    ).rejects.toMatchObject({ code: "version_conflict" });
  });

  it("replays the same request exactly and rejects any same-key request change", async () => {
    const fixture = await seedTenant("idempotency");
    const scoped = createPostgresRepositories(connection.db).forOrganization(
      fixture.scope,
    );
    const key = crypto.randomUUID();
    const context = mutation(key, "/items/create");
    const input = createInput(fixture, "Idempotent item");
    const first = await scoped.workItems.create(input, context);
    const replay = await scoped.workItems.create(input, context);
    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.value).toEqual(first.value);
    await expect(
      scoped.workItems.create({ ...input, title: "Changed request" }, context),
    ).rejects.toMatchObject({ code: "idempotency_key_reused" });
    await expect(
      scoped.workItems.create(input, mutation(key, "/other/create")),
    ).rejects.toMatchObject({ code: "idempotency_key_reused" });
  });

  it("never reuses or deletes an expired idempotency record during a request", async () => {
    const fixture = await seedTenant("expired-key");
    const scoped = createPostgresRepositories(connection.db).forOrganization(
      fixture.scope,
    );
    const key = crypto.randomUUID();
    const input = createInput(fixture, "Expired replay");
    const first = await scoped.workItems.create(
      input,
      mutation(key, "/items/create"),
    );
    await connection.db
      .update(idempotencyRecords)
      .set({ expiresAt: new Date("2020-01-01T00:00:00.000Z") })
      .where(
        and(
          eq(idempotencyRecords.organizationId, fixture.organizationId),
          eq(idempotencyRecords.userId, fixture.userId),
          eq(idempotencyRecords.key, key),
        ),
      );
    const replay = await scoped.workItems.create(
      input,
      mutation(key, "/items/create", new Date("2030-01-01T00:00:00.000Z")),
    );
    expect(replay).toEqual({ value: first.value, replayed: true });
    expect(
      await connection.db
        .select()
        .from(idempotencyRecords)
        .where(
          and(
            eq(idempotencyRecords.organizationId, fixture.organizationId),
            eq(idempotencyRecords.key, key),
          ),
        ),
    ).toHaveLength(1);
  });

  it("serializes concurrent callers on one idempotency key", async () => {
    const fixture = await seedTenant("concurrent-key");
    const firstConnection = createDatabase(temporary.url);
    const secondConnection = createDatabase(temporary.url);
    try {
      const first = createPostgresRepositories(
        firstConnection.db,
      ).forOrganization(fixture.scope);
      const second = createPostgresRepositories(
        secondConnection.db,
      ).forOrganization(fixture.scope);
      const key = crypto.randomUUID();
      const input = createInput(fixture, "Concurrent replay");
      const results = await Promise.all([
        first.workItems.create(input, mutation(key, "/items/create")),
        second.workItems.create(input, mutation(key, "/items/create")),
      ]);
      expect(new Set(results.map(({ value }) => value.id)).size).toBe(1);
      expect(results.filter(({ replayed }) => replayed)).toHaveLength(1);
    } finally {
      await firstConnection.close();
      await secondConnection.close();
    }
  });

  it("rolls back aggregate, audit, outbox, and idempotency together", async () => {
    const fixture = await seedTenant("rollback");
    const scoped = createPostgresRepositories(connection.db).forOrganization(
      fixture.scope,
    );
    const itemId = `item-${fixture.organizationId}-rollback`;
    const idempotencyKey = crypto.randomUUID();
    await expect(
      scoped.unitOfWork.run(async (transactional) => {
        await transactional.workItems.create(
          createInput(fixture, "Must roll back", itemId),
          mutation(idempotencyKey, "/items/create"),
        );
        throw new Error("force rollback");
      }),
    ).rejects.toThrow("force rollback");
    expect(
      await connection.db
        .select()
        .from(workItems)
        .where(
          and(
            eq(workItems.organizationId, fixture.organizationId),
            eq(workItems.id, itemId),
          ),
        ),
    ).toHaveLength(0);
    expect(
      await connection.db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.targetId, itemId)),
    ).toHaveLength(0);
    expect(
      await connection.db
        .select()
        .from(outboxEvents)
        .where(eq(outboxEvents.aggregateId, itemId)),
    ).toHaveLength(0);
    expect(
      await connection.db
        .select()
        .from(idempotencyRecords)
        .where(
          and(
            eq(idempotencyRecords.organizationId, fixture.organizationId),
            eq(idempotencyRecords.userId, fixture.userId),
            eq(idempotencyRecords.key, idempotencyKey),
          ),
        ),
    ).toHaveLength(0);
  });

  it("commits mutation, audit, and outbox atomically", async () => {
    const fixture = await seedTenant("atomicity");
    const scoped = createPostgresRepositories(connection.db).forOrganization(
      fixture.scope,
    );
    const itemId = `item-${fixture.organizationId}-atomic`;
    await scoped.workItems.create(
      createInput(fixture, "Atomic item", itemId),
      mutation(undefined, "/items/create"),
    );
    expect(
      await connection.db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.organizationId, fixture.organizationId),
            eq(auditLogs.targetId, itemId),
          ),
        ),
    ).toHaveLength(1);
    expect(
      await connection.db
        .select()
        .from(outboxEvents)
        .where(
          and(
            eq(outboxEvents.organizationId, fixture.organizationId),
            eq(outboxEvents.aggregateId, itemId),
          ),
        ),
    ).toHaveLength(1);
  });

  it("provides tenant-scoped organization, people, invitation, and board repositories", async () => {
    const firstFixture = await seedTenant("aggregate-roots-a");
    const secondFixture = await seedTenant("aggregate-roots-b");
    const scope = createOrganizationScope(firstFixture.scope);
    expect(Object.isFrozen(scope)).toBe(true);
    const first = createPostgresRepositories(connection.db).forOrganization(
      scope,
    );
    const second = createPostgresRepositories(connection.db).forOrganization(
      secondFixture.scope,
    );

    expect((await first.organization.get()).id).toBe(
      firstFixture.organizationId,
    );
    await expect(first.users.get(secondFixture.userId)).rejects.toMatchObject({
      code: "resource_not_found",
    });

    const invitedUserId = `user-${firstFixture.organizationId}-invited`;
    await connection.db.insert(users).values({
      id: invitedUserId,
      email: `${invitedUserId}@example.test`,
      name: "Invited Member",
    });
    const member = await first.memberships.create(
      { userId: invitedUserId, role: "member" },
      mutation(crypto.randomUUID(), "/memberships/create"),
    );
    expect(member.value.organizationId).toBe(firstFixture.organizationId);
    expect((await first.users.get(invitedUserId)).name).toBe("Invited Member");
    await expect(second.memberships.get(invitedUserId)).rejects.toMatchObject({
      code: "resource_not_found",
    });

    const invitation = await first.invitations.create(
      {
        email: "future.member@example.test",
        role: "member",
        tokenHash: hashInvitationToken(
          "never-return-this-opaque-invitation-token-value",
        ),
        expiresAt: new Date("2026-09-15T12:00:00.000Z"),
      },
      mutation(crypto.randomUUID(), "/invitations/create"),
    );
    expect(invitation.value).not.toHaveProperty("tokenHash");
    expect((await first.invitations.get(invitation.value.id)).email).toBe(
      "future.member@example.test",
    );
    await expect(
      second.invitations.get(invitation.value.id),
    ).rejects.toMatchObject({ code: "resource_not_found" });

    const board = await first.boards.create(
      { workspaceId: firstFixture.workspaceA, name: "Repository Board" },
      mutation(crypto.randomUUID(), "/boards/create"),
    );
    expect(await first.boards.list(firstFixture.workspaceA)).toContainEqual(
      board.value,
    );
    await expect(
      first.boards.create(
        { workspaceId: secondFixture.workspaceA, name: "Cross tenant" },
        mutation(crypto.randomUUID(), "/boards/create"),
      ),
    ).rejects.toMatchObject({ code: "resource_not_found" });

    const [event] = await connection.db
      .select()
      .from(outboxEvents)
      .where(
        and(
          eq(outboxEvents.organizationId, firstFixture.organizationId),
          eq(outboxEvents.aggregateId, board.value.id),
        ),
      );
    expect(event).toMatchObject({
      schemaVersion: 1,
      actorId: firstFixture.userId,
      requestId: firstFixture.scope.requestId,
      correlationId: firstFixture.scope.requestId,
    });
    expect(event?.dedupKey).toMatch(/^[a-f0-9]{64}$/);
  });

  it("creates, compare-and-swaps, and archives Portfolios and Workspaces without losing the default", async () => {
    const fixture = await seedTenant("portfolio-workspace-roots");
    const foreignFixture = await seedTenant("portfolio-workspace-foreign");
    const scoped = createPostgresRepositories(connection.db).forOrganization(
      fixture.scope,
    );
    const secondary = await scoped.portfolios.create(
      { name: "Secondary", slug: "secondary" },
      mutation(crypto.randomUUID(), "/portfolios/create"),
    );
    expect(
      (await scoped.portfolios.list()).filter(({ isDefault }) => isDefault),
    ).toHaveLength(1);
    const promoted = await scoped.portfolios.create(
      { name: "Promoted", slug: "promoted", isDefault: true },
      mutation(crypto.randomUUID(), "/portfolios/create"),
    );
    expect(
      (await scoped.portfolios.list()).filter(({ isDefault }) => isDefault),
    ).toEqual([expect.objectContaining({ id: promoted.value.id })]);
    await scoped.portfolios.archive(
      promoted.value.id,
      promoted.value.updatedAt,
      mutation(crypto.randomUUID(), "/portfolios/archive"),
    );
    expect(
      (await scoped.portfolios.list()).filter(({ isDefault }) => isDefault),
    ).toHaveLength(1);
    expect((await scoped.portfolios.list()).map(({ id }) => id)).not.toContain(
      promoted.value.id,
    );

    const workspaceInput = {
      portfolioId: secondary.value.id,
      name: "Repository Workspace",
      slug: "repository-workspace",
      type: "business" as const,
      accentColor: "#112233",
      icon: "R",
      lifecycleStage: "build" as const,
      health: "watch" as const,
      leadUserId: fixture.userId,
    };
    const workspace = await scoped.workspaces.create(
      workspaceInput,
      mutation(crypto.randomUUID(), "/workspaces/create"),
    );
    const updated = await scoped.workspaces.update(
      workspace.value.id,
      new Date(workspace.value.versionTag),
      { name: "Updated Repository Workspace" },
      mutation(crypto.randomUUID(), "/workspaces/update"),
    );
    expect(updated.value.name).toBe("Updated Repository Workspace");
    expect(new Date(updated.value.versionTag).getTime()).toBeGreaterThan(
      new Date(workspace.value.versionTag).getTime(),
    );
    await expect(
      scoped.workspaces.update(
        workspace.value.id,
        new Date(workspace.value.versionTag),
        { name: "Stale update" },
        mutation(crypto.randomUUID(), "/workspaces/update"),
      ),
    ).rejects.toMatchObject({ code: "version_conflict" });
    await expect(
      scoped.workspaces.create(
        {
          ...workspaceInput,
          slug: "foreign-parent",
          portfolioId: foreignFixture.portfolioId,
        },
        mutation(crypto.randomUUID(), "/workspaces/create"),
      ),
    ).rejects.toMatchObject({ code: "resource_not_found" });
    await expect(
      scoped.workspaces.create(
        {
          ...workspaceInput,
          slug: "foreign-lead",
          leadUserId: foreignFixture.userId,
        },
        mutation(crypto.randomUUID(), "/workspaces/create"),
      ),
    ).rejects.toMatchObject({ code: "resource_not_found" });
    await scoped.workspaces.archive(
      workspace.value.id,
      new Date(updated.value.versionTag),
      mutation(crypto.randomUUID(), "/workspaces/archive"),
    );
    expect(
      (await scoped.workspaces.list(secondary.value.id)).map(({ id }) => id),
    ).not.toContain(workspace.value.id);
    expect(
      await connection.db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.organizationId, fixture.organizationId),
            eq(auditLogs.targetId, workspace.value.id),
          ),
        ),
    ).toHaveLength(3);
    expect(
      await connection.db
        .select()
        .from(outboxEvents)
        .where(
          and(
            eq(outboxEvents.organizationId, fixture.organizationId),
            eq(outboxEvents.aggregateId, workspace.value.id),
          ),
        ),
    ).toHaveLength(3);
  });

  it("rolls back Portfolio roots, audit, outbox, and idempotency together", async () => {
    const fixture = await seedTenant("portfolio-root-rollback");
    const rollbackScope = createOrganizationScope({
      ...fixture.scope,
      requestId: `request-${fixture.organizationId}-portfolio-rollback`,
    });
    const scoped = createPostgresRepositories(connection.db).forOrganization(
      rollbackScope,
    );
    const key = crypto.randomUUID();
    await expect(
      scoped.unitOfWork.run(async (transactional) => {
        await transactional.portfolios.create(
          { name: "Rolled back", slug: "rolled-back" },
          mutation(key, "/portfolios/create"),
        );
        throw new Error("force Portfolio rollback");
      }),
    ).rejects.toThrow("force Portfolio rollback");
    expect(
      await connection.db
        .select()
        .from(portfolios)
        .where(
          and(
            eq(portfolios.organizationId, fixture.organizationId),
            eq(portfolios.slug, "rolled-back"),
          ),
        ),
    ).toHaveLength(0);
    expect(
      await connection.db
        .select()
        .from(outboxEvents)
        .where(eq(outboxEvents.requestId, rollbackScope.requestId)),
    ).toHaveLength(0);
    expect(
      await connection.db
        .select()
        .from(idempotencyRecords)
        .where(
          and(
            eq(idempotencyRecords.organizationId, fixture.organizationId),
            eq(idempotencyRecords.userId, fixture.userId),
            eq(idempotencyRecords.key, key),
          ),
        ),
    ).toHaveLength(0);
  });

  it("limits application-user updates to the scoped actor's own profile", async () => {
    const first = await seedTenant("shared-user-a");
    const second = await seedTenant("shared-user-b");
    const sharedUserId = `shared-user-${first.organizationId}`;
    await connection.db.transaction(async (transaction) => {
      await transaction.insert(users).values({
        id: sharedUserId,
        email: `${sharedUserId}@example.test`,
        name: "Shared Member",
      });
      await transaction.insert(memberships).values([
        {
          organizationId: first.organizationId,
          userId: sharedUserId,
          role: "member",
        },
        {
          organizationId: second.organizationId,
          userId: sharedUserId,
          role: "member",
        },
      ]);
    });
    const scoped = createPostgresRepositories(connection.db).forOrganization(
      first.scope,
    );
    await expect(
      scoped.users.update(
        sharedUserId,
        { name: "Cross-org mutation" },
        mutation(crypto.randomUUID(), "/users/update"),
      ),
    ).rejects.toMatchObject({ code: "resource_not_found" });
    const [shared] = await connection.db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, sharedUserId));
    expect(shared?.name).toBe("Shared Member");
  });

  it("converts a scoped Inbox capture to one durable work item atomically", async () => {
    const fixture = await seedTenant("inbox-conversion");
    const foreign = await seedTenant("inbox-conversion-foreign");
    const scoped = createPostgresRepositories(connection.db).forOrganization(
      fixture.scope,
    );
    const captured = await scoped.inbox.capture(
      {
        category: "capture",
        title: "Turn this into work",
        body: "Captured details",
      },
      mutation(crypto.randomUUID(), "/inbox/create"),
    );
    const context = mutation(crypto.randomUUID(), "/inbox/convert");
    const conversion = await scoped.inbox.convertToWorkItem(
      captured.value.id,
      captured.value.version,
      { workspaceId: fixture.workspaceA, boardId: fixture.boardA },
      context,
    );
    const replay = await scoped.inbox.convertToWorkItem(
      captured.value.id,
      captured.value.version,
      { workspaceId: fixture.workspaceA, boardId: fixture.boardA },
      context,
    );
    expect(replay).toEqual({ value: conversion.value, replayed: true });
    expect(conversion.value.inboxItem).toMatchObject({
      convertedItemId: conversion.value.workItem.id,
      version: 1,
    });
    expect(conversion.value.workItem).toMatchObject({
      title: "Turn this into work",
      description: "Captured details",
    });
    const [storedCapture] = await connection.db
      .select()
      .from(inboxItems)
      .where(eq(inboxItems.id, captured.value.id));
    expect(storedCapture?.convertedAt).toBeInstanceOf(Date);
    expect(
      await connection.db
        .select()
        .from(workItems)
        .where(eq(workItems.id, conversion.value.workItem.id)),
    ).toHaveLength(1);
    expect(
      await connection.db
        .select()
        .from(outboxEvents)
        .where(
          and(
            eq(outboxEvents.organizationId, fixture.organizationId),
            eq(outboxEvents.requestId, fixture.scope.requestId),
            eq(outboxEvents.aggregateId, captured.value.id),
          ),
        ),
    ).toHaveLength(2);

    const rejected = await scoped.inbox.capture(
      { category: "capture", title: "Must stay captured" },
      mutation(crypto.randomUUID(), "/inbox/create"),
    );
    const rejectedKey = crypto.randomUUID();
    await expect(
      scoped.inbox.convertToWorkItem(
        rejected.value.id,
        0,
        { workspaceId: foreign.workspaceA, boardId: foreign.boardA },
        mutation(rejectedKey, "/inbox/convert"),
      ),
    ).rejects.toMatchObject({ code: "resource_not_found" });
    const [unchanged] = await connection.db
      .select()
      .from(inboxItems)
      .where(eq(inboxItems.id, rejected.value.id));
    expect(unchanged).toMatchObject({ convertedItemId: null, version: 0 });
    expect(
      await connection.db
        .select()
        .from(idempotencyRecords)
        .where(eq(idempotencyRecords.key, rejectedKey)),
    ).toHaveLength(0);
  });

  it("persists scoped item relationships, updates, decisions, approvals, reviews, and snapshots", async () => {
    const fixture = await seedTenant("aggregate-children");
    const other = await seedTenant("aggregate-children-other");
    const scoped = createPostgresRepositories(connection.db).forOrganization(
      fixture.scope,
    );
    const foreign = createPostgresRepositories(connection.db).forOrganization(
      other.scope,
    );
    const task = await scoped.workItems.create(
      createInput(fixture, "Relationship source"),
      mutation(undefined, "/items/create"),
    );
    const dependency = await scoped.workItems.create(
      {
        ...createInput(fixture, "Relationship target"),
        workspaceId: fixture.workspaceB,
        boardId: fixture.boardB,
      },
      mutation(undefined, "/items/create"),
    );
    const foreignItem = await foreign.workItems.create(
      createInput(other, "Foreign target"),
      mutation(undefined, "/items/create"),
    );

    expect(await scoped.itemAssignees.list(task.value.id)).toEqual([
      expect.objectContaining({ id: fixture.userId, name: "Test Owner" }),
    ]);
    await scoped.itemDependencies.add(
      task.value.id,
      task.value.version,
      dependency.value.id,
      "depends_on",
      mutation(crypto.randomUUID(), "/dependencies/create"),
    );
    expect(await scoped.itemDependencies.list(task.value.id)).toEqual([
      expect.objectContaining({ dependsOnItemId: dependency.value.id }),
    ]);
    await expect(
      scoped.itemDependencies.add(
        task.value.id,
        task.value.version + 1,
        foreignItem.value.id,
        "depends_on",
        mutation(crypto.randomUUID(), "/dependencies/create"),
      ),
    ).rejects.toMatchObject({ code: "resource_not_found" });

    const comment = await scoped.comments.create(
      {
        itemId: task.value.id,
        expectedItemVersion: task.value.version + 1,
        body: "Durable comment",
      },
      mutation(crypto.randomUUID(), "/comments/create"),
    );
    expect(await scoped.comments.list(task.value.id)).toContainEqual(
      comment.value,
    );
    await expect(foreign.comments.get(comment.value.id)).rejects.toMatchObject({
      code: "resource_not_found",
    });

    const workspaceUpdate = await scoped.workspaceUpdates.create(
      {
        workspaceId: fixture.workspaceA,
        wins: "Repository surface complete",
        currentPriority: "Integration tests",
        blocker: "None",
        nextMilestone: "Phase 2",
        helpNeeded: "Review",
      },
      mutation(crypto.randomUUID(), "/workspace-updates/create"),
    );
    expect(await scoped.workspaceUpdates.get(workspaceUpdate.value.id)).toEqual(
      workspaceUpdate.value,
    );

    const approval = await scoped.workItems.create(
      {
        ...createInput(fixture, "Approve release"),
        type: "approval",
        approvalState: "pending",
      },
      mutation(undefined, "/items/create"),
    );
    const approved = await scoped.approvals.updateState(
      approval.value.id,
      approval.value.version,
      "approved",
      mutation(crypto.randomUUID(), "/approvals/update"),
    );
    expect(approved.value.approvalState).toBe("approved");

    const decision = await scoped.workItems.create(
      {
        ...createInput(fixture, "Choose release path"),
        type: "decision",
        decisionState: "needed",
      },
      mutation(undefined, "/items/create"),
    );
    const outcome = await scoped.decisions.recordOutcome(
      {
        portfolioId: fixture.portfolioId,
        decisionItemId: decision.value.id,
        outcome: "ship",
        learning: "Tenant constraints hold",
        wouldRepeat: true,
      },
      mutation(crypto.randomUUID(), "/decision-outcomes/create"),
    );
    expect(outcome.value.workspaceId).toBe(fixture.workspaceA);
    await expect(
      foreign.decisions.getOutcome(outcome.value.id),
    ).rejects.toMatchObject({ code: "resource_not_found" });

    const ritual = await scoped.reviews.create(
      {
        portfolioId: fixture.portfolioId,
        workspaceId: fixture.workspaceA,
        type: "weekly",
        cadence: "Friday",
      },
      mutation(crypto.randomUUID(), "/review-rituals/create"),
    );
    expect(await scoped.reviews.get(ritual.value.id)).toEqual(ritual.value);
    const snapshot = await scoped.snapshots.create(
      {
        portfolioId: fixture.portfolioId,
        workspaceId: fixture.workspaceA,
        health: "on_track",
        progress: 0.75,
        openCount: 2,
        overdueCount: 0,
        blockedCount: 0,
        decisionCount: 1,
        attentionCount: 0,
        source: "integration_test",
      },
      mutation(crypto.randomUUID(), "/snapshots/create"),
    );
    expect(await scoped.snapshots.get(snapshot.value.id)).toEqual(
      snapshot.value,
    );
  });

  it("rejects cross-Portfolio decision links at repository and database boundaries", async () => {
    const fixture = await seedTenant("decision-portfolio");
    const scoped = createPostgresRepositories(connection.db).forOrganization(
      fixture.scope,
    );
    const otherPortfolioId = `portfolio-${fixture.organizationId}-other`;
    const otherWorkspaceId = `workspace-${fixture.organizationId}-other`;
    const otherBoardId = `board-${fixture.organizationId}-other`;
    await connection.db.transaction(async (transaction) => {
      await transaction.insert(portfolios).values({
        id: otherPortfolioId,
        organizationId: fixture.organizationId,
        name: "Other Portfolio",
        slug: "other",
      });
      await transaction.insert(workspaces).values({
        id: otherWorkspaceId,
        organizationId: fixture.organizationId,
        portfolioId: otherPortfolioId,
        name: "Other Workspace",
        slug: "other",
        type: "business",
        accentColor: "#334455",
        icon: "O",
        lifecycleStage: "build",
        health: "on_track",
      });
      await transaction.insert(boards).values({
        id: otherBoardId,
        organizationId: fixture.organizationId,
        workspaceId: otherWorkspaceId,
        name: "Other Board",
      });
    });
    const decision = await scoped.workItems.create(
      {
        ...createInput(fixture, "Portfolio-bound decision"),
        type: "decision",
        decisionState: "needed",
      },
      mutation(undefined, "/items/create"),
    );
    await expect(
      scoped.decisions.recordOutcome(
        {
          portfolioId: otherPortfolioId,
          decisionItemId: decision.value.id,
          outcome: "invalid",
          learning: "Must not persist",
        },
        mutation(crypto.randomUUID(), "/decision-outcomes/create"),
      ),
    ).rejects.toMatchObject({ code: "resource_not_found" });
    await expect(
      connection.db.insert(decisionOutcomes).values({
        id: `outcome-${fixture.organizationId}-invalid`,
        organizationId: fixture.organizationId,
        portfolioId: otherPortfolioId,
        workspaceId: otherWorkspaceId,
        decisionItemId: decision.value.id,
        outcome: "invalid",
        learning: "Must fail at the database boundary",
        recordedBy: fixture.userId,
      }),
    ).rejects.toBeTruthy();
  });

  it("ignores archived grants, preserves empty Portfolio grants, and derives lead management without stale grants", async () => {
    const fixture = await seedTenant("access-grants");
    const ownerForRequest = () =>
      createPostgresRepositories(connection.db).forOrganization(
        createOrganizationScope({
          organizationId: fixture.organizationId,
          userId: fixture.userId,
          requestId: crypto.randomUUID(),
        }),
      );
    const userIds = {
      formerLead: `user-${fixture.organizationId}-former-lead`,
      newLead: `user-${fixture.organizationId}-new-lead`,
      archivedPortfolio: `user-${fixture.organizationId}-archived-portfolio`,
      archivedWorkspace: `user-${fixture.organizationId}-archived-workspace`,
      emptyPortfolio: `user-${fixture.organizationId}-empty-portfolio`,
      portfolioManager: `user-${fixture.organizationId}-portfolio-manager`,
    };
    const emptyPortfolioId = `portfolio-${fixture.organizationId}-empty`;
    const archivedPortfolioId = `portfolio-${fixture.organizationId}-archived`;
    await connection.db.transaction(async (transaction) => {
      await transaction.insert(users).values(
        Object.entries(userIds).map(([label, id]) => ({
          id,
          email: `${label}-${fixture.organizationId}@example.test`,
          name: label,
        })),
      );
      await transaction.insert(memberships).values(
        Object.values(userIds).map((userId) => ({
          organizationId: fixture.organizationId,
          userId,
          role: "member" as const,
        })),
      );
      await transaction.insert(portfolios).values([
        {
          id: emptyPortfolioId,
          organizationId: fixture.organizationId,
          name: "Empty granted Portfolio",
          slug: "empty-granted",
        },
        {
          id: archivedPortfolioId,
          organizationId: fixture.organizationId,
          name: "Archived grant Portfolio",
          slug: "archived-grant",
        },
      ]);
      await transaction.insert(portfolioMembers).values([
        {
          organizationId: fixture.organizationId,
          portfolioId: emptyPortfolioId,
          userId: userIds.emptyPortfolio,
          role: "workspace_lead",
        },
        {
          organizationId: fixture.organizationId,
          portfolioId: archivedPortfolioId,
          userId: userIds.archivedPortfolio,
          role: "member",
          archivedAt: new Date("2026-08-28T00:00:00Z"),
        },
        {
          organizationId: fixture.organizationId,
          portfolioId: fixture.portfolioId,
          userId: userIds.portfolioManager,
          role: "workspace_lead",
        },
      ]);
      await transaction.insert(workspaceMembers).values({
        organizationId: fixture.organizationId,
        workspaceId: fixture.workspaceA,
        userId: userIds.archivedWorkspace,
        canManage: true,
        archivedAt: new Date("2026-08-28T00:00:00Z"),
      });
    });

    const scopeFor = (userId: string) =>
      createOrganizationScope({
        organizationId: fixture.organizationId,
        userId,
        requestId: `request-${userId}`,
      });
    const emptySession = await createPostgresRepositories(connection.db)
      .forOrganization(scopeFor(userIds.emptyPortfolio))
      .session.resolve();
    expect(emptySession.portfolioIds).toEqual([emptyPortfolioId]);
    expect(emptySession.managedPortfolioIds).toEqual([emptyPortfolioId]);
    expect(emptySession.workspaceIds).toEqual([]);
    const portfolioManagerSession = await createPostgresRepositories(
      connection.db,
    )
      .forOrganization(scopeFor(userIds.portfolioManager))
      .session.resolve();
    expect(portfolioManagerSession.managedPortfolioIds).toEqual([
      fixture.portfolioId,
    ]);
    expect(portfolioManagerSession.managedWorkspaceIds).toEqual([
      fixture.workspaceA,
      fixture.workspaceB,
    ]);
    for (const userId of [
      userIds.archivedPortfolio,
      userIds.archivedWorkspace,
    ]) {
      const session = await createPostgresRepositories(connection.db)
        .forOrganization(scopeFor(userId))
        .session.resolve();
      expect(session.portfolioIds).toEqual([]);
      expect(session.workspaceIds).toEqual([]);
      expect(session.managedWorkspaceIds).toEqual([]);
      await expect(
        createPostgresRepositories(connection.db)
          .forOrganization(scopeFor(userId))
          .management.getChangeRadar(),
      ).rejects.toMatchObject({ code: "resource_not_found" });
    }

    const workspace = await ownerForRequest().workspaces.create(
      {
        portfolioId: fixture.portfolioId,
        name: "Lead-derived access",
        slug: "lead-derived-access",
        type: "business",
        accentColor: "#123456",
        icon: "L",
        lifecycleStage: "build",
        health: "on_track",
        leadUserId: userIds.formerLead,
      },
      mutation(crypto.randomUUID(), "/workspaces/create"),
    );
    const formerLeadRepositories = createPostgresRepositories(
      connection.db,
    ).forOrganization(scopeFor(userIds.formerLead));
    expect(
      (await formerLeadRepositories.session.resolve()).managedWorkspaceIds,
    ).toContain(workspace.value.id);
    const replaced = await ownerForRequest().workspaces.update(
      workspace.value.id,
      new Date(workspace.value.versionTag),
      { leadUserId: userIds.newLead },
      mutation(crypto.randomUUID(), "/workspaces/update"),
    );
    expect(
      (await formerLeadRepositories.session.resolve()).managedWorkspaceIds,
    ).not.toContain(workspace.value.id);
    expect(
      (
        await createPostgresRepositories(connection.db)
          .forOrganization(scopeFor(userIds.newLead))
          .session.resolve()
      ).managedWorkspaceIds,
    ).toContain(workspace.value.id);

    await connection.db
      .update(workspaceMembers)
      .set({ canManage: true })
      .where(
        and(
          eq(workspaceMembers.organizationId, fixture.organizationId),
          eq(workspaceMembers.workspaceId, workspace.value.id),
          eq(workspaceMembers.userId, userIds.formerLead),
        ),
      );
    const restored = await ownerForRequest().workspaces.update(
      workspace.value.id,
      new Date(replaced.value.versionTag),
      { leadUserId: userIds.formerLead },
      mutation(crypto.randomUUID(), "/workspaces/update"),
    );
    await ownerForRequest().workspaces.update(
      workspace.value.id,
      new Date(restored.value.versionTag),
      { leadUserId: userIds.newLead },
      mutation(crypto.randomUUID(), "/workspaces/update"),
    );
    expect(
      (await formerLeadRepositories.session.resolve()).managedWorkspaceIds,
    ).toContain(workspace.value.id);
  });

  it("does not expose Boards or work items through archived aggregates", async () => {
    const fixture = await seedTenant("archived-aggregates");
    const scoped = createPostgresRepositories(connection.db).forOrganization(
      fixture.scope,
    );
    const item = await scoped.workItems.create(
      createInput(fixture, "Archived aggregate item"),
      mutation(undefined, "/items/create"),
    );
    const archivedAt = new Date("2026-08-29T11:00:00Z");
    const assertHidden = async () => {
      await expect(scoped.boards.get(fixture.boardA)).rejects.toMatchObject({
        code: "resource_not_found",
      });
      expect((await scoped.boards.list()).map(({ id }) => id)).not.toContain(
        fixture.boardA,
      );
      await expect(scoped.workItems.get(item.value.id)).rejects.toMatchObject({
        code: "resource_not_found",
      });
      expect((await scoped.workItems.list()).map(({ id }) => id)).not.toContain(
        item.value.id,
      );
      await expect(
        scoped.workItems.update(
          item.value.id,
          item.value.version,
          { title: "Must stay hidden" },
          mutation(crypto.randomUUID(), "/items/update"),
        ),
      ).rejects.toMatchObject({ code: "resource_not_found" });
      await expect(
        scoped.workItems.create(
          createInput(fixture, "Must not be created"),
          mutation(undefined, "/items/create"),
        ),
      ).rejects.toMatchObject({ code: "resource_not_found" });
    };

    await connection.db
      .update(boards)
      .set({ archivedAt })
      .where(eq(boards.id, fixture.boardA));
    await assertHidden();
    await connection.db
      .update(boards)
      .set({ archivedAt: null })
      .where(eq(boards.id, fixture.boardA));
    await connection.db
      .update(workspaces)
      .set({ archivedAt })
      .where(eq(workspaces.id, fixture.workspaceA));
    await assertHidden();
    await connection.db
      .update(workspaces)
      .set({ archivedAt: null })
      .where(eq(workspaces.id, fixture.workspaceA));
    await connection.db
      .update(portfolios)
      .set({ archivedAt })
      .where(eq(portfolios.id, fixture.portfolioId));
    await assertHidden();
  });

  it("retains an active owner and validates lifecycle state against item type", async () => {
    const fixture = await seedTenant("owner-lifecycle");
    const scoped = createPostgresRepositories(connection.db).forOrganization(
      fixture.scope,
    );
    await expect(
      scoped.memberships.update(
        fixture.userId,
        { role: "member" },
        mutation(crypto.randomUUID(), "/memberships/update"),
      ),
    ).rejects.toMatchObject({ code: "constraint_conflict" });
    await expect(
      scoped.workItems.create(
        {
          ...createInput(fixture, "Invalid task approval"),
          approvalState: "pending",
        },
        mutation(undefined, "/items/create"),
      ),
    ).rejects.toMatchObject({ code: "repository_unavailable" });
    const task = await scoped.workItems.create(
      createInput(fixture, "Lifecycle update target"),
      mutation(undefined, "/items/create"),
    );
    await expect(
      scoped.workItems.update(
        task.value.id,
        task.value.version,
        { decisionState: "needed" },
        mutation(crypto.randomUUID(), "/items/update"),
      ),
    ).rejects.toMatchObject({ code: "repository_unavailable" });

    const secondOwnerId = `user-${fixture.organizationId}-second-owner`;
    await connection.db.insert(users).values({
      id: secondOwnerId,
      email: `${secondOwnerId}@example.test`,
      name: "Second Owner",
    });
    await scoped.memberships.create(
      { userId: secondOwnerId, role: "owner" },
      mutation(crypto.randomUUID(), "/memberships/create"),
    );
    await expect(
      scoped.memberships.update(
        fixture.userId,
        { role: "member" },
        mutation(crypto.randomUUID(), "/memberships/update"),
      ),
    ).resolves.toMatchObject({ value: { role: "member" } });
  });

  it("versions dependency and comment mutations and rejects dependency cycles", async () => {
    const fixture = await seedTenant("aggregate-children");
    const scoped = createPostgresRepositories(connection.db).forOrganization(
      fixture.scope,
    );
    const [first, second, third] = await Promise.all([
      scoped.workItems.create(
        createInput(fixture, "Dependency A"),
        mutation(undefined, "/items/create"),
      ),
      scoped.workItems.create(
        createInput(fixture, "Dependency B"),
        mutation(undefined, "/items/create"),
      ),
      scoped.workItems.create(
        createInput(fixture, "Dependency C"),
        mutation(undefined, "/items/create"),
      ),
    ]);
    await scoped.itemDependencies.add(
      first.value.id,
      0,
      second.value.id,
      "depends_on",
      mutation(crypto.randomUUID(), "/dependencies/create"),
    );
    expect((await scoped.workItems.get(first.value.id)).version).toBe(1);
    await expect(
      scoped.itemDependencies.add(
        first.value.id,
        0,
        third.value.id,
        "depends_on",
        mutation(crypto.randomUUID(), "/dependencies/create"),
      ),
    ).rejects.toMatchObject({ code: "version_conflict" });
    await scoped.itemDependencies.add(
      second.value.id,
      0,
      third.value.id,
      "depends_on",
      mutation(crypto.randomUUID(), "/dependencies/create"),
    );
    await expect(
      scoped.itemDependencies.add(
        third.value.id,
        0,
        first.value.id,
        "depends_on",
        mutation(crypto.randomUUID(), "/dependencies/create"),
      ),
    ).rejects.toMatchObject({ code: "repository_unavailable" });
    await scoped.itemDependencies.remove(
      first.value.id,
      1,
      second.value.id,
      mutation(crypto.randomUUID(), "/dependencies/remove"),
    );
    expect((await scoped.workItems.get(first.value.id)).version).toBe(2);

    const comment = await scoped.comments.create(
      {
        itemId: first.value.id,
        expectedItemVersion: 2,
        body: "Aggregate child",
      },
      mutation(crypto.randomUUID(), "/comments/create"),
    );
    expect((await scoped.workItems.get(first.value.id)).version).toBe(3);
    await expect(
      scoped.comments.create(
        {
          itemId: first.value.id,
          expectedItemVersion: 2,
          body: "Stale child",
        },
        mutation(crypto.randomUUID(), "/comments/create"),
      ),
    ).rejects.toMatchObject({ code: "version_conflict" });
    await scoped.comments.update(
      comment.value.id,
      comment.value.updatedAt,
      3,
      { body: "Edited aggregate child" },
      mutation(
        crypto.randomUUID(),
        "/comments/update",
        new Date("2026-08-29T12:00:00Z"),
      ),
    );
    expect((await scoped.workItems.get(first.value.id)).version).toBe(4);
  });

  it("rejects invalid persisted decision and approval lifecycle values", async () => {
    const fixture = await seedTenant("invalid-lifecycle");
    const scoped = createPostgresRepositories(connection.db).forOrganization(
      fixture.scope,
    );
    const approval = await scoped.workItems.create(
      {
        ...createInput(fixture, "Invalid persisted state"),
        type: "approval",
        approvalState: "pending",
      },
      mutation(undefined, "/items/create"),
    );
    await connection.db
      .update(workItems)
      .set({ typeData: { approvalState: "invented" } })
      .where(
        and(
          eq(workItems.organizationId, fixture.organizationId),
          eq(workItems.id, approval.value.id),
        ),
      );
    await expect(scoped.workItems.get(approval.value.id)).rejects.toMatchObject(
      {
        code: "repository_unavailable",
      },
    );
    const task = await scoped.workItems.create(
      createInput(fixture, "Wrong persisted lifecycle type"),
      mutation(undefined, "/items/create"),
    );
    await connection.db
      .update(workItems)
      .set({ typeData: { decisionState: "needed" } })
      .where(
        and(
          eq(workItems.organizationId, fixture.organizationId),
          eq(workItems.id, task.value.id),
        ),
      );
    await expect(scoped.workItems.get(task.value.id)).rejects.toMatchObject({
      code: "repository_unavailable",
    });
  });

  it("round-trips idempotent Attention, Waiting, Inbox, and weekly-review values", async () => {
    const fixture = await seedTenant("operating-loop");
    const scoped = createPostgresRepositories(connection.db).forOrganization(
      fixture.scope,
    );
    const item = await scoped.workItems.create(
      createInput(fixture, "Operating loop item"),
      mutation(undefined, "/items/create"),
    );
    await connection.db.insert(attentionSignals).values({
      id: `attention-${fixture.organizationId}`,
      organizationId: fixture.organizationId,
      portfolioId: fixture.portfolioId,
      workspaceId: fixture.workspaceA,
      entityType: "work_item",
      entityId: item.value.id,
      signalType: "blocked",
      severity: "high",
      impact: 4,
      urgency: 4,
      reason: "Integration test",
      metadata: {},
    });
    await connection.db.insert(waitingStates).values({
      id: `waiting-${fixture.organizationId}`,
      organizationId: fixture.organizationId,
      portfolioId: fixture.portfolioId,
      workspaceId: fixture.workspaceA,
      entityType: "work_item",
      entityId: item.value.id,
      waitingType: "person",
      waitingSince: new Date("2026-08-20T12:00:00.000Z"),
      followUpOwnerId: fixture.userId,
    });
    await expect(
      connection.db.insert(waitingStates).values({
        id: `waiting-${fixture.organizationId}-wrong-workspace`,
        organizationId: fixture.organizationId,
        portfolioId: fixture.portfolioId,
        workspaceId: fixture.workspaceB,
        entityType: "work_item",
        entityId: item.value.id,
        waitingType: "person",
        waitingSince: new Date("2026-08-20T12:00:00.000Z"),
        followUpOwnerId: fixture.userId,
      }),
    ).rejects.toBeTruthy();

    const attentionContext = mutation(
      crypto.randomUUID(),
      `/attention/${fixture.organizationId}`,
    );
    const attentionFirst = await scoped.attention.act(
      `attention-${fixture.organizationId}`,
      0,
      { action: "snooze", snoozedUntil: new Date("2026-09-01T10:00:00Z") },
      attentionContext,
    );
    const attentionReplay = await scoped.attention.act(
      `attention-${fixture.organizationId}`,
      0,
      { action: "snooze", snoozedUntil: new Date("2026-09-01T10:00:00Z") },
      attentionContext,
    );
    expect(attentionReplay.value).toEqual(attentionFirst.value);
    expect(attentionReplay.value.updatedAt).toBeInstanceOf(Date);

    const waitingContext = mutation(
      crypto.randomUUID(),
      `/waiting/${fixture.organizationId}`,
    );
    await expect(
      scoped.waiting.act(
        `waiting-${fixture.organizationId}`,
        0,
        { action: "reschedule" },
        mutation(crypto.randomUUID(), "/waiting/reschedule"),
      ),
    ).rejects.toMatchObject({ code: "repository_unavailable" });
    const waitingFirst = await scoped.waiting.act(
      `waiting-${fixture.organizationId}`,
      0,
      { action: "reschedule", nextFollowUp: "2026-09-02" },
      waitingContext,
    );
    const waitingReplay = await scoped.waiting.act(
      `waiting-${fixture.organizationId}`,
      0,
      { action: "reschedule", nextFollowUp: "2026-09-02" },
      waitingContext,
    );
    expect(waitingReplay.value).toEqual(waitingFirst.value);

    const inboxContext = mutation(crypto.randomUUID(), "/inbox/create");
    const inboxFirst = await scoped.inbox.capture(
      { category: "capture", title: "Captured once" },
      inboxContext,
    );
    const inboxReplay = await scoped.inbox.capture(
      { category: "capture", title: "Captured once" },
      inboxContext,
    );
    expect(inboxReplay.value).toEqual(inboxFirst.value);

    const reviewContext = mutation(crypto.randomUUID(), "/reviews/create");
    const reviewInput = {
      workspaceId: fixture.workspaceA,
      health: "on_track" as const,
      progress: 0.5,
      progressSummary: "Completed the durable slice",
      blocker: "None",
      nextMilestone: "Ship integration tests",
      priorityNextWeek: "Review",
    };
    const reviewFirst = await scoped.management.submitWeeklyReview(
      reviewInput,
      reviewContext,
    );
    const reviewReplay = await scoped.management.submitWeeklyReview(
      reviewInput,
      reviewContext,
    );
    expect(reviewReplay.value).toEqual(reviewFirst.value);
    expect(reviewReplay.value.update.createdAt).toBeInstanceOf(Date);
    const workspaceAfterReview = await scoped.workspaces.getBySlug("shared-a");
    expect(workspaceAfterReview.health).toBe("on_track");
    expect(workspaceAfterReview.currentPriority).toBeUndefined();
  });
});

describe("migration upgrade", () => {
  it("upgrades a populated 0004 database and preserves cross-Workspace dependencies", async () => {
    const upgradeDatabase = await createTemporaryDatabase();
    try {
      await applyMigrationFiles(upgradeDatabase.url, [
        "0000_cool_loa.sql",
        "0001_adorable_sue_storm.sql",
        "0002_trevv_commercial_delta.sql",
        "0003_wandering_prowler.sql",
        "0004_workspace_domain_rename.sql",
      ]);
      const client = postgres(upgradeDatabase.url, { max: 1, prepare: false });
      try {
        await client.unsafe(`
          insert into organizations (id, name, slug)
          values ('org-upgrade', 'Upgrade', 'upgrade');
          insert into app_users (id, email, name)
          values ('user-upgrade', 'upgrade@example.test', 'Upgrade Owner');
          insert into memberships (organization_id, user_id, role)
          values ('org-upgrade', 'user-upgrade', 'owner');
          insert into portfolios (id, organization_id, name, slug, is_default)
          values ('portfolio-upgrade', 'org-upgrade', 'Main', 'main', true);
          insert into portfolio_members (organization_id, portfolio_id, user_id, role)
          values ('org-upgrade', 'portfolio-upgrade', 'user-upgrade', 'owner');
          insert into workspaces (
            id, organization_id, portfolio_id, name, slug, type,
            accent_color, icon, lifecycle_stage, health, lead_user_id
          ) values
            ('workspace-upgrade-a', 'org-upgrade', 'portfolio-upgrade', 'A', 'a', 'business', '#334455', 'A', 'build', 'on_track', 'user-upgrade'),
            ('workspace-upgrade-b', 'org-upgrade', 'portfolio-upgrade', 'B', 'b', 'business', '#556677', 'B', 'build', 'watch', 'user-upgrade');
          insert into boards (id, organization_id, workspace_id, name)
          values
            ('board-upgrade-a', 'org-upgrade', 'workspace-upgrade-a', 'A'),
            ('board-upgrade-b', 'org-upgrade', 'workspace-upgrade-b', 'B');
          insert into work_items (
            id, organization_id, workspace_id, board_id, title,
            item_type, status, creator_id
          ) values
            ('item-upgrade-a', 'org-upgrade', 'workspace-upgrade-a', 'board-upgrade-a', 'A', 'task', 'working', 'user-upgrade'),
            ('item-upgrade-b', 'org-upgrade', 'workspace-upgrade-b', 'board-upgrade-b', 'B', 'task', 'working', 'user-upgrade');
          insert into item_dependencies (organization_id, item_id, depends_on_item_id)
          values ('org-upgrade', 'item-upgrade-a', 'item-upgrade-b');
          insert into inbox_items (
            id, organization_id, user_id, category, title, body
          ) values (
            'inbox-upgrade', 'org-upgrade', 'user-upgrade', 'capture',
            'Legacy capture', 'Still unconverted'
          );
          insert into waiting_states (
            id, organization_id, portfolio_id, workspace_id, entity_type,
            entity_id, waiting_type, waiting_since, follow_up_owner_id
          ) values (
            'waiting-upgrade', 'org-upgrade', 'portfolio-upgrade',
            'workspace-upgrade-a', 'work_item', 'item-upgrade-a', 'person',
            now(), 'user-upgrade'
          );
        `);
      } finally {
        await client.end();
      }
      await applyMigrationFiles(upgradeDatabase.url, [
        "0005_persistent_data_plane.sql",
      ]);
      const verify = postgres(upgradeDatabase.url, { max: 1, prepare: false });
      try {
        await verify.unsafe(`
          insert into decision_outcomes (
            id, organization_id, portfolio_id, decision_item_id,
            outcome, learning, recorded_by
          ) values (
            'decision-outcome-upgrade', 'org-upgrade', 'portfolio-upgrade',
            'item-upgrade-a', 'as_expected', 'Legacy writer stayed compatible',
            'user-upgrade'
          );
          insert into outbox_events (
            id, organization_id, event_type, aggregate_type, aggregate_id, payload
          ) values (
            'outbox-upgrade', 'org-upgrade', 'legacy.event', 'work_item',
            'item-upgrade-a', '{}'::jsonb
          );
        `);
        const [item] = await verify<
          Array<{ id: string; version: number }>
        >`select id, version from work_items where id = 'item-upgrade-a'`;
        expect(item).toEqual({ id: "item-upgrade-a", version: 0 });
        const [dependency] = await verify<
          Array<{ item_id: string; depends_on_item_id: string }>
        >`select item_id, depends_on_item_id from item_dependencies`;
        expect(dependency).toEqual({
          item_id: "item-upgrade-a",
          depends_on_item_id: "item-upgrade-b",
        });
        const [table] = await verify<
          Array<{ table_name: string | null }>
        >`select to_regclass('public.idempotency_records')::text as table_name`;
        expect(table?.table_name).toBe("idempotency_records");
        const [decision] = await verify<
          Array<{ workspace_id: string }>
        >`select workspace_id from decision_outcomes where id = 'decision-outcome-upgrade'`;
        expect(decision?.workspace_id).toBe("workspace-upgrade-a");
        const [outbox] = await verify<
          Array<{ request_id: string; dedup_key: string }>
        >`select request_id, dedup_key from outbox_events where id = 'outbox-upgrade'`;
        expect(outbox).toEqual({
          request_id: "legacy:outbox-upgrade",
          dedup_key: "legacy:outbox-upgrade",
        });
        const [capture] = await verify<
          Array<{
            converted_item_id: string | null;
            converted_at: Date | null;
            version: number;
          }>
        >`select converted_item_id, converted_at, version from inbox_items where id = 'inbox-upgrade'`;
        expect(capture).toEqual({
          converted_item_id: null,
          converted_at: null,
          version: 0,
        });
        await expect(
          verify`
            update waiting_states
            set workspace_id = 'workspace-upgrade-b'
            where id = 'waiting-upgrade'
          `,
        ).rejects.toBeTruthy();
        await expect(
          verify`
            insert into portfolios (
              id, organization_id, name, slug, is_default
            ) values (
              'portfolio-upgrade-second-default', 'org-upgrade',
              'Second default', 'second-default', true
            )
          `,
        ).rejects.toBeTruthy();
      } finally {
        await verify.end();
      }
    } finally {
      await upgradeDatabase.drop();
    }
  }, 120_000);
});
