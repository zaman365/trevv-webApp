import { and, eq, inArray, sql } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDatabase,
  createOrganizationScope,
  createPostgresRepositories,
  createWorkerRepositories,
  type TrevvDatabase,
} from "../src/index.js";
import {
  attentionSignals,
  boards,
  conversationMessageMetadataQuarantine,
  conversationMessages,
  conversationParticipants,
  conversations,
  idempotencyRecords,
  itemAssignees,
  memberships,
  notifications,
  organizations,
  outboxAttempts,
  outboxEvents,
  portfolioMembers,
  portfolios,
  users,
  waitingStates,
  workItems,
  workspaceMembers,
  workspaceUpdates,
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

interface WorkerFixture {
  organizationId: string;
  userId: string;
  portfolioId: string;
  workspaceId: string;
  boardId: string;
}

let sequence = 0;

async function seedWorkerFixture(
  database: TrevvDatabase,
  label: string,
  input?: { timezone?: string; createdAt?: Date },
): Promise<WorkerFixture> {
  sequence += 1;
  const prefix = `${label}-${sequence}`;
  const organizationId = `org-${prefix}`;
  const userId = `user-${prefix}`;
  const portfolioId = `portfolio-${prefix}`;
  const workspaceId = `workspace-${prefix}`;
  const boardId = `board-${prefix}`;
  const createdAt = input?.createdAt ?? new Date("2026-08-29T10:00:00.000Z");
  await database.transaction(async (transaction) => {
    await transaction.insert(organizations).values({
      id: organizationId,
      name: `Organization ${prefix}`,
      slug: prefix,
      timezone: input?.timezone ?? "Europe/Berlin",
      createdAt,
      updatedAt: createdAt,
    });
    await transaction.insert(users).values({
      id: userId,
      email: `${prefix}@example.test`,
      name: `Owner ${prefix}`,
      createdAt,
      updatedAt: createdAt,
    });
    await transaction.insert(memberships).values({
      organizationId,
      userId,
      role: "owner",
      createdAt,
      updatedAt: createdAt,
    });
    await transaction.insert(portfolios).values({
      id: portfolioId,
      organizationId,
      name: `Portfolio ${prefix}`,
      slug: prefix,
      isDefault: true,
      createdAt,
      updatedAt: createdAt,
    });
    await transaction.insert(portfolioMembers).values({
      organizationId,
      portfolioId,
      userId,
      role: "owner",
      createdAt,
      updatedAt: createdAt,
    });
    await transaction.insert(workspaces).values({
      id: workspaceId,
      organizationId,
      portfolioId,
      name: `Workspace ${prefix}`,
      slug: prefix,
      type: "business",
      accentColor: "#334455",
      icon: "W",
      lifecycleStage: "build",
      health: "on_track",
      leadUserId: userId,
      createdAt,
      updatedAt: createdAt,
    });
    await transaction.insert(workspaceMembers).values({
      organizationId,
      workspaceId,
      userId,
      canManage: true,
      createdAt,
      updatedAt: createdAt,
    });
    await transaction.insert(boards).values({
      id: boardId,
      organizationId,
      workspaceId,
      name: `Board ${prefix}`,
      createdAt,
      updatedAt: createdAt,
    });
  });
  return { organizationId, userId, portfolioId, workspaceId, boardId };
}

async function insertOutboxEvent(
  database: TrevvDatabase,
  fixture: WorkerFixture,
  label: string,
  eventType = "item.updated",
) {
  const id = `event-${label}-${sequence}`;
  await database.insert(outboxEvents).values({
    id,
    organizationId: fixture.organizationId,
    eventType,
    aggregateType: "work_item",
    aggregateId: `item-${label}`,
    requestId: `request-${label}`,
    dedupKey: `dedup-${label}-${sequence}`,
    payload: { label },
    availableAt: new Date("2026-08-29T10:00:00.000Z"),
    createdAt: new Date("2026-08-29T10:00:00.000Z"),
  });
  return id;
}

async function insertRetentionMessage(
  database: TrevvDatabase,
  fixture: WorkerFixture,
  label: string,
  expiresAt: Date,
) {
  const conversationId = `conversation-retention-${label}-${sequence}`;
  const messageId = `message-retention-${label}-${sequence}`;
  const createdAt = new Date("2026-08-29T09:00:00.000Z");
  await database.transaction(async (transaction) => {
    await transaction.insert(conversations).values({
      id: conversationId,
      organizationId: fixture.organizationId,
      portfolioId: fixture.portfolioId,
      workspaceId: fixture.workspaceId,
      title: `Retention ${label}`,
      kind: "workspace",
      visibility: "organization",
      createdBy: fixture.userId,
      lastMessageAt: createdAt,
      retentionDays: 365,
      createdAt,
      updatedAt: createdAt,
    });
    await transaction.insert(conversationParticipants).values({
      organizationId: fixture.organizationId,
      workspaceId: fixture.workspaceId,
      conversationId,
      userId: fixture.userId,
      participantRole: "owner",
      source: "workspace",
      joinedAt: createdAt,
      updatedAt: createdAt,
    });
    await transaction.insert(conversationMessages).values({
      id: messageId,
      organizationId: fixture.organizationId,
      workspaceId: fixture.workspaceId,
      conversationId,
      senderId: fixture.userId,
      clientMessageId: `client-retention-${label}-${sequence}`,
      body: `Private message ${label}`,
      responseOwnerId: fixture.userId,
      responseState: "open",
      metadata: { privateContext: "must be removed" },
      expiresAt,
      createdAt,
      updatedAt: createdAt,
    });
  });
  return { conversationId, messageId };
}

async function insertRetentionEvent(
  database: TrevvDatabase,
  fixture: WorkerFixture,
  label: string,
  messageId: string,
  availableAt: Date,
) {
  const id = `event-retention-${label}-${sequence}`;
  await database.insert(outboxEvents).values({
    id,
    organizationId: fixture.organizationId,
    eventType: "message.retention_due",
    aggregateType: "message",
    aggregateId: messageId,
    requestId: `request-retention-${label}`,
    dedupKey: `dedup-retention-${label}-${sequence}`,
    payload: { messageId, expiresAt: availableAt.toISOString() },
    availableAt,
    createdAt: new Date("2026-08-29T09:00:00.000Z"),
  });
  return id;
}

describe("worker PostgreSQL repositories", () => {
  it("redacts due messages idempotently and acknowledges in the same transaction", async () => {
    const fixture = await seedWorkerFixture(connection.db, "retention-due");
    const foreign = await seedWorkerFixture(connection.db, "retention-foreign");
    const now = new Date("2026-08-29T10:00:00.000Z");
    const expiresAt = new Date("2026-08-29T09:30:00.000Z");
    const message = await insertRetentionMessage(
      connection.db,
      fixture,
      "due",
      expiresAt,
    );
    const foreignMessage = await insertRetentionMessage(
      connection.db,
      foreign,
      "foreign",
      expiresAt,
    );
    const eventId = await insertRetentionEvent(
      connection.db,
      fixture,
      "due",
      message.messageId,
      expiresAt,
    );
    await connection.db.insert(idempotencyRecords).values({
      id: `idempotency-retention-${sequence}`,
      organizationId: fixture.organizationId,
      userId: fixture.userId,
      method: "PATCH",
      route: `/api/v1/messages/${message.messageId}/response`,
      key: `retention-private-response-${sequence}`,
      requestFingerprint: `fingerprint-retention-${sequence}`,
      state: "completed",
      responseStatus: 200,
      responseBody: {
        message: {
          id: message.messageId,
          body: "Private message due",
        },
      },
      resultType: "message",
      resultId: message.messageId,
      expiresAt: new Date("2026-08-30T10:00:00.000Z"),
      createdAt: new Date("2026-08-29T09:15:00.000Z"),
      updatedAt: new Date("2026-08-29T09:15:00.000Z"),
    });
    await connection.db.insert(conversationMessageMetadataQuarantine).values({
      messageId: message.messageId,
      organizationId: fixture.organizationId,
      workspaceId: fixture.workspaceId,
      conversationId: message.conversationId,
      originalMetadata: { privateLegacyContext: "must expire" },
      originalOctetLength: 39,
      quarantineReason: "worker retention regression",
    });
    await connection.db.execute(sql`
      insert into legacy_collaboration_record_quarantine (
        id, organization_id, workspace_id, conversation_id,
        entity_type, entity_id, quarantine_reason, original_record
      ) values (
        ${`legacy-retention-${sequence}`}, ${fixture.organizationId},
        ${fixture.workspaceId}, ${message.conversationId}, 'message',
        ${message.messageId}, 'worker retention regression',
        ${JSON.stringify({ body: "legacy private body" })}::jsonb
      )
    `);
    const repositories = createWorkerRepositories(connection.db, {
      clock: () => now,
    });
    const [claim] = await repositories.outbox.lease({
      workerId: "worker-retention-due",
      now,
      leaseMs: 30_000,
      maxAttempts: 3,
      limit: 1,
      eventTypes: ["message.retention_due"],
    });
    expect(claim).toMatchObject({
      eventId,
      organizationId: fixture.organizationId,
      eventType: "message.retention_due",
    });
    await expect(
      repositories.outbox.process(claim!, async (transaction) => {
        await transaction.processInternalEvent(now);
        throw new Error("force retention rollback");
      }),
    ).rejects.toThrow("force retention rollback");
    const [rolledBackMessage] = await connection.db
      .select()
      .from(conversationMessages)
      .where(eq(conversationMessages.id, message.messageId));
    const [unacknowledged] = await connection.db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.id, eventId));
    expect(rolledBackMessage).toMatchObject({
      body: "Private message due",
      redactedAt: null,
      version: 1,
    });
    expect(unacknowledged?.processedAt).toBeNull();
    expect(
      await connection.db.$count(
        conversationMessageMetadataQuarantine,
        eq(conversationMessageMetadataQuarantine.messageId, message.messageId),
      ),
    ).toBe(1);
    const [rolledBackLegacyQuarantine] = await connection.db.execute<
      Array<{ count: number }>
    >(sql`
      select count(*)::int as count
        from legacy_collaboration_record_quarantine
       where organization_id = ${fixture.organizationId}
         and entity_type = 'message'
         and entity_id = ${message.messageId}
    `);
    expect(rolledBackLegacyQuarantine?.count).toBe(1);
    const maskedRepositories = createPostgresRepositories(
      connection.db,
    ).forOrganization(
      createOrganizationScope({
        organizationId: fixture.organizationId,
        userId: fixture.userId,
        requestId: "request-expired-message-read-mask",
      }),
    );
    await expect(
      maskedRepositories.collaboration.getMessage(message.messageId),
    ).resolves.toMatchObject({
      message: { body: "[Message expired]", metadata: {} },
    });

    await expect(
      repositories.outbox.process(claim!, (transaction) =>
        transaction.processInternalEvent(now),
      ),
    ).resolves.toEqual({
      status: "processed",
      value: { recomputed: false, effects: 1 },
    });
    const [redacted] = await connection.db
      .select()
      .from(conversationMessages)
      .where(eq(conversationMessages.id, message.messageId));
    const [acknowledged] = await connection.db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.id, eventId));
    expect(redacted).toMatchObject({
      body: "[Message expired]",
      metadata: {},
      redactedAt: now,
      version: 2,
    });
    expect(acknowledged?.processedAt).toEqual(now);
    expect(
      await connection.db.$count(
        idempotencyRecords,
        and(
          eq(idempotencyRecords.organizationId, fixture.organizationId),
          eq(idempotencyRecords.resultId, message.messageId),
        ),
      ),
    ).toBe(0);
    const [retainedLegacyQuarantine] = await connection.db.execute<
      Array<{ count: number }>
    >(sql`
      select count(*)::int as count
        from legacy_collaboration_record_quarantine
       where organization_id = ${fixture.organizationId}
         and entity_type = 'message'
         and entity_id = ${message.messageId}
    `);
    expect(retainedLegacyQuarantine?.count).toBe(0);
    expect(
      await connection.db.$count(
        conversationMessageMetadataQuarantine,
        eq(conversationMessageMetadataQuarantine.messageId, message.messageId),
      ),
    ).toBe(0);
    const scoped = createPostgresRepositories(connection.db).forOrganization(
      createOrganizationScope({
        organizationId: fixture.organizationId,
        userId: fixture.userId,
        requestId: "request-expired-message-mutation",
      }),
    );
    const mutationContext = {
      method: "PATCH",
      route: `/api/v1/messages/${message.messageId}`,
      now,
    };
    await expect(
      scoped.collaboration.setMessageResponse(
        message.conversationId,
        message.messageId,
        redacted!.version,
        "resolved",
        mutationContext,
      ),
    ).rejects.toMatchObject({ code: "constraint_conflict" });
    await expect(
      scoped.collaboration.addReaction(
        message.conversationId,
        message.messageId,
        redacted!.version,
        "👍",
        mutationContext,
      ),
    ).rejects.toMatchObject({ code: "constraint_conflict" });
    await expect(
      scoped.collaboration.sendMessage(
        message.conversationId,
        {
          clientMessageId: "reply-to-expired-message",
          parentMessageId: message.messageId,
          body: "This reply must be rejected",
        },
        {
          ...mutationContext,
          method: "POST",
          route: `/api/v1/conversations/${message.conversationId}/messages`,
        },
      ),
    ).rejects.toMatchObject({ code: "constraint_conflict" });

    const duplicateId = await insertRetentionEvent(
      connection.db,
      fixture,
      "duplicate",
      message.messageId,
      now,
    );
    const [duplicateClaim] = await repositories.outbox.lease({
      workerId: "worker-retention-duplicate",
      now,
      leaseMs: 30_000,
      maxAttempts: 3,
      limit: 1,
      eventTypes: ["message.retention_due"],
    });
    expect(duplicateClaim?.eventId).toBe(duplicateId);
    await expect(
      repositories.outbox.process(duplicateClaim!, (transaction) =>
        transaction.processInternalEvent(now),
      ),
    ).resolves.toEqual({
      status: "processed",
      value: { recomputed: false, effects: 0 },
    });
    const [stillRedacted] = await connection.db
      .select()
      .from(conversationMessages)
      .where(eq(conversationMessages.id, message.messageId));
    expect(stillRedacted?.version).toBe(2);

    const crossTenantEventId = await insertRetentionEvent(
      connection.db,
      fixture,
      "cross-tenant",
      foreignMessage.messageId,
      now,
    );
    const [crossTenantClaim] = await repositories.outbox.lease({
      workerId: "worker-retention-cross-tenant",
      now,
      leaseMs: 30_000,
      maxAttempts: 3,
      limit: 1,
      eventTypes: ["message.retention_due"],
    });
    expect(crossTenantClaim?.eventId).toBe(crossTenantEventId);
    await expect(
      repositories.outbox.process(crossTenantClaim!, (transaction) =>
        transaction.processInternalEvent(now),
      ),
    ).resolves.toEqual({
      status: "processed",
      value: { recomputed: false, effects: 0 },
    });
    const [foreignUnchanged] = await connection.db
      .select()
      .from(conversationMessages)
      .where(eq(conversationMessages.id, foreignMessage.messageId));
    expect(foreignUnchanged).toMatchObject({
      body: "Private message foreign",
      redactedAt: null,
      version: 1,
    });
  });

  it("retries an early retention event and redacts only when due", async () => {
    const fixture = await seedWorkerFixture(connection.db, "retention-early");
    const now = new Date("2026-08-29T10:00:00.000Z");
    const expiresAt = new Date("2026-08-29T10:10:00.000Z");
    let clockNow = now;
    const message = await insertRetentionMessage(
      connection.db,
      fixture,
      "early",
      expiresAt,
    );
    const eventId = await insertRetentionEvent(
      connection.db,
      fixture,
      "early",
      message.messageId,
      now,
    );
    const repositories = createWorkerRepositories(connection.db, {
      clock: () => clockNow,
    });
    const [claim] = await repositories.outbox.lease({
      workerId: "worker-retention-early",
      now,
      leaseMs: 30_000,
      maxAttempts: 3,
      limit: 1,
      eventTypes: ["message.retention_due"],
    });
    await expect(
      repositories.outbox.process(claim!, (transaction) =>
        transaction.processInternalEvent(now),
      ),
    ).rejects.toMatchObject({ code: "message_retention_not_due" });
    const [unchanged] = await connection.db
      .select()
      .from(conversationMessages)
      .where(eq(conversationMessages.id, message.messageId));
    expect(unchanged).toMatchObject({
      body: "Private message early",
      redactedAt: null,
      version: 1,
    });
    await expect(
      repositories.outbox.fail(claim!, {
        now: new Date("2026-08-29T10:00:01.000Z"),
        nextAvailableAt: expiresAt,
        errorCode: "message_retention_not_due",
        maxAttempts: 3,
      }),
    ).resolves.toBe("retry_scheduled");
    clockNow = expiresAt;
    const [retry] = await repositories.outbox.lease({
      workerId: "worker-retention-retry",
      now: expiresAt,
      leaseMs: 30_000,
      maxAttempts: 3,
      limit: 1,
      eventTypes: ["message.retention_due"],
    });
    expect(retry).toMatchObject({ eventId, attempt: 2 });
    await expect(
      repositories.outbox.process(retry!, (transaction) =>
        transaction.processInternalEvent(expiresAt),
      ),
    ).resolves.toEqual({
      status: "processed",
      value: { recomputed: false, effects: 1 },
    });
    const [redacted] = await connection.db
      .select()
      .from(conversationMessages)
      .where(eq(conversationMessages.id, message.messageId));
    expect(redacted).toMatchObject({
      body: "[Message expired]",
      metadata: {},
      redactedAt: expiresAt,
      version: 2,
    });
  });

  it("acknowledges reviewed audit-only events without a catch-all", async () => {
    const fixture = await seedWorkerFixture(connection.db, "audit-only");
    const eventId = await insertOutboxEvent(
      connection.db,
      fixture,
      "audit-only",
      "board.updated",
    );
    const now = new Date("2026-08-29T10:00:00.000Z");
    const repositories = createWorkerRepositories(connection.db, {
      clock: () => now,
    });
    const [claim] = await repositories.outbox.lease({
      workerId: "worker-audit-only",
      now,
      leaseMs: 30_000,
      maxAttempts: 3,
      limit: 1,
      eventTypes: ["board.updated"],
    });
    expect(claim?.eventId).toBe(eventId);
    await expect(
      repositories.outbox.process(claim!, (transaction) =>
        transaction.processInternalEvent(now),
      ),
    ).resolves.toEqual({
      status: "processed",
      value: { recomputed: false },
    });
  });

  it("leaves unknown outbox events pending for a future owning handler", async () => {
    const fixture = await seedWorkerFixture(connection.db, "unsupported");
    const eventId = await insertOutboxEvent(
      connection.db,
      fixture,
      "unsupported",
      "provider.delivery_requested",
    );
    const repositories = createWorkerRepositories(connection.db);
    await expect(
      repositories.outbox.lease({
        workerId: "worker-attention-only",
        now: new Date("2026-08-29T10:00:00.000Z"),
        leaseMs: 30_000,
        maxAttempts: 3,
        limit: 10,
      }),
    ).resolves.toEqual([]);
    const [pending] = await connection.db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.id, eventId));
    expect(pending).toMatchObject({
      attempts: 0,
      processedAt: null,
      lockedBy: null,
      leaseToken: null,
    });
  });

  it("recovers expired leases and persists retry/dead-letter attempts", async () => {
    const fixture = await seedWorkerFixture(connection.db, "lease");
    const eventId = await insertOutboxEvent(connection.db, fixture, "lease");
    const repositories = createWorkerRepositories(connection.db);
    const firstNow = new Date("2026-08-29T10:00:00.000Z");
    const [first] = await repositories.outbox.lease({
      workerId: "worker-first",
      now: firstNow,
      leaseMs: 30_000,
      maxAttempts: 3,
      limit: 1,
    });
    expect(first).toMatchObject({ eventId, attempt: 1 });
    await expect(
      repositories.outbox.lease({
        workerId: "worker-second",
        now: new Date("2026-08-29T10:00:29.000Z"),
        leaseMs: 30_000,
        maxAttempts: 3,
        limit: 1,
      }),
    ).resolves.toEqual([]);
    const secondNow = new Date("2026-08-29T10:00:31.000Z");
    const [recovered] = await repositories.outbox.lease({
      workerId: "worker-second",
      now: secondNow,
      leaseMs: 30_000,
      maxAttempts: 3,
      limit: 1,
    });
    expect(recovered).toMatchObject({ eventId, attempt: 2 });
    expect(
      await repositories.outbox.fail(recovered!, {
        now: secondNow,
        nextAvailableAt: new Date("2026-08-29T10:02:31.000Z"),
        errorCode: "transient_failure",
        maxAttempts: 3,
      }),
    ).toBe("retry_scheduled");
    await expect(
      repositories.outbox.lease({
        workerId: "worker-third",
        now: new Date("2026-08-29T10:02:30.000Z"),
        leaseMs: 30_000,
        maxAttempts: 3,
        limit: 1,
      }),
    ).resolves.toEqual([]);
    const thirdNow = new Date("2026-08-29T10:02:31.000Z");
    const [third] = await repositories.outbox.lease({
      workerId: "worker-third",
      now: thirdNow,
      leaseMs: 30_000,
      maxAttempts: 3,
      limit: 1,
    });
    expect(third).toMatchObject({ eventId, attempt: 3 });
    expect(
      await repositories.outbox.fail(third!, {
        now: thirdNow,
        nextAvailableAt: new Date("2026-08-29T10:10:00.000Z"),
        errorCode: "permanent_failure",
        maxAttempts: 3,
      }),
    ).toBe("dead_lettered");
    const attempts = await connection.db
      .select()
      .from(outboxAttempts)
      .where(eq(outboxAttempts.eventId, eventId))
      .orderBy(outboxAttempts.attempt);
    expect(
      attempts.map(({ status, errorCode }) => [status, errorCode]),
    ).toEqual([
      ["failed", "lease_expired"],
      ["failed", "transient_failure"],
      ["dead_lettered", "permanent_failure"],
    ]);
  });

  it("dead-letters repeated crash/restart leases at the configured attempt cap", async () => {
    const fixture = await seedWorkerFixture(connection.db, "crash-cap");
    const eventId = await insertOutboxEvent(
      connection.db,
      fixture,
      "crash-cap",
    );
    const repositories = createWorkerRepositories(connection.db);
    const firstStartedAt = new Date("2026-08-29T10:00:00.000Z");
    const [first] = await repositories.outbox.lease({
      workerId: "worker-crash-first",
      now: firstStartedAt,
      leaseMs: 30_000,
      maxAttempts: 2,
      limit: 1,
    });
    expect(first).toMatchObject({ eventId, attempt: 1 });

    const secondStartedAt = new Date("2026-08-29T10:00:31.000Z");
    const [second] = await repositories.outbox.lease({
      workerId: "worker-crash-second",
      now: secondStartedAt,
      leaseMs: 30_000,
      maxAttempts: 2,
      limit: 1,
    });
    expect(second).toMatchObject({ eventId, attempt: 2 });

    const terminalAt = new Date("2026-08-29T10:01:02.000Z");
    await expect(
      repositories.outbox.lease({
        workerId: "worker-crash-third",
        now: terminalAt,
        leaseMs: 30_000,
        maxAttempts: 2,
        limit: 1,
      }),
    ).resolves.toEqual([]);
    await expect(
      repositories.outbox.lease({
        workerId: "worker-after-dead-letter",
        now: new Date("2026-08-29T10:02:00.000Z"),
        leaseMs: 30_000,
        maxAttempts: 2,
        limit: 1,
      }),
    ).resolves.toEqual([]);

    const [terminal] = await connection.db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.id, eventId));
    expect(terminal).toMatchObject({
      attempts: 2,
      processedAt: null,
      deadLetteredAt: terminalAt,
      lastErrorCode: "lease_expired",
      lastErrorAt: terminalAt,
      lockedAt: null,
      lockedBy: null,
      leaseToken: null,
      leaseExpiresAt: null,
    });
    const attempts = await connection.db
      .select()
      .from(outboxAttempts)
      .where(eq(outboxAttempts.eventId, eventId))
      .orderBy(outboxAttempts.attempt);
    expect(
      attempts.map(({ attempt, status, errorCode, finishedAt }) => ({
        attempt,
        status,
        errorCode,
        finishedAt,
      })),
    ).toEqual([
      {
        attempt: 1,
        status: "failed",
        errorCode: "lease_expired",
        finishedAt: secondStartedAt,
      },
      {
        attempt: 2,
        status: "dead_lettered",
        errorCode: "lease_expired",
        finishedAt: terminalAt,
      },
    ]);
  });

  it("uses skip-locked leasing so concurrent workers claim an event once", async () => {
    const fixture = await seedWorkerFixture(connection.db, "concurrency");
    const eventId = await insertOutboxEvent(
      connection.db,
      fixture,
      "concurrency",
    );
    const firstConnection = createDatabase(temporary.url);
    const secondConnection = createDatabase(temporary.url);
    try {
      const now = new Date("2026-08-29T10:00:00.000Z");
      const firstRepositories = createWorkerRepositories(firstConnection.db, {
        clock: () => now,
      });
      const secondRepositories = createWorkerRepositories(secondConnection.db, {
        clock: () => now,
      });
      const results = await Promise.all([
        firstRepositories.outbox.lease({
          workerId: "worker-concurrent-a",
          now,
          leaseMs: 30_000,
          maxAttempts: 3,
          limit: 1,
        }),
        secondRepositories.outbox.lease({
          workerId: "worker-concurrent-b",
          now,
          leaseMs: 30_000,
          maxAttempts: 3,
          limit: 1,
        }),
      ]);
      const claims = results
        .flat()
        .filter((claim) => claim.eventId === eventId);
      expect(claims).toHaveLength(1);
      const claim = claims[0]!;
      const winner =
        claim.workerId === "worker-concurrent-a"
          ? firstRepositories
          : secondRepositories;
      await expect(
        winner.outbox.process(claim, (transaction) =>
          transaction.processInternalEvent(now),
        ),
      ).resolves.toMatchObject({ status: "processed" });
    } finally {
      await firstConnection.close();
      await secondConnection.close();
    }
  });

  it("advances a durable least-recently-computed cursor across bounded sweeps", async () => {
    await connection.db
      .update(organizations)
      .set({ attentionComputedAt: new Date("2026-08-29T09:00:00.000Z") });
    const fixtures = await Promise.all([
      seedWorkerFixture(connection.db, "fair-sweep-a"),
      seedWorkerFixture(connection.db, "fair-sweep-b"),
      seedWorkerFixture(connection.db, "fair-sweep-c"),
    ]);
    const repositories = createWorkerRepositories(connection.db);
    const now = new Date("2026-08-29T10:00:00.000Z");
    const processed: string[] = [];
    for (let index = 0; index < fixtures.length; index += 1) {
      const [result] = await repositories.attention.recomputeAll(now, 1);
      if (result) processed.push(result.organizationId);
    }
    expect(processed.sort()).toEqual(
      fixtures.map(({ organizationId }) => organizationId).sort(),
    );
    const cursorRows = await connection.db
      .select({
        id: organizations.id,
        attentionComputedAt: organizations.attentionComputedAt,
      })
      .from(organizations)
      .where(
        inArray(
          organizations.id,
          fixtures.map(({ organizationId }) => organizationId),
        ),
      );
    expect(
      cursorRows.every(
        ({ attentionComputedAt }) =>
          attentionComputedAt?.toISOString() === now.toISOString(),
      ),
    ).toBe(true);
  });

  it("rolls back recomputation when an event handler fails before acknowledgement", async () => {
    const fixture = await seedWorkerFixture(connection.db, "rollback");
    await connection.db.insert(workItems).values({
      id: `item-${fixture.organizationId}`,
      organizationId: fixture.organizationId,
      workspaceId: fixture.workspaceId,
      boardId: fixture.boardId,
      title: "Blocked atomically",
      itemType: "task",
      status: "blocked",
      priority: "normal",
      creatorId: fixture.userId,
      createdAt: new Date("2026-08-29T09:00:00.000Z"),
      updatedAt: new Date("2026-08-29T09:00:00.000Z"),
    });
    const eventId = await insertOutboxEvent(
      connection.db,
      fixture,
      "rollback",
      "item.updated",
    );
    const now = new Date("2026-08-29T10:00:00.000Z");
    const repositories = createWorkerRepositories(connection.db, {
      clock: () => now,
    });
    const [claim] = await repositories.outbox.lease({
      workerId: "worker-rollback",
      now,
      leaseMs: 30_000,
      maxAttempts: 1,
      limit: 1,
    });
    await expect(
      repositories.outbox.process(claim!, async (transaction) => {
        await transaction.processInternalEvent(now);
        throw new Error("force rollback");
      }),
    ).rejects.toThrow("force rollback");
    expect(
      await connection.db
        .select()
        .from(attentionSignals)
        .where(eq(attentionSignals.organizationId, fixture.organizationId)),
    ).toHaveLength(0);
    const [event] = await connection.db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.id, eventId));
    expect(event?.processedAt).toBeNull();
    await repositories.outbox.fail(claim!, {
      now,
      nextAvailableAt: now,
      errorCode: "forced_rollback",
      maxAttempts: 1,
    });
  });

  it("rolls back a slow handler and refuses acknowledgement after lease expiry", async () => {
    const fixture = await seedWorkerFixture(connection.db, "expired-ack");
    await connection.db.insert(workItems).values({
      id: `item-${fixture.organizationId}`,
      organizationId: fixture.organizationId,
      workspaceId: fixture.workspaceId,
      boardId: fixture.boardId,
      title: "Slow blocked work",
      itemType: "task",
      status: "blocked",
      priority: "normal",
      creatorId: fixture.userId,
      createdAt: new Date("2026-08-29T09:00:00.000Z"),
      updatedAt: new Date("2026-08-29T09:00:00.000Z"),
    });
    const eventId = await insertOutboxEvent(
      connection.db,
      fixture,
      "expired-ack",
      "item.updated",
    );
    const leaseStartedAt = new Date("2026-08-29T10:00:00.000Z");
    const clockValues = [
      new Date("2026-08-29T10:00:01.000Z"),
      new Date("2026-08-29T10:00:31.000Z"),
    ];
    const repositories = createWorkerRepositories(connection.db, {
      clock: () => clockValues.shift() ?? new Date("2026-08-29T10:00:31.000Z"),
    });
    const [claim] = await repositories.outbox.lease({
      workerId: "worker-slow",
      now: leaseStartedAt,
      leaseMs: 30_000,
      maxAttempts: 2,
      limit: 1,
    });
    await expect(
      repositories.outbox.process(claim!, (transaction) =>
        transaction.processInternalEvent(leaseStartedAt),
      ),
    ).resolves.toEqual({ status: "lease_lost" });
    expect(
      await connection.db
        .select()
        .from(attentionSignals)
        .where(eq(attentionSignals.organizationId, fixture.organizationId)),
    ).toHaveLength(0);
    const [unacknowledged] = await connection.db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.id, eventId));
    expect(unacknowledged?.processedAt).toBeNull();
    const [recovered] = await repositories.outbox.lease({
      workerId: "worker-recovery",
      now: new Date("2026-08-29T10:00:31.000Z"),
      leaseMs: 30_000,
      maxAttempts: 2,
      limit: 1,
    });
    expect(recovered).toMatchObject({ eventId, attempt: 2 });
    await repositories.outbox.fail(recovered!, {
      now: new Date("2026-08-29T10:00:31.000Z"),
      nextAvailableAt: new Date("2026-08-29T10:00:31.000Z"),
      errorCode: "lease_expired",
      maxAttempts: 2,
    });
  });

  it("rejects an expired worker failure so recovery owns the disposition", async () => {
    const fixture = await seedWorkerFixture(connection.db, "expired-fail");
    const eventId = await insertOutboxEvent(
      connection.db,
      fixture,
      "expired-fail",
    );
    const repositories = createWorkerRepositories(connection.db);
    const leasedAt = new Date("2026-08-29T10:00:00.000Z");
    const [expired] = await repositories.outbox.lease({
      workerId: "worker-expired-fail",
      now: leasedAt,
      leaseMs: 30_000,
      maxAttempts: 2,
      limit: 1,
    });

    await expect(
      repositories.outbox.fail(expired!, {
        now: new Date("2026-08-29T10:00:30.000Z"),
        nextAvailableAt: new Date("2026-08-29T10:01:30.000Z"),
        errorCode: "late_failure",
        maxAttempts: 3,
      }),
    ).resolves.toBe("lease_lost");

    const [recovered] = await repositories.outbox.lease({
      workerId: "worker-expired-fail-recovery",
      now: new Date("2026-08-29T10:00:30.000Z"),
      leaseMs: 30_000,
      maxAttempts: 2,
      limit: 1,
    });
    expect(recovered).toMatchObject({ eventId, attempt: 2 });
    await expect(
      repositories.outbox.fail(recovered!, {
        now: new Date("2026-08-29T10:00:31.000Z"),
        nextAvailableAt: new Date("2026-08-29T10:01:31.000Z"),
        errorCode: "recovery_failure",
        maxAttempts: 2,
      }),
    ).resolves.toBe("dead_lettered");
  });

  it("derives deterministic tenant-scoped Attention with timezone evidence", async () => {
    const now = new Date("2026-08-29T22:30:00.000Z");
    const fixture = await seedWorkerFixture(connection.db, "attention", {
      timezone: "Europe/Berlin",
      createdAt: new Date("2026-08-20T10:00:00.000Z"),
    });
    const foreign = await seedWorkerFixture(
      connection.db,
      "attention-foreign",
      {
        timezone: "America/New_York",
        createdAt: now,
      },
    );
    const items = [
      {
        id: `blocked-${fixture.organizationId}`,
        title: "Blocked work",
        itemType: "task" as const,
        status: "blocked" as const,
        priority: "normal" as const,
        typeData: {},
      },
      {
        id: `overdue-${fixture.organizationId}`,
        title: "Overdue work",
        itemType: "task" as const,
        status: "working" as const,
        priority: "normal" as const,
        dueDate: "2026-08-29",
        typeData: {},
      },
      {
        id: `unassigned-${fixture.organizationId}`,
        title: "Urgent without owner",
        itemType: "task" as const,
        status: "working" as const,
        priority: "urgent" as const,
        typeData: {},
      },
      {
        id: `decision-${fixture.organizationId}`,
        title: "Founder decision",
        itemType: "decision" as const,
        status: "working" as const,
        priority: "high" as const,
        typeData: { decisionState: "needed" },
      },
      {
        id: `approval-${fixture.organizationId}`,
        title: "Budget approval",
        itemType: "approval" as const,
        status: "review" as const,
        priority: "high" as const,
        typeData: { approvalState: "pending" },
      },
      {
        id: `waiting-${fixture.organizationId}`,
        title: "Partner response",
        itemType: "task" as const,
        status: "working" as const,
        priority: "normal" as const,
        typeData: {},
      },
    ];
    await connection.db.insert(workItems).values(
      items.map((item) => ({
        ...item,
        organizationId: fixture.organizationId,
        workspaceId: fixture.workspaceId,
        boardId: fixture.boardId,
        creatorId: fixture.userId,
        createdAt: new Date("2026-08-22T10:00:00.000Z"),
        updatedAt: new Date("2026-08-29T21:00:00.000Z"),
      })),
    );
    await connection.db.insert(itemAssignees).values(
      items
        .filter(({ id }) => !id.startsWith("unassigned-"))
        .map(({ id }) => ({
          organizationId: fixture.organizationId,
          itemId: id,
          userId: fixture.userId,
          assignedAt: new Date("2026-08-22T10:00:00.000Z"),
        })),
    );
    await connection.db.insert(waitingStates).values({
      id: `waiting-state-${fixture.organizationId}`,
      organizationId: fixture.organizationId,
      portfolioId: fixture.portfolioId,
      workspaceId: fixture.workspaceId,
      entityType: "work_item",
      entityId: `waiting-${fixture.organizationId}`,
      waitingType: "external_response",
      waitingSince: new Date("2026-08-25T10:00:00.000Z"),
      followUpOwnerId: fixture.userId,
      nextFollowUp: "2026-08-30",
      createdAt: new Date("2026-08-25T10:00:00.000Z"),
      updatedAt: new Date("2026-08-29T20:00:00.000Z"),
    });
    await connection.db.insert(workspaceUpdates).values({
      id: `workspace-update-${fixture.organizationId}`,
      organizationId: fixture.organizationId,
      workspaceId: fixture.workspaceId,
      authorId: fixture.userId,
      wins: "Earlier progress",
      currentPriority: "Ship",
      blocker: "",
      nextMilestone: "Launch",
      helpNeeded: "",
      publishedAt: new Date("2026-08-22T10:00:00.000Z"),
      createdAt: new Date("2026-08-22T10:00:00.000Z"),
      updatedAt: new Date("2026-08-22T10:00:00.000Z"),
    });
    await connection.db.insert(workItems).values({
      id: `foreign-blocked-${foreign.organizationId}`,
      organizationId: foreign.organizationId,
      workspaceId: foreign.workspaceId,
      boardId: foreign.boardId,
      title: "Foreign blocked work",
      itemType: "task",
      status: "blocked",
      priority: "urgent",
      creatorId: foreign.userId,
      createdAt: now,
      updatedAt: now,
    });

    const repositories = createWorkerRepositories(connection.db);
    const first = await repositories.attention.recomputeOrganization(
      fixture.organizationId,
      now,
    );
    expect(first).toMatchObject({
      organizationId: fixture.organizationId,
      created: 7,
      resolved: 0,
      notifications: 7,
    });
    const signals = await connection.db
      .select()
      .from(attentionSignals)
      .where(eq(attentionSignals.organizationId, fixture.organizationId));
    expect(signals.map(({ reasonCode }) => reasonCode).sort()).toEqual([
      "approval.pending",
      "decision.pending",
      "waiting.follow_up_due",
      "work_item.blocked",
      "work_item.overdue",
      "work_item.unassigned_priority",
      "workspace.update_stale",
    ]);
    expect(
      signals.find(({ reasonCode }) => reasonCode === "work_item.overdue")
        ?.evidence,
    ).toMatchObject({ organizationDate: "2026-08-30" });
    expect(
      signals.every(({ sourceFingerprint }) => Boolean(sourceFingerprint)),
    ).toBe(true);
    const stable = signals.map(({ id, sourceFingerprint }) => ({
      id,
      sourceFingerprint,
    }));
    const second = await repositories.attention.recomputeOrganization(
      fixture.organizationId,
      now,
    );
    expect(second).toMatchObject({
      created: 0,
      refreshed: 7,
      resolved: 0,
      notifications: 0,
    });
    expect(
      (
        await connection.db
          .select({
            id: attentionSignals.id,
            sourceFingerprint: attentionSignals.sourceFingerprint,
          })
          .from(attentionSignals)
          .where(eq(attentionSignals.organizationId, fixture.organizationId))
      ).map(({ id, sourceFingerprint }) => ({ id, sourceFingerprint })),
    ).toEqual(stable);
    const nextDay = await repositories.attention.recomputeOrganization(
      fixture.organizationId,
      new Date("2026-08-30T22:30:00.000Z"),
    );
    expect(nextDay).toMatchObject({
      created: 0,
      refreshed: 7,
      resolved: 0,
      notifications: 0,
    });
    const [waitingSignal] = await connection.db
      .select()
      .from(attentionSignals)
      .where(
        and(
          eq(attentionSignals.organizationId, fixture.organizationId),
          eq(attentionSignals.reasonCode, "waiting.follow_up_due"),
        ),
      );
    expect(waitingSignal).toMatchObject({
      severity: "high",
      evidence: { organizationDate: "2026-08-31" },
    });
    expect(
      await connection.db
        .select()
        .from(attentionSignals)
        .where(eq(attentionSignals.organizationId, foreign.organizationId)),
    ).toHaveLength(0);
    expect(
      await connection.db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.organizationId, fixture.organizationId),
            eq(notifications.userId, fixture.userId),
          ),
        ),
    ).toHaveLength(7);
  });

  it("reports content-free queue age and failure telemetry by ownership", async () => {
    const fixture = await seedWorkerFixture(connection.db, "telemetry");
    const repositories = createWorkerRepositories(connection.db);
    const now = new Date("2026-08-29T10:05:00.000Z");
    const ownedEventTypes = ["item.updated", "message.sent"];
    const activeEventTypes = ["item.updated"];
    const before = await repositories.outbox.telemetry({
      now,
      ownedEventTypes,
      activeEventTypes,
    });
    const readyId = await insertOutboxEvent(
      connection.db,
      fixture,
      "telemetry-ready",
      "item.updated",
    );
    const delayedId = await insertOutboxEvent(
      connection.db,
      fixture,
      "telemetry-delayed",
      "item.updated",
    );
    const deadId = await insertOutboxEvent(
      connection.db,
      fixture,
      "telemetry-dead",
      "item.updated",
    );
    await insertOutboxEvent(
      connection.db,
      fixture,
      "telemetry-paused",
      "message.sent",
    );
    await insertOutboxEvent(
      connection.db,
      fixture,
      "telemetry-unsupported",
      "provider.unowned",
    );
    await connection.db
      .update(outboxEvents)
      .set({ availableAt: new Date("2026-08-29T10:10:00.000Z") })
      .where(eq(outboxEvents.id, delayedId));
    await connection.db
      .update(outboxEvents)
      .set({ deadLetteredAt: now })
      .where(eq(outboxEvents.id, deadId));
    await connection.db.insert(outboxAttempts).values({
      id: `attempt-${deadId}`,
      organizationId: fixture.organizationId,
      eventId: deadId,
      attempt: 1,
      workerId: "worker-telemetry",
      leaseToken: `lease-${deadId}`,
      status: "failed",
      errorCode: "telemetry_fixture_failure",
      startedAt: new Date("2026-08-29T10:04:00.000Z"),
      finishedAt: now,
    });

    const after = await repositories.outbox.telemetry({
      now,
      ownedEventTypes,
      activeEventTypes,
    });
    expect(after).toMatchObject({
      observedAt: now,
      ready: before.ready + 1,
      delayed: before.delayed + 1,
      deadLettered: before.deadLettered + 1,
      paused: before.paused + 1,
      unsupported: before.unsupported + 1,
      attempts: { failed: before.attempts.failed + 1 },
    });
    expect(after.oldestReadyAgeMs).toBeGreaterThanOrEqual(300_000);
    expect(after.oldestUnsupportedAgeMs).toBeGreaterThanOrEqual(300_000);
    expect(JSON.stringify(after)).not.toContain(fixture.organizationId);
    expect(JSON.stringify(after)).not.toContain(readyId);
  });
});

