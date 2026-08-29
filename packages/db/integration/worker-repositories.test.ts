import { and, eq, inArray } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDatabase,
  createWorkerRepositories,
  type TrevvDatabase,
} from "../src/index.js";
import {
  attentionSignals,
  boards,
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

describe("worker PostgreSQL repositories", () => {
  it("leaves unsupported outbox events pending for their owning handler", async () => {
    const fixture = await seedWorkerFixture(connection.db, "unsupported");
    const eventId = await insertOutboxEvent(
      connection.db,
      fixture,
      "unsupported",
      "organization.updated",
    );
    const repositories = createWorkerRepositories(connection.db);
    await expect(
      repositories.outbox.lease({
        workerId: "worker-attention-only",
        now: new Date("2026-08-29T10:00:00.000Z"),
        leaseMs: 30_000,
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
      limit: 1,
    });
    expect(first).toMatchObject({ eventId, attempt: 1 });
    await expect(
      repositories.outbox.lease({
        workerId: "worker-second",
        now: new Date("2026-08-29T10:00:29.000Z"),
        leaseMs: 30_000,
        limit: 1,
      }),
    ).resolves.toEqual([]);
    const secondNow = new Date("2026-08-29T10:00:31.000Z");
    const [recovered] = await repositories.outbox.lease({
      workerId: "worker-second",
      now: secondNow,
      leaseMs: 30_000,
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
        limit: 1,
      }),
    ).resolves.toEqual([]);
    const thirdNow = new Date("2026-08-29T10:02:31.000Z");
    const [third] = await repositories.outbox.lease({
      workerId: "worker-third",
      now: thirdNow,
      leaseMs: 30_000,
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
          limit: 1,
        }),
        secondRepositories.outbox.lease({
          workerId: "worker-concurrent-b",
          now,
          leaseMs: 30_000,
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
