import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "../src/schema.js";
import {
  createOrganizationScope,
  createPostgresRepositories,
} from "../src/repositories.js";
import { createWorkerRepositories } from "../src/worker-repositories.js";
import { readOrganizationSnapshotRevision } from "../src/snapshot-revision.js";
import { runOutboxSweep } from "../../../apps/worker/src/index.js";
import { createWorkerHandlerRegistry } from "../../../apps/worker/src/handlers.js";
import { createPostgresAdapter } from "../../../apps/api/src/postgres-adapter.js";
import type { ApiRequestContext } from "../../../apps/api/src/data-plane.js";
import {
  createTemporaryDatabase,
  migrateCurrent,
  type TemporaryDatabase,
} from "./database-test-helper.js";

let temporary: TemporaryDatabase;
let client: ReturnType<typeof postgres>;
let database: ReturnType<typeof drizzle<typeof schema>>;
let statements = 0;
let observedQueries: Array<{ query: string; params: unknown[] }> = [];
beforeAll(async () => {
  temporary = await createTemporaryDatabase();
  await migrateCurrent(temporary.url);
  client = postgres(temporary.url, { max: 10, prepare: false });
  database = drizzle(client, {
    schema,
    logger: {
      logQuery(query, params) {
        observedQueries.push({ query, params });
        statements += 1;
      },
    },
  });
}, 120_000);
afterAll(async () => {
  await client?.end();
  await temporary?.drop();
}, 120_000);

async function seed(label: string, count = 0) {
  const organizationId = `org-budget-${label}`,
    userId = `user-budget-${label}`;
  const portfolioId = `portfolio-budget-${label}`,
    workspaceId = `workspace-budget-${label}`;
  const conversationId = `conversation-budget-${label}-0`;
  const now = new Date(),
    expiresAt = new Date(now.getTime() + 86_400_000);
  await database
    .insert(schema.organizations)
    .values({ id: organizationId, name: "Query budget", slug: organizationId });
  await database
    .insert(schema.users)
    .values({ id: userId, email: `${userId}@example.test`, name: "Owner" });
  await database
    .insert(schema.memberships)
    .values({ organizationId, userId, role: "owner" });
  await database.insert(schema.portfolios).values({
    id: portfolioId,
    organizationId,
    name: "Portfolio",
    slug: portfolioId,
    isDefault: true,
  });
  await database.insert(schema.workspaces).values({
    id: workspaceId,
    organizationId,
    portfolioId,
    name: "Workspace",
    slug: workspaceId,
    type: "business",
    accentColor: "#334455",
    icon: "W",
    lifecycleStage: "build",
    health: "on_track",
    leadUserId: userId,
  });
  if (count) {
    await database.insert(schema.conversations).values(
      Array.from({ length: count }, (_, i) => ({
        id: `conversation-budget-${label}-${i}`,
        organizationId,
        portfolioId,
        workspaceId,
        title: `Conversation ${i}`,
        kind: "workspace",
        visibility: "organization",
        createdBy: userId,
      })),
    );
    await database.insert(schema.conversationParticipants).values(
      Array.from({ length: count }, (_, i) => ({
        organizationId,
        workspaceId,
        conversationId: `conversation-budget-${label}-${i}`,
        userId,
        participantRole: "owner",
      })),
    );
    await database.insert(schema.conversationMessages).values(
      Array.from({ length: count }, (_, i) => ({
        id: `message-budget-${label}-${i}`,
        organizationId,
        workspaceId,
        conversationId,
        senderId: userId,
        clientMessageId: `client-${i}`,
        body: `Message ${i}`,
        expiresAt,
      })),
    );
    await database.insert(schema.collaborationEvents).values(
      Array.from({ length: count }, (_, i) => ({
        id: `event-budget-${label}-${i}`,
        organizationId,
        workspaceId,
        conversationId,
        actorId: userId,
        eventType: "message.sent",
        aggregateType: "message",
        aggregateId: `message-budget-${label}-${i}`,
        expiresAt,
      })),
    );
  }
  const context: ApiRequestContext = {
    access: {
      userId,
      organizationId,
      role: "owner",
      accessiblePortfolioIds: new Set([portfolioId]),
      managedPortfolioIds: new Set([portfolioId]),
      accessibleWorkspaceIds: new Set([workspaceId]),
      managedWorkspaceIds: new Set([workspaceId]),
    },
    requestId: `request-${label}`,
    now,
    newId: () => crypto.randomUUID(),
  };
  const repositories = createPostgresRepositories(database);
  const { dataPlane } = createPostgresAdapter({
    repositories,
    resolveIdentity: async () => null,
  });
  const scoped = repositories.forOrganization(
    createOrganizationScope({
      organizationId,
      userId,
      requestId: context.requestId,
    }),
  );
  return {
    organizationId,
    userId,
    portfolioId,
    workspaceId,
    conversationId,
    context,
    scoped,
    dataPlane,
    expiresAt,
  };
}