describe("Phase 3 populated migration upgrade", () => {
  it("backfills legacy Attention provenance and preserves existing rows", async () => {
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
        "0007_normalized_app_user_email.sql",
      ]);
      const legacy = postgres(upgrade.url, { max: 1, prepare: false });
      try {
        await legacy.unsafe(`
          insert into organizations (id, name, slug)
          values ('org-worker-upgrade', 'Worker Upgrade', 'worker-upgrade');
          insert into app_users (id, email, name)
          values ('user-worker-upgrade', 'worker-upgrade@example.test', 'Upgrade Owner');
          insert into memberships (organization_id, user_id, role)
          values ('org-worker-upgrade', 'user-worker-upgrade', 'owner');
          insert into portfolios (id, organization_id, name, slug, is_default)
          values ('portfolio-worker-upgrade', 'org-worker-upgrade', 'Main', 'main', true);
          insert into workspaces (
            id, organization_id, portfolio_id, name, slug, type,
            accent_color, icon, lifecycle_stage, health, lead_user_id
          ) values (
            'workspace-worker-upgrade', 'org-worker-upgrade',
            'portfolio-worker-upgrade', 'Workspace', 'workspace', 'business',
            '#334455', 'W', 'build', 'on_track', 'user-worker-upgrade'
          );
          insert into attention_signals (
            id, organization_id, portfolio_id, workspace_id, entity_type,
            entity_id, signal_type, severity, impact, urgency, reason
          ) values (
            'attention-worker-upgrade', 'org-worker-upgrade',
            'portfolio-worker-upgrade', 'workspace-worker-upgrade',
            'workspace', 'workspace-worker-upgrade', 'legacy_signal',
            'medium', 3, 3, 'Legacy signal'
          );
          insert into notifications (
            id, organization_id, user_id, category, title, body
          ) values (
            'notification-worker-upgrade', 'org-worker-upgrade',
            'user-worker-upgrade', 'attention', 'Legacy', 'Preserved'
          );
          insert into idempotency_records (
            id, organization_id, user_id, method, route, idempotency_key,
            request_fingerprint, state, response_status, response_body,
            result_type, result_id, expires_at
          ) values (
            'idempotency-worker-upgrade', 'org-worker-upgrade',
            'user-worker-upgrade', 'PATCH', '/attention/legacy',
            'legacy-attention-action', 'legacy-fingerprint', 'completed', 200,
            '{"id":"attention-worker-upgrade","createdAt":"2026-08-20T10:00:00.000Z","updatedAt":"2026-08-20T10:00:00.000Z"}'::jsonb,
            'resource', 'attention-worker-upgrade', now() + interval '1 day'
          );
        `);
      } finally {
        await legacy.end();
      }
      await applyMigrationFiles(upgrade.url, ["0008_lumpy_sasquatch.sql"]);
      const upgraded = postgres(upgrade.url, { max: 1, prepare: false });
      try {
        const [signal] = await upgraded<
          Array<{
            reason_code: string;
            source_fingerprint: string;
            source_occurred_at: Date;
            computed_at: Date;
          }>
        >`select reason_code, source_fingerprint, source_occurred_at, computed_at
          from attention_signals where id = 'attention-worker-upgrade'`;
        expect(signal).toMatchObject({
          reason_code: "legacy.imported.attention-worker-upgrade",
          source_fingerprint: "legacy:attention-worker-upgrade",
        });
        expect(signal?.source_occurred_at).toBeInstanceOf(Date);
        expect(signal?.computed_at).toBeInstanceOf(Date);
        const [idempotency] = await upgraded<
          Array<{ response_body: Record<string, unknown> }>
        >`select response_body from idempotency_records
          where id = 'idempotency-worker-upgrade'`;
        expect(idempotency?.response_body).toMatchObject({
          reasonCode: "legacy.imported.attention-worker-upgrade",
          evidence: {},
          sourceFingerprint: "legacy:attention-worker-upgrade",
        });
        const [tables] = await upgraded<
          Array<{ attempts: string; history: string }>
        >`select
          to_regclass('public.outbox_attempts')::text as attempts,
          to_regclass('public.work_item_events')::text as history`;
        expect(tables).toEqual({
          attempts: "outbox_attempts",
          history: "work_item_events",
        });
        await expect(
          upgraded.unsafe(
            `update attention_signals set reason_code = null where id = 'attention-worker-upgrade'`,
          ),
        ).rejects.toBeTruthy();
      } finally {
        await upgraded.end();
      }
    } finally {
      await upgrade.drop();
    }
  }, 120_000);
});