describe("backend SQL budgets and pagination preservation", () => {
  it.each([1, 10, 100])(
    "keeps hydration and repeated-event authorization constant for %i rows",
    async (count) => {
      const fixture = await seed(`count-${count}`, count);
      statements = 0;
      const conversations = await fixture.dataPlane.listConversations(
        fixture.context,
        { workspaceId: fixture.workspaceId, limit: 100 },
      );
      expect(conversations.data).toHaveLength(count);
      expect(statements).toBe(9);
      statements = 0;
      expect(
        await fixture.dataPlane.getConversationUnread!(
          fixture.context,
          fixture.workspaceId,
        ),
      ).toEqual({ unreadCount: 0 });
      expect(statements).toBe(4);
      statements = 0;
      const messages = await fixture.dataPlane.listConversationMessages(
        fixture.context,
        fixture.conversationId,
        { limit: 100 },
      );
      expect(messages.data).toHaveLength(count);
      expect(messages.nextCursor).toBeNull();
      expect(statements).toBe(8);
      statements = 0;
      const events = await fixture.dataPlane.listCollaborationEvents(
        fixture.context,
        fixture.workspaceId,
        0,
      );
      expect(events.events).toHaveLength(count);
      expect(statements).toBe(6);
      // Distinct conversations are batched too, rather than one query per unique ID.
      for (let i = 0; i < count; i++)
        await database
          .update(schema.collaborationEvents)
          .set({ conversationId: `conversation-budget-count-${count}-${i}` })
          .where(
            eq(
              schema.collaborationEvents.id,
              `event-budget-count-${count}-${i}`,
            ),
          );
      statements = 0;
      expect(
        (
          await fixture.dataPlane.listCollaborationEvents(
            fixture.context,
            fixture.workspaceId,
            0,
          )
        ).events,
      ).toHaveLength(count);
      expect(statements).toBe(6);
    },
  );

  it("preserves read checkpoints, expiry redaction, reaction membership and revoked private access", async () => {
    const f = await seed("semantics", 10);
    const senderId = "budget-second-sender";
    await database.insert(schema.users).values({
      id: senderId,
      email: `${senderId}@example.test`,
      name: "Sender",
    });
    await database.insert(schema.memberships).values({
      organizationId: f.organizationId,
      userId: senderId,
      role: "member",
    });
    await database.insert(schema.conversationParticipants).values({
      organizationId: f.organizationId,
      workspaceId: f.workspaceId,
      conversationId: f.conversationId,
      userId: senderId,
    });
    await database
      .update(schema.conversationMessages)
      .set({ senderId, responseOwnerId: f.userId, responseState: "open" })
      .where(eq(schema.conversationMessages.conversationId, f.conversationId));
    await database.insert(schema.conversationReadCheckpoints).values({
      organizationId: f.organizationId,
      workspaceId: f.workspaceId,
      conversationId: f.conversationId,
      userId: f.userId,
      lastReadMessageId: "message-budget-semantics-4",
    });
    await database
      .update(schema.conversationMessages)
      .set({
        createdAt: new Date(Date.now() - 2000),
        expiresAt: new Date(Date.now() - 1000),
        metadata: { obsolete: "private" },
      })
      .where(eq(schema.conversationMessages.id, "message-budget-semantics-9"));
    await database.insert(schema.conversationReactions).values({
      organizationId: f.organizationId,
      workspaceId: f.workspaceId,
      conversationId: f.conversationId,
      messageId: "message-budget-semantics-8",
      userId: senderId,
      emoji: "👍",
    });
    const list = await f.scoped.collaboration.listConversations(f.workspaceId);
    const conversation = list.data.find(
      ({ conversation }) => conversation.id === f.conversationId,
    )!;
    expect(conversation.unreadCount).toBe(5); // Expired messages still contribute to unread, as before.
    expect(conversation.needsResponseCount).toBe(9);
    expect(
      await f.dataPlane.getConversationUnread!(f.context, f.workspaceId),
    ).toEqual({ unreadCount: 5 });
    expect(
      conversation.participants.find(({ user }) => user.id === f.userId)
        ?.checkpoint?.lastReadMessageId,
    ).toBe("message-budget-semantics-4");
    const messages = await f.scoped.collaboration.listMessages(
      f.conversationId,
    );
    expect(messages.data[0]?.message).toMatchObject({
      body: "[Message expired]",
      metadata: {},
    });
    expect(messages.data[1]?.reactions).toEqual([
      { emoji: "👍", userIds: [senderId], reactedByCurrentUser: false },
    ]);
    await database
      .update(schema.conversationParticipants)
      .set({ removedAt: new Date() })
      .where(
        and(
          eq(schema.conversationParticipants.conversationId, f.conversationId),
          eq(schema.conversationParticipants.userId, senderId),
        ),
      );
    expect(
      (await f.scoped.collaboration.listMessages(f.conversationId)).data[1]
        ?.reactions,
    ).toEqual([]);
    await database
      .update(schema.conversations)
      .set({ visibility: "private" })
      .where(eq(schema.conversations.id, f.conversationId));
    const before = await f.dataPlane.listCollaborationEvents(
      f.context,
      f.workspaceId,
      0,
    );
    expect(before.events).toHaveLength(10);
    await database
      .update(schema.conversationParticipants)
      .set({ removedAt: new Date() })
      .where(
        and(
          eq(schema.conversationParticipants.conversationId, f.conversationId),
          eq(schema.conversationParticipants.userId, f.userId),
        ),
      );
    const after = await f.dataPlane.listCollaborationEvents(
      f.context,
      f.workspaceId,
      0,
    );
    expect(after.events).toEqual([]);
    expect(
      await f.dataPlane.getConversationUnread!(f.context, f.workspaceId),
    ).toEqual({ unreadCount: 0 });
    expect(after.nextCursor).toBe(before.nextCursor);
    expect(
      await f.scoped.collaboration.listConversationAccess([
        f.conversationId,
        "missing",
      ]),
    ).toEqual([]);
    await expect(
      f.dataPlane.listConversationMessages(f.context, f.conversationId, {
        limit: 100,
      }),
    ).rejects.toMatchObject({ code: "resource_not_found" });
  });

  it("terminates exactly at 9999/10000/10001 items and crosses empty Workspace boundaries", async () => {
    const f = await seed("pagination");
    const boardId = "board-budget-pagination";
    await database.insert(schema.boards).values({
      id: boardId,
      organizationId: f.organizationId,
      workspaceId: f.workspaceId,
      name: "Board",
    });
    const values = Array.from({ length: 10001 }, (_, i) => ({
      id: `item-budget-${String(i).padStart(5, "0")}`,
      organizationId: f.organizationId,
      workspaceId: f.workspaceId,
      boardId,
      title: `Item ${i}`,
      itemType: "task",
      status: "working",
      creatorId: f.userId,
      ordering: i,
    }));
    for (let offset = 0; offset < 9999; offset += 500)
      await database
        .insert(schema.workItems)
        .values(values.slice(offset, Math.min(offset + 500, 9999)));
    for (const count of [9999, 10000, 10001]) {
      if (count > 9999)
        await database.insert(schema.workItems).values(values[count - 1]!);
      const ids: string[] = [];
      let cursor: string | undefined;
      let pages = 0;
      do {
        const page = await f.dataPlane.listItems(f.context, {
          limit: 100,
          ...(cursor ? { cursor } : {}),
        });
        ids.push(...page.data.map(({ id }) => id));
        pages += 1;
        cursor = page.nextCursor ?? undefined;
        expect(pages).toBeLessThanOrEqual(Math.ceil(count / 100));
      } while (cursor);
      expect(ids).toHaveLength(count);
      expect(new Set(ids).size).toBe(count);
      expect(pages).toBe(Math.ceil(count / 100));
    }
    // An empty trailing Workspace must not create a spurious page.
    f.context.access.accessibleWorkspaceIds.add("zz-empty");
    await database.insert(schema.workspaces).values({
      id: "zz-empty",
      organizationId: f.organizationId,
      portfolioId: f.portfolioId,
      name: "Empty",
      slug: "empty",
      type: "business",
      accentColor: "#334455",
      icon: "W",
      lifecycleStage: "build",
      health: "on_track",
      leadUserId: f.userId,
    });
    const cursor = Buffer.from(
      JSON.stringify({ workspaceIndex: 0, offset: 10000 }),
    ).toString("base64url");
    const last = await f.dataPlane.listItems(f.context, { limit: 1, cursor });
    expect(last.data).toHaveLength(1);
    expect(last.nextCursor).toBeNull();
  }, 60_000);
});

describe("worker and latest-update query preservation", () => {
  it("batches 10,000 cold signals, daily refreshes, notifications and resolutions without changing user actions", async () => {
    const f = await seed("worker-cold");
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 86_400_000);
    const yesterday = new Date(now.getTime() - 86_400_000)
      .toISOString()
      .slice(0, 10);
    const boardId = "board-worker-cold";
    await database.insert(schema.boards).values({
      id: boardId,
      organizationId: f.organizationId,
      workspaceId: f.workspaceId,
      name: "Cold worker board",
    });
    for (let offset = 0; offset < 10_000; offset += 250)
      await database.insert(schema.workItems).values(
        Array.from({ length: 250 }, (_, index) => ({
          id: `worker-cold-${offset + index}`,
          organizationId: f.organizationId,
          workspaceId: f.workspaceId,
          boardId,
          creatorId: f.userId,
          title: `Overdue ${offset + index}`,
          itemType: "task",
          status: "working",
          priority: "normal",
          dueDate: yesterday,
          updatedAt: now,
        })),
      );
    const worker = createWorkerRepositories(database);
    statements = 0;
    expect(
      await worker.attention.recomputeOrganization(f.organizationId, now),
    ).toMatchObject({
      created: 10_000,
      refreshed: 0,
      resolved: 0,
      notifications: 10_000,
    });
    const coldStatements = statements;
    expect(coldStatements).toBeLessThanOrEqual(100);
    const originalSignals = await database
      .select()
      .from(schema.attentionSignals)
      .where(eq(schema.attentionSignals.organizationId, f.organizationId));
    const originalNotifications = await database
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.organizationId, f.organizationId));
    expect(originalSignals).toHaveLength(10_000);
    expect(originalNotifications).toHaveLength(10_000);
    expect(
      new Set(originalNotifications.map(({ dedupKey }) => dedupKey)).size,
    ).toBe(10_000);
    const revision = await readOrganizationSnapshotRevision(
      database,
      f.organizationId,
      now,
    );
    statements = 0;
    expect(
      await worker.attention.recomputeOrganization(f.organizationId, now),
    ).toMatchObject({
      created: 0,
      refreshed: 0,
      resolved: 0,
      notifications: 0,
    });
    const unchangedStatements = statements;
    expect(unchangedStatements).toBeLessThanOrEqual(12);
    expect(
      await readOrganizationSnapshotRevision(database, f.organizationId, now),
    ).toBe(revision);
    const dismissedId = originalSignals[0]!.id;
    const snoozedId = originalSignals[1]!.id;
    const snoozedUntil = new Date(now.getTime() + 3 * 86_400_000);
    await database
      .update(schema.attentionSignals)
      .set({ dismissedAt: now, actionReason: "Reviewed", version: 1 })
      .where(eq(schema.attentionSignals.id, dismissedId));
    await database
      .update(schema.attentionSignals)
      .set({ snoozedUntil, actionReason: "Later", version: 1 })
      .where(eq(schema.attentionSignals.id, snoozedId));
    await database
      .update(schema.notifications)
      .set({ readAt: now })
      .where(eq(schema.notifications.id, originalNotifications[0]!.id));
    statements = 0;
    expect(
      await worker.attention.recomputeOrganization(f.organizationId, tomorrow),
    ).toMatchObject({
      created: 0,
      refreshed: 9_999,
      resolved: 0,
      notifications: 0,
    });
    const dailyRefreshStatements = statements;
    expect(dailyRefreshStatements).toBeLessThanOrEqual(55);
    const refreshedSignals = await database
      .select()
      .from(schema.attentionSignals)
      .where(eq(schema.attentionSignals.organizationId, f.organizationId));
    expect(new Set(refreshedSignals.map(({ id }) => id))).toEqual(
      new Set(originalSignals.map(({ id }) => id)),
    );
    expect(refreshedSignals.find(({ id }) => id === dismissedId)).toMatchObject(
      {
        dismissedAt: now,
        actionReason: "Reviewed",
        version: 1,
        updatedAt: now,
      },
    );
    expect(refreshedSignals.find(({ id }) => id === snoozedId)).toMatchObject({
      snoozedUntil,
      actionReason: "Later",
      version: 1,
      updatedAt: tomorrow,
    });
    const repeatedNotifications = await database
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.organizationId, f.organizationId));
    expect(new Set(repeatedNotifications.map(({ id }) => id))).toEqual(
      new Set(originalNotifications.map(({ id }) => id)),
    );
    expect(
      repeatedNotifications.find(
        ({ id }) => id === originalNotifications[0]!.id,
      )?.readAt,
    ).toEqual(now);
    await database
      .update(schema.workItems)
      .set({ status: "done", updatedAt: tomorrow })
      .where(eq(schema.workItems.organizationId, f.organizationId));
    statements = 0;
    expect(
      await worker.attention.recomputeOrganization(f.organizationId, tomorrow),
    ).toMatchObject({
      created: 0,
      refreshed: 0,
      resolved: 9_999,
      notifications: 0,
    });
    const resolutionStatements = statements;
    expect(resolutionStatements).toBeLessThanOrEqual(55);
    console.info(
      "COLD_ATTENTION_BUDGET",
      JSON.stringify({
        items: 10_000,
        signals: 10_000,
        notifications: 10_000,
        batchSize: 250,
        coldStatements,
        unchangedStatements,
        dailyRefreshStatements,
        resolutionStatements,
        preservedDismissedSignals: 1,
        preservedSnoozedSignals: 1,
      }),
    );
  }, 120_000);

  it("does not rewrite unchanged signals, loads only relevant history, and coalesces leased attention work", async () => {
    const f = await seed("worker-budget");
    const now = new Date();
    const boardId = "board-worker-budget";
    await database.insert(schema.boards).values({
      id: boardId,
      organizationId: f.organizationId,
      workspaceId: f.workspaceId,
      name: "Worker board",
    });
    await database.insert(schema.workItems).values(
      Array.from({ length: 10 }, (_, index) => ({
        id: `worker-budget-${index}`,
        organizationId: f.organizationId,
        workspaceId: f.workspaceId,
        boardId,
        creatorId: f.userId,
        title: `Blocked ${index}`,
        itemType: "task",
        status: "blocked",
        priority: "normal",
        updatedAt: now,
      })),
    );
    const worker = createWorkerRepositories(database);
    expect(
      await worker.attention.recomputeOrganization(f.organizationId, now),
    ).toMatchObject({ created: 10, notifications: 10 });
    const [signal] = await database
      .select()
      .from(schema.attentionSignals)
      .where(eq(schema.attentionSignals.organizationId, f.organizationId));
    for (let offset = 0; offset < 1000; offset += 250)
      await database.insert(schema.attentionSignals).values(
        Array.from({ length: 250 }, (_, index) => ({
          ...signal!,
          id: `old-signal-${offset + index}`,
          sourceFingerprint: `old-fingerprint-${offset + index}`,
          resolvedAt: now,
        })),
      );
    const before = await readOrganizationSnapshotRevision(
      database,
      f.organizationId,
      now,
    );
    statements = 0;
    observedQueries = [];
    expect(
      await worker.attention.recomputeOrganization(f.organizationId, now),
    ).toMatchObject({
      created: 0,
      refreshed: 0,
      resolved: 0,
      notifications: 0,
    });
    const noopStatements = statements;
    expect(noopStatements).toBeLessThanOrEqual(12);
    expect(
      observedQueries.some(({ query }) =>
        /^update "attention_signals"/.test(query),
      ),
    ).toBe(false);
    const historicalRead = observedQueries.find(
      ({ query }) =>
        query.startsWith("select") &&
        query.includes('from "attention_signals"'),
    )!;
    const [explained] = await client.unsafe(
      `explain (analyze, buffers, format json) ${historicalRead.query}`,
      historicalRead.params as never[],
    );
    const plan = explained!["QUERY PLAN"][0];
    expect(plan.Plan["Actual Rows"]).toBe(10);
    expect(
      await readOrganizationSnapshotRevision(database, f.organizationId, now),
    ).toBe(before);
    const eventTime = new Date();
    await database.insert(schema.outboxEvents).values(
      Array.from({ length: 10 }, (_, index) => ({
        id: `worker-budget-event-${index}`,
        organizationId: f.organizationId,
        aggregateType: "work_item",
        aggregateId: `worker-budget-${index}`,
        eventType: "item.updated",
        payload: {},
        availableAt: eventTime,
        createdAt: eventTime,
      })),
    );
    observedQueries = [];
    statements = 0;
    const result = await runOutboxSweep(
      { now: eventTime, requestId: "worker-budget" },
      {
        repositories: worker,
        handlerRegistry: createWorkerHandlerRegistry(),
        workerId: "worker-budget",
        enabled: true,
        batchSize: 10,
        concurrency: 10,
        leaseMs: 30000,
        maxAttempts: 3,
      },
    );
    const coalescedStatements = statements;
    expect(result).toMatchObject({
      processed: 10,
      failed: 0,
      leaseLost: 0,
      effects: 0,
    });
    expect(
      observedQueries.filter(({ query }) =>
        query.includes("pg_advisory_xact_lock"),
      ),
    ).toHaveLength(1);
    const attempts = await database
      .select()
      .from(schema.outboxAttempts)
      .where(eq(schema.outboxAttempts.organizationId, f.organizationId));
    expect(attempts).toHaveLength(10);
    expect(attempts.every(({ status }) => status === "succeeded")).toBe(true);
    await database.insert(schema.outboxEvents).values(
      Array.from({ length: 10 }, (_, index) => ({
        id: `worker-budget-individual-${index}`,
        organizationId: f.organizationId,
        aggregateType: "work_item",
        aggregateId: `worker-budget-${index}`,
        eventType: "item.updated",
        payload: {},
        availableAt: eventTime,
        createdAt: eventTime,
      })),
    );
    statements = 0;
    const individualLeases = await worker.outbox.lease({
      workerId: "individual-budget",
      now: new Date(),
      leaseMs: 30000,
      maxAttempts: 3,
      limit: 10,
      eventTypes: ["item.updated"],
    });
    expect(individualLeases).toHaveLength(10);
    await Promise.all(
      individualLeases.map((lease) =>
        worker.outbox.process(lease, (transaction) =>
          transaction.processInternalEvent(eventTime),
        ),
      ),
    );
    const individualStatements = statements;
    expect(coalescedStatements).toBeLessThan(individualStatements);
    console.info(
      "WORKER_QUERY_BUDGET",
      JSON.stringify({
        signals: 10,
        historicalSignals: 1000,
        unchangedRecomputeStatements: noopStatements,
        returnedHistoryRows: plan.Plan["Actual Rows"],
        historicalReadMs: plan["Execution Time"],
        coalescedEvents: 10,
        recomputations: 1,
        coalescedStatements,
        individualStatements,
        historicalPlan: plan.Plan,
      }),
    );
  });

  it("selects latest updates with stable ID ties without loading or deleting older history", async () => {
    const f = await seed("latest-updates");
    const publishedAt = new Date();
    const updates = Array.from({ length: 1000 }, (_, index) => ({
      id: `update-budget-${String(index).padStart(4, "0")}`,
      organizationId: f.organizationId,
      workspaceId: f.workspaceId,
      authorId: f.userId,
      wins: `Update ${index}`,
      currentPriority: "",
      blocker: "",
      nextMilestone: "",
      helpNeeded: "",
      publishedAt: new Date(publishedAt.getTime() - 60000 * index),
    }));
    for (let offset = 0; offset < updates.length; offset += 250)
      await database
        .insert(schema.workspaceUpdates)
        .values(updates.slice(offset, offset + 250));
    await database.insert(schema.workspaceUpdates).values([
      { ...updates[0]!, id: "zz-latest-tie", wins: "Latest tie" },
      {
        ...updates[0]!,
        id: "zz-deleted",
        publishedAt: new Date(publishedAt.getTime() + 1000),
        deletedAt: publishedAt,
      },
    ]);
    observedQueries = [];
    const summaries = await f.scoped.workspaces.list();
    expect(summaries[0]?.latestUpdate).toMatchObject({
      id: "zz-latest-tie",
      text: "Latest tie",
    });
    const query = observedQueries.find(({ query }) =>
      query.includes("join lateral"),
    )!;
    const [explained] = await client.unsafe(
      `explain (analyze, buffers, format json) ${query.query}`,
      query.params as never[],
    );
    const optimized = explained!["QUERY PLAN"][0];
    expect(optimized.Plan["Actual Rows"]).toBe(1);
    const [baseline] =
      await client`explain (analyze, buffers, format json) select * from workspace_updates where organization_id = ${f.organizationId} and workspace_id = ${f.workspaceId} and deleted_at is null order by published_at desc, id desc`;
    const original = baseline!["QUERY PLAN"][0];
    expect(original.Plan["Actual Rows"]).toBe(1001);
    expect(
      await database
        .select()
        .from(schema.workspaceUpdates)
        .where(eq(schema.workspaceUpdates.organizationId, f.organizationId)),
    ).toHaveLength(1002);
    console.info(
      "LATEST_UPDATE_PLAN",
      JSON.stringify({
        historyRows: 1002,
        baselineReturnedRows: original.Plan["Actual Rows"],
        optimizedReturnedRows: optimized.Plan["Actual Rows"],
        baselineMs: original["Execution Time"],
        optimizedMs: optimized["Execution Time"],
        baselineBuffers: original.Plan["Shared Hit Blocks"],
        optimizedBuffers: optimized.Plan["Shared Hit Blocks"],
        baselinePlan: original.Plan,
        optimizedPlan: optimized.Plan,
      }),
    );
  });
});

describe("authorized app summary", () => {
  it("preserves complete item and distinct attention counts with SQL scope and active-state rules", async () => {
    const f = await seed("summary");
    const now = new Date();
    const boardId = "board-summary",
      archivedBoardId = "board-summary-archived";
    await database.insert(schema.boards).values([
      {
        id: boardId,
        organizationId: f.organizationId,
        workspaceId: f.workspaceId,
        name: "Summary",
      },
      {
        id: archivedBoardId,
        organizationId: f.organizationId,
        workspaceId: f.workspaceId,
        name: "Archived",
        archivedAt: now,
      },
    ]);
    await database.insert(schema.workItems).values(
      [
        { id: "summary-working", status: "working", itemType: "task" },
        { id: "summary-blocked", status: "blocked", itemType: "task" },
        {
          id: "summary-pending",
          status: "working",
          itemType: "decision",
          typeData: { decisionState: "needed" },
        },
        {
          id: "summary-deferred",
          status: "working",
          itemType: "decision",
          typeData: { decisionState: "deferred" },
        },
        {
          id: "summary-done",
          status: "done",
          itemType: "decision",
          typeData: { decisionState: "needed" },
        },
        {
          id: "summary-decided",
          status: "working",
          itemType: "decision",
          typeData: { decisionState: "decided" },
        },
        {
          id: "summary-missing-state",
          status: "working",
          itemType: "decision",
        },
        {
          id: "summary-deleted",
          status: "blocked",
          itemType: "task",
          deletedAt: now,
        },
        {
          id: "summary-archived-board",
          status: "blocked",
          itemType: "task",
          boardId: archivedBoardId,
        },
      ].map((item) => ({
        organizationId: f.organizationId,
        workspaceId: f.workspaceId,
        boardId,
        creatorId: f.userId,
        title: item.id,
        ...item,
      })),
    );
    const base = {
      organizationId: f.organizationId,
      portfolioId: f.portfolioId,
      workspaceId: f.workspaceId,
      entityType: "work_item",
      entityId: "summary-working",
      signalType: "blocked_work",
      severity: "high" as const,
      impact: 4,
      urgency: 4,
      reason: "Summary signal",
      sourceOccurredAt: now,
      computedAt: now,
    };
    await database.insert(schema.attentionSignals).values(
      [
        { id: "summary-signal-1", reasonCode: "summary.first" },
        { id: "summary-signal-2", reasonCode: "summary.second" },
        {
          id: "summary-portfolio",
          reasonCode: "summary.portfolio",
          workspaceId: null,
        },
        {
          id: "summary-snoozed",
          reasonCode: "summary.snoozed",
          entityId: "snoozed",
          snoozedUntil: new Date(now.getTime() + 60000),
        },
        {
          id: "summary-dismissed",
          reasonCode: "summary.dismissed",
          entityId: "dismissed",
          dismissedAt: now,
        },
        {
          id: "summary-resolved",
          reasonCode: "summary.resolved",
          entityId: "resolved",
          resolvedAt: now,
        },
      ].map((row) => ({ ...base, ...row, sourceFingerprint: row.id })),
    );
    statements = 0;
    observedQueries = [];
    const summary = await f.dataPlane.getSummary!(f.context);
    expect(statements).toBe(2);
    expect(summary).toEqual({
      workspaces: [
        {
          workspaceId: f.workspaceId,
          open: 6,
          blocked: 1,
          pendingDecisions: 3,
          attention: 2,
          attentionEntities: 1,
        },
      ],
      portfolios: [
        { portfolioId: f.portfolioId, attention: 3, attentionEntities: 1 },
      ],
    });
    expect(
      observedQueries.every(
        ({ query }) =>
          !query.includes('"body"') && !query.includes('"description"'),
      ),
    ).toBe(true);
    const limitedContext = {
      ...f.context,
      access: {
        ...f.context.access,
        accessibleWorkspaceIds: new Set<string>(),
      },
    };
    expect(await f.dataPlane.getSummary!(limitedContext)).toEqual({
      workspaces: [],
      portfolios: [
        { portfolioId: f.portfolioId, attention: 1, attentionEntities: 1 },
      ],
    });
    const foreign = await seed("summary-foreign");
    expect(await foreign.dataPlane.getSummary!(foreign.context)).toEqual({
      workspaces: [
        {
          workspaceId: foreign.workspaceId,
          open: 0,
          blocked: 0,
          pendingDecisions: 0,
          attention: 0,
          attentionEntities: 0,
        },
      ],
      portfolios: [
        {
          portfolioId: foreign.portfolioId,
          attention: 0,
          attentionEntities: 0,
        },
      ],
    });
    await expect(
      f.dataPlane.listWaiting(
        {
          ...limitedContext,
          access: { ...limitedContext.access, role: "member" },
        },
        { workspaceId: f.workspaceId },
      ),
    ).rejects.toMatchObject({ code: "resource_not_found" });
  });
});
