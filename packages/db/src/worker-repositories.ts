import { createHash } from "node:crypto";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lte,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import type { TrevvDatabase } from "./repositories.js";
import {
  attentionSignals,
  conversationMessageMetadataQuarantine,
  conversationMessages,
  idempotencyRecords,
  itemAssignees,
  memberships,
  notifications,
  organizations,
  outboxAttempts,
  outboxEvents,
  portfolios,
  waitingStates,
  workItems,
  workspaceUpdates,
  workspaces,
} from "./schema.js";

export interface WorkerLease {
  eventId: string;
  organizationId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
  attempt: number;
  workerId: string;
  leaseToken: string;
  leaseExpiresAt: Date;
  createdAt: Date;
}

export interface AttentionRecomputeResult {
  organizationId: string;
  created: number;
  refreshed: number;
  resolved: number;
  notifications: number;
}

export interface InternalEventResult {
  recomputed: boolean;
  attention?: AttentionRecomputeResult;
  effects?: number;
}

export interface WorkerQueueTelemetry {
  observedAt: Date;
  ready: number;
  delayed: number;
  leased: number;
  deadLettered: number;
  paused: number;
  unsupported: number;
  oldestReadyAgeMs: number | null;
  oldestUnsupportedAgeMs: number | null;
  attempts: {
    leased: number;
    succeeded: number;
    failed: number;
    deadLettered: number;
  };
}

export interface WorkerRepositories {
  outbox: {
    lease: (input: {
      workerId: string;
      now: Date;
      leaseMs: number;
      maxAttempts: number;
      limit: number;
      eventTypes?: readonly string[];
    }) => Promise<WorkerLease[]>;
    process: <T>(
      lease: WorkerLease,
      handler: (repositories: WorkerTransactionRepositories) => Promise<T>,
    ) => Promise<{ status: "processed"; value: T } | { status: "lease_lost" }>;
    fail: (
      lease: WorkerLease,
      input: {
        now: Date;
        nextAvailableAt: Date;
        errorCode: string;
        maxAttempts: number;
      },
    ) => Promise<"retry_scheduled" | "dead_lettered" | "lease_lost">;
    telemetry: (input: {
      now: Date;
      ownedEventTypes: readonly string[];
      activeEventTypes: readonly string[];
    }) => Promise<WorkerQueueTelemetry>;
  };
  attention: {
    recomputeOrganization: (
      organizationId: string,
      now: Date,
    ) => Promise<AttentionRecomputeResult>;
    recomputeAll: (
      now: Date,
      limit: number,
    ) => Promise<AttentionRecomputeResult[]>;
  };
}

export interface WorkerTransactionRepositories {
  event: WorkerLease;
  processInternalEvent: (now: Date) => Promise<InternalEventResult>;
  attention: {
    recomputeOrganization: (
      organizationId: string,
      now: Date,
    ) => Promise<AttentionRecomputeResult>;
  };
}

export interface WorkerRepositoryOptions {
  clock?: () => Date;
}

export type WorkerEventHandlerName = "attention" | "audit" | "collaboration";

export interface WorkerEventCatalogEntry {
  handler: WorkerEventHandlerName;
  effect:
    | "acknowledge_audit_only"
    | "apply_collaboration_effect"
    | "recompute_attention";
  reason: string;
}

/**
 * Exhaustive catalog of every event currently written to outbox_events.
 *
 * Adding an event producer requires a reviewed entry here. Events whose only
 * durable effect is the audit/outbox record are acknowledged by the explicit
 * audit handler; they are not swallowed by a catch-all. Unknown event types
 * remain pending and become a readiness failure once their grace period ends.
 */
export const workerEventCatalog = {
  "organization.onboarded": {
    handler: "attention",
    effect: "recompute_attention",
    reason: "Initialize deterministic signals for the provisioned tenant.",
  },
  "organization.updated": {
    handler: "attention",
    effect: "recompute_attention",
    reason: "Timezone changes can change due and stale-signal calculations.",
  },
  "application_user.updated": {
    handler: "audit",
    effect: "acknowledge_audit_only",
    reason: "Profile changes have no Phase 4 asynchronous projection.",
  },
  "membership.created": {
    handler: "attention",
    effect: "recompute_attention",
    reason: "Active membership controls eligible signal recipients.",
  },
  "membership.updated": {
    handler: "attention",
    effect: "recompute_attention",
    reason: "Role changes can alter eligible signal recipients.",
  },
  "membership.revoked": {
    handler: "attention",
    effect: "recompute_attention",
    reason: "Revoked members must stop receiving computed notifications.",
  },
  "membership.restored": {
    handler: "attention",
    effect: "recompute_attention",
    reason: "Restored members may become eligible signal recipients again.",
  },
  "invitation.created": {
    handler: "audit",
    effect: "acknowledge_audit_only",
    reason: "Invitation mail is delivered and reconciled by the API adapter.",
  },
  "invitation.resent": {
    handler: "audit",
    effect: "acknowledge_audit_only",
    reason: "Invitation mail is delivered and reconciled by the API adapter.",
  },
  "invitation.revoked": {
    handler: "audit",
    effect: "acknowledge_audit_only",
    reason: "Revocation is fully committed in the originating transaction.",
  },
  "invitation.delivery_sent": {
    handler: "audit",
    effect: "acknowledge_audit_only",
    reason: "The provider delivery result is already durably reconciled.",
  },
  "invitation.delivery_failed": {
    handler: "audit",
    effect: "acknowledge_audit_only",
    reason: "The provider delivery failure is already durably reconciled.",
  },
  "invitation.accepted": {
    handler: "attention",
    effect: "recompute_attention",
    reason: "Acceptance creates a membership eligible for signal delivery.",
  },
  "portfolio.created": {
    handler: "attention",
    effect: "recompute_attention",
    reason: "Portfolio scope participates in the active Attention data set.",
  },
  "portfolio.updated": {
    handler: "attention",
    effect: "recompute_attention",
    reason: "Portfolio state can change the active Attention data set.",
  },
  "portfolio.archived": {
    handler: "attention",
    effect: "recompute_attention",
    reason: "Signals beneath archived Portfolios must resolve promptly.",
  },
  "workspace.created": {
    handler: "attention",
    effect: "recompute_attention",
    reason: "New Workspaces participate in stale-update signal calculation.",
  },
  "workspace.updated": {
    handler: "attention",
    effect: "recompute_attention",
    reason: "Lead and lifecycle changes alter signals and their recipients.",
  },
  "workspace.archived": {
    handler: "attention",
    effect: "recompute_attention",
    reason: "Signals beneath archived Workspaces must resolve promptly.",
  },
  "board.created": {
    handler: "audit",
    effect: "acknowledge_audit_only",
    reason: "Boards have no independent Phase 4 asynchronous projection.",
  },
  "board.updated": {
    handler: "audit",
    effect: "acknowledge_audit_only",
    reason: "Board metadata does not affect the current signal rules.",
  },
  "item.created": {
    handler: "attention",
    effect: "recompute_attention",
    reason: "WorkItem state is a canonical Attention input.",
  },
  "item.updated": {
    handler: "attention",
    effect: "recompute_attention",
    reason: "WorkItem state is a canonical Attention input.",
  },
  "item.dependency_added": {
    handler: "attention",
    effect: "recompute_attention",
    reason: "Dependency changes may alter deterministic work signals.",
  },
  "item.dependency_removed": {
    handler: "attention",
    effect: "recompute_attention",
    reason: "Dependency changes may alter deterministic work signals.",
  },
  "comment.created": {
    handler: "audit",
    effect: "acknowledge_audit_only",
    reason: "Comments are durable evidence without a separate projection.",
  },
  "comment.updated": {
    handler: "audit",
    effect: "acknowledge_audit_only",
    reason: "Comments are durable evidence without a separate projection.",
  },
  "workspace_update.created": {
    handler: "attention",
    effect: "recompute_attention",
    reason: "Published updates reset Workspace staleness signals.",
  },
  "workspace_update.updated": {
    handler: "attention",
    effect: "recompute_attention",
    reason: "Published updates reset Workspace staleness signals.",
  },
  "decision.outcome_recorded": {
    handler: "attention",
    effect: "recompute_attention",
    reason: "Decision outcomes resolve pending-decision signals.",
  },
  "review_ritual.created": {
    handler: "audit",
    effect: "acknowledge_audit_only",
    reason: "Review cadence has no separate Phase 4 worker projection.",
  },
  "review_ritual.updated": {
    handler: "audit",
    effect: "acknowledge_audit_only",
    reason: "Review cadence has no separate Phase 4 worker projection.",
  },
  "workspace_snapshot.created": {
    handler: "audit",
    effect: "acknowledge_audit_only",
    reason: "Snapshots are complete when their transaction commits.",
  },
  "attention.actioned": {
    handler: "audit",
    effect: "acknowledge_audit_only",
    reason: "The action is already reflected in the signal aggregate.",
  },
  "waiting.created": {
    handler: "attention",
    effect: "recompute_attention",
    reason: "Waiting deadlines are canonical Attention inputs.",
  },
  "waiting.actioned": {
    handler: "attention",
    effect: "recompute_attention",
    reason: "Waiting actions can resolve or reschedule Attention signals.",
  },
  "inbox_item.captured": {
    handler: "audit",
    effect: "acknowledge_audit_only",
    reason: "Captured Inbox state is already canonical and durable.",
  },
  "inbox_item.updated": {
    handler: "audit",
    effect: "acknowledge_audit_only",
    reason: "Inbox metadata has no separate Phase 4 projection.",
  },
  "inbox_item.converted": {
    handler: "audit",
    effect: "acknowledge_audit_only",
    reason: "The converted WorkItem emits its own Attention event.",
  },
  "weekly_review.submitted": {
    handler: "attention",
    effect: "recompute_attention",
    reason: "A weekly review publishes an update and changes staleness.",
  },
  "privacy.request.submitted": {
    handler: "audit",
    effect: "acknowledge_audit_only",
    reason:
      "Submission records an auditable request; reviewed effects use a separately approved lifecycle processor.",
  },
  "privacy.request.cancelled": {
    handler: "audit",
    effect: "acknowledge_audit_only",
    reason: "Cancellation is complete when the request transaction commits.",
  },
  "privacy.retention.updated": {
    handler: "audit",
    effect: "acknowledge_audit_only",
    reason:
      "The versioned retention override and legal-hold state are already durable.",
  },
  "team.created": {
    handler: "collaboration",
    effect: "apply_collaboration_effect",
    reason: "Acknowledge the atomic Team-room collaboration mutation.",
  },
  "team.updated": {
    handler: "collaboration",
    effect: "apply_collaboration_effect",
    reason: "Acknowledge the synchronized Team-room mutation.",
  },
  "team.membership_changed": {
    handler: "collaboration",
    effect: "apply_collaboration_effect",
    reason: "Acknowledge synchronized Team and room membership.",
  },
  "conversation.created": {
    handler: "collaboration",
    effect: "apply_collaboration_effect",
    reason: "Acknowledge the durable conversation and participants.",
  },
  "conversation.participants_changed": {
    handler: "collaboration",
    effect: "apply_collaboration_effect",
    reason: "Acknowledge the durable participant grant change.",
  },
  "conversation.read": {
    handler: "collaboration",
    effect: "apply_collaboration_effect",
    reason: "Acknowledge the durable read checkpoint change.",
  },
  "message.sent": {
    handler: "collaboration",
    effect: "apply_collaboration_effect",
    reason: "Acknowledge the durable idempotent message mutation.",
  },
  "message.response_changed": {
    handler: "collaboration",
    effect: "apply_collaboration_effect",
    reason: "Acknowledge the durable response workflow change.",
  },
  "message.reaction_changed": {
    handler: "collaboration",
    effect: "apply_collaboration_effect",
    reason: "Acknowledge the durable reaction change.",
  },
  "message.retention_due": {
    handler: "collaboration",
    effect: "apply_collaboration_effect",
    reason: "Redact expired message content and replay material atomically.",
  },
} as const satisfies Record<string, WorkerEventCatalogEntry>;

export type WorkerEventType = keyof typeof workerEventCatalog;

export const knownWorkerEventTypes = Object.freeze(
  Object.keys(workerEventCatalog) as WorkerEventType[],
);

export const internalWorkerEventTypes = eventTypesForHandler("attention");
export const auditWorkerEventTypes = eventTypesForHandler("audit");
export const collaborationWorkerEventTypes =
  eventTypesForHandler("collaboration");

function eventTypesForHandler(
  handler: WorkerEventHandlerName,
): readonly WorkerEventType[] {
  return Object.freeze(
    (
      Object.entries(workerEventCatalog) as Array<
        [WorkerEventType, WorkerEventCatalogEntry]
      >
    )
      .filter(([, definition]) => definition.handler === handler)
      .map(([eventType]) => eventType),
  );
}

const recomputableEventTypes = new Set<string>(internalWorkerEventTypes);
const auditOnlyEventTypes = new Set<string>(auditWorkerEventTypes);
const collaborationEventTypes = new Set<string>(collaborationWorkerEventTypes);

export function createWorkerRepositories(
  database: TrevvDatabase,
  options: WorkerRepositoryOptions = {},
): WorkerRepositories {
  const clock = options.clock ?? (() => new Date());
  return {
    outbox: {
      lease: (input) => leaseOutbox(database, input),
      process: (lease, handler) =>
        processLeasedEvent(database, lease, handler, clock),
      fail: (lease, input) => failLeasedEvent(database, lease, input),
      telemetry: (input) => readOutboxTelemetry(database, input),
    },
    attention: {
      recomputeOrganization: (organizationId, now) =>
        database.transaction((transaction) =>
          recomputeOrganizationAttention(transaction, organizationId, now),
        ),
      recomputeAll: (now, limit) =>
        recomputeAllOrganizations(database, now, limit),
    },
  };
}

async function leaseOutbox(
  database: TrevvDatabase,
  input: {
    workerId: string;
    now: Date;
    leaseMs: number;
    maxAttempts: number;
    limit: number;
    eventTypes?: readonly string[];
  },
): Promise<WorkerLease[]> {
  const workerId = normalizeWorkerId(input.workerId);
  const limit = boundedInteger(input.limit, 1, 100, "lease batch size");
  const leaseMs = boundedInteger(
    input.leaseMs,
    1_000,
    300_000,
    "lease duration",
  );
  const maxAttempts = boundedInteger(
    input.maxAttempts,
    1,
    50,
    "maximum attempt count",
  );
  const eventTypes = [...new Set(input.eventTypes ?? internalWorkerEventTypes)];
  if (eventTypes.length === 0) return [];
  const leaseExpiresAt = new Date(input.now.getTime() + leaseMs);
  return database.transaction(async (transaction) => {
    const candidates = await transaction
      .select()
      .from(outboxEvents)
      .where(
        and(
          isNull(outboxEvents.processedAt),
          isNull(outboxEvents.deadLetteredAt),
          inArray(outboxEvents.eventType, eventTypes),
          lte(outboxEvents.availableAt, input.now),
          or(
            isNull(outboxEvents.leaseExpiresAt),
            lte(outboxEvents.leaseExpiresAt, input.now),
          ),
        ),
      )
      .orderBy(
        asc(outboxEvents.availableAt),
        asc(outboxEvents.createdAt),
        asc(outboxEvents.id),
      )
      .limit(limit)
      .for("update", { skipLocked: true });

    const leases: WorkerLease[] = [];
    for (const candidate of candidates) {
      if (candidate.leaseToken && candidate.attempts > 0) {
        const deadLettered = candidate.attempts >= maxAttempts;
        await transaction
          .update(outboxAttempts)
          .set({
            status: deadLettered ? "dead_lettered" : "failed",
            errorCode: "lease_expired",
            finishedAt: input.now,
          })
          .where(
            and(
              eq(outboxAttempts.organizationId, candidate.organizationId),
              eq(outboxAttempts.eventId, candidate.id),
              eq(outboxAttempts.attempt, candidate.attempts),
              eq(outboxAttempts.leaseToken, candidate.leaseToken),
              eq(outboxAttempts.status, "leased"),
            ),
          );
        if (deadLettered) {
          await transaction
            .update(outboxEvents)
            .set({
              lastErrorCode: "lease_expired",
              lastErrorAt: input.now,
              deadLetteredAt: input.now,
              lockedAt: null,
              lockedBy: null,
              leaseToken: null,
              leaseExpiresAt: null,
            })
            .where(
              and(
                eq(outboxEvents.organizationId, candidate.organizationId),
                eq(outboxEvents.id, candidate.id),
                eq(outboxEvents.attempts, candidate.attempts),
                eq(outboxEvents.leaseToken, candidate.leaseToken),
                isNull(outboxEvents.processedAt),
                isNull(outboxEvents.deadLetteredAt),
              ),
            );
          continue;
        }
      }
      const attempt = candidate.attempts + 1;
      const leaseToken = crypto.randomUUID();
      const [leased] = await transaction
        .update(outboxEvents)
        .set({
          attempts: attempt,
          lockedAt: input.now,
          lockedBy: workerId,
          leaseToken,
          leaseExpiresAt,
        })
        .where(
          and(
            eq(outboxEvents.organizationId, candidate.organizationId),
            eq(outboxEvents.id, candidate.id),
            isNull(outboxEvents.processedAt),
            isNull(outboxEvents.deadLetteredAt),
          ),
        )
        .returning();
      if (!leased) continue;
      await transaction.insert(outboxAttempts).values({
        id: crypto.randomUUID(),
        organizationId: leased.organizationId,
        eventId: leased.id,
        attempt,
        workerId,
        leaseToken,
        status: "leased",
        startedAt: input.now,
      });
      leases.push({
        eventId: leased.id,
        organizationId: leased.organizationId,
        eventType: leased.eventType,
        aggregateType: leased.aggregateType,
        aggregateId: leased.aggregateId,
        payload: leased.payload,
        attempt,
        workerId,
        leaseToken,
        leaseExpiresAt,
        createdAt: leased.createdAt,
      });
    }
    return leases;
  });
}

async function processLeasedEvent<T>(
  database: TrevvDatabase,
  lease: WorkerLease,
  handler: (repositories: WorkerTransactionRepositories) => Promise<T>,
  clock: () => Date,
): Promise<{ status: "processed"; value: T } | { status: "lease_lost" }> {
  try {
    return await database.transaction(async (transaction) => {
      const startedAt = clock();
      const [current] = await transaction
        .select()
        .from(outboxEvents)
        .where(
          and(
            eq(outboxEvents.organizationId, lease.organizationId),
            eq(outboxEvents.id, lease.eventId),
            eq(outboxEvents.lockedBy, lease.workerId),
            eq(outboxEvents.leaseToken, lease.leaseToken),
            eq(outboxEvents.attempts, lease.attempt),
            isNull(outboxEvents.processedAt),
            isNull(outboxEvents.deadLetteredAt),
          ),
        )
        .limit(1)
        .for("update");
      if (
        !current ||
        !current.leaseExpiresAt ||
        current.leaseExpiresAt <= startedAt
      )
        throw new LeaseLostError();

      const repositories = createWorkerTransactionRepositories(
        transaction,
        lease,
      );
      const value = await handler(repositories);
      const completedAt = clock();
      if (current.leaseExpiresAt <= completedAt) throw new LeaseLostError();
      const [processed] = await transaction
        .update(outboxEvents)
        .set({
          processedAt: completedAt,
          processedBy: lease.workerId,
          lockedAt: null,
          lockedBy: null,
          leaseToken: null,
          leaseExpiresAt: null,
          lastErrorCode: null,
        })
        .where(
          and(
            eq(outboxEvents.organizationId, lease.organizationId),
            eq(outboxEvents.id, lease.eventId),
            eq(outboxEvents.leaseToken, lease.leaseToken),
            eq(outboxEvents.attempts, lease.attempt),
            isNull(outboxEvents.processedAt),
            gt(outboxEvents.leaseExpiresAt, completedAt),
          ),
        )
        .returning({ id: outboxEvents.id });
      if (!processed) throw new LeaseLostError();
      await transaction
        .update(outboxAttempts)
        .set({ status: "succeeded", finishedAt: completedAt })
        .where(
          and(
            eq(outboxAttempts.organizationId, lease.organizationId),
            eq(outboxAttempts.eventId, lease.eventId),
            eq(outboxAttempts.attempt, lease.attempt),
            eq(outboxAttempts.leaseToken, lease.leaseToken),
            eq(outboxAttempts.status, "leased"),
          ),
        );
      return { status: "processed", value };
    });
  } catch (error) {
    if (error instanceof LeaseLostError) return { status: "lease_lost" };
    throw error;
  }
}

class LeaseLostError extends Error {}

async function failLeasedEvent(
  database: TrevvDatabase,
  lease: WorkerLease,
  input: {
    now: Date;
    nextAvailableAt: Date;
    errorCode: string;
    maxAttempts: number;
  },
): Promise<"retry_scheduled" | "dead_lettered" | "lease_lost"> {
  const maxAttempts = boundedInteger(
    input.maxAttempts,
    1,
    50,
    "maximum attempt count",
  );
  const errorCode = normalizeErrorCode(input.errorCode);
  return database.transaction(async (transaction) => {
    const [current] = await transaction
      .select()
      .from(outboxEvents)
      .where(
        and(
          eq(outboxEvents.organizationId, lease.organizationId),
          eq(outboxEvents.id, lease.eventId),
          eq(outboxEvents.lockedBy, lease.workerId),
          eq(outboxEvents.leaseToken, lease.leaseToken),
          eq(outboxEvents.attempts, lease.attempt),
          isNull(outboxEvents.processedAt),
          isNull(outboxEvents.deadLetteredAt),
          gt(outboxEvents.leaseExpiresAt, input.now),
        ),
      )
      .limit(1)
      .for("update");
    if (!current) return "lease_lost";
    const deadLettered = current.attempts >= maxAttempts;
    const [failed] = await transaction
      .update(outboxEvents)
      .set({
        availableAt: input.nextAvailableAt,
        lastErrorCode: errorCode,
        lastErrorAt: input.now,
        deadLetteredAt: deadLettered ? input.now : null,
        lockedAt: null,
        lockedBy: null,
        leaseToken: null,
        leaseExpiresAt: null,
      })
      .where(
        and(
          eq(outboxEvents.organizationId, lease.organizationId),
          eq(outboxEvents.id, lease.eventId),
          eq(outboxEvents.leaseToken, lease.leaseToken),
          eq(outboxEvents.attempts, lease.attempt),
          gt(outboxEvents.leaseExpiresAt, input.now),
        ),
      )
      .returning({ id: outboxEvents.id });
    if (!failed) return "lease_lost";
    await transaction
      .update(outboxAttempts)
      .set({
        status: deadLettered ? "dead_lettered" : "failed",
        errorCode,
        finishedAt: input.now,
      })
      .where(
        and(
          eq(outboxAttempts.organizationId, lease.organizationId),
          eq(outboxAttempts.eventId, lease.eventId),
          eq(outboxAttempts.attempt, lease.attempt),
          eq(outboxAttempts.leaseToken, lease.leaseToken),
          eq(outboxAttempts.status, "leased"),
        ),
      );
    return deadLettered ? "dead_lettered" : "retry_scheduled";
  });
}

async function readOutboxTelemetry(
  database: TrevvDatabase,
  input: {
    now: Date;
    ownedEventTypes: readonly string[];
    activeEventTypes: readonly string[];
  },
): Promise<WorkerQueueTelemetry> {
  const ownedEventTypes = [...new Set(input.ownedEventTypes)];
  const activeEventTypes = [...new Set(input.activeEventTypes)];
  const pending = and(
    isNull(outboxEvents.processedAt),
    isNull(outboxEvents.deadLetteredAt),
  );
  const owned = ownedEventTypes.length
    ? inArray(outboxEvents.eventType, ownedEventTypes)
    : sql`false`;
  const active = activeEventTypes.length
    ? inArray(outboxEvents.eventType, activeEventTypes)
    : sql`false`;
  const paused = activeEventTypes.length
    ? and(owned, notInArray(outboxEvents.eventType, activeEventTypes))
    : owned;
  const unsupported = ownedEventTypes.length
    ? notInArray(outboxEvents.eventType, ownedEventTypes)
    : sql`true`;
  const ready = and(
    pending,
    active,
    lte(outboxEvents.availableAt, input.now),
    or(
      isNull(outboxEvents.leaseExpiresAt),
      lte(outboxEvents.leaseExpiresAt, input.now),
    ),
  );
  const delayed = and(pending, active, gt(outboxEvents.availableAt, input.now));
  const leased = and(
    pending,
    active,
    gt(outboxEvents.leaseExpiresAt, input.now),
  );

  const [queueRows, attemptRows] = await Promise.all([
    database
      .select({
        ready: sql<number>`count(*) filter (where ${ready})::int`,
        delayed: sql<number>`count(*) filter (where ${delayed})::int`,
        leased: sql<number>`count(*) filter (where ${leased})::int`,
        deadLettered: sql<number>`count(*) filter (where ${and(
          owned,
          isNotNull(outboxEvents.deadLetteredAt),
        )})::int`,
        paused: sql<number>`count(*) filter (where ${and(
          pending,
          paused,
        )})::int`,
        unsupported: sql<number>`count(*) filter (where ${and(
          pending,
          unsupported,
        )})::int`,
        oldestReadyAt: sql<Date | null>`min(${outboxEvents.createdAt}) filter (where ${ready})`,
        oldestUnsupportedAt: sql<Date | null>`min(${outboxEvents.createdAt}) filter (where ${and(
          pending,
          unsupported,
        )})`,
      })
      .from(outboxEvents),
    database
      .select({
        leased: sql<number>`count(*) filter (where ${eq(
          outboxAttempts.status,
          "leased",
        )})::int`,
        succeeded: sql<number>`count(*) filter (where ${eq(
          outboxAttempts.status,
          "succeeded",
        )})::int`,
        failed: sql<number>`count(*) filter (where ${eq(
          outboxAttempts.status,
          "failed",
        )})::int`,
        deadLettered: sql<number>`count(*) filter (where ${eq(
          outboxAttempts.status,
          "dead_lettered",
        )})::int`,
      })
      .from(outboxAttempts),
  ]);
  const [queue] = queueRows;
  const [attempts] = attemptRows;

  return {
    observedAt: input.now,
    ready: queue?.ready ?? 0,
    delayed: queue?.delayed ?? 0,
    leased: queue?.leased ?? 0,
    deadLettered: queue?.deadLettered ?? 0,
    paused: queue?.paused ?? 0,
    unsupported: queue?.unsupported ?? 0,
    oldestReadyAgeMs: ageMs(input.now, queue?.oldestReadyAt),
    oldestUnsupportedAgeMs: ageMs(input.now, queue?.oldestUnsupportedAt),
    attempts: {
      leased: attempts?.leased ?? 0,
      succeeded: attempts?.succeeded ?? 0,
      failed: attempts?.failed ?? 0,
      deadLettered: attempts?.deadLettered ?? 0,
    },
  };
}

function ageMs(
  now: Date,
  value: Date | string | null | undefined,
): number | null {
  if (!value) return null;
  const observed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(observed.getTime())
    ? null
    : Math.max(0, now.getTime() - observed.getTime());
}

function createWorkerTransactionRepositories(
  transaction: TrevvDatabase,
  event: WorkerLease,
): WorkerTransactionRepositories {
  return {
    event,
    processInternalEvent: async (now) => {
      if (collaborationEventTypes.has(event.eventType))
        return processCollaborationEvent(transaction, event, now);
      if (auditOnlyEventTypes.has(event.eventType))
        return { recomputed: false };
      if (recomputableEventTypes.has(event.eventType))
        return {
          recomputed: true,
          attention: await recomputeOrganizationAttention(
            transaction,
            event.organizationId,
            now,
          ),
        };
      throw workerRepositoryError("unsupported_worker_event");
    },
    attention: {
      recomputeOrganization: (organizationId, now) =>
        recomputeOrganizationAttention(transaction, organizationId, now),
    },
  };
}

async function processCollaborationEvent(
  transaction: TrevvDatabase,
  event: WorkerLease,
  now: Date,
): Promise<InternalEventResult> {
  if (event.eventType !== "message.retention_due")
    return { recomputed: false, effects: 0 };
  if (event.aggregateType !== "message")
    throw workerRepositoryError("invalid_retention_event");
  const [message] = await transaction
    .select()
    .from(conversationMessages)
    .where(
      and(
        eq(conversationMessages.organizationId, event.organizationId),
        eq(conversationMessages.id, event.aggregateId),
        isNull(conversationMessages.deletedAt),
      ),
    )
    .limit(1)
    .for("update");
  if (!message) return { recomputed: false, effects: 0 };
  if (message.expiresAt > now)
    throw workerRepositoryError("message_retention_not_due");
  const [redacted] =
    message.redactedAt === null
      ? await transaction
          .update(conversationMessages)
          .set({
            body: "[Message expired]",
            metadata: {},
            redactedAt: now,
            version: sql`${conversationMessages.version} + 1`,
            updatedAt: now,
          })
          .where(
            and(
              eq(conversationMessages.organizationId, event.organizationId),
              eq(conversationMessages.id, event.aggregateId),
              isNull(conversationMessages.redactedAt),
              isNull(conversationMessages.deletedAt),
              lte(conversationMessages.expiresAt, now),
            ),
          )
          .returning({ id: conversationMessages.id })
      : [];
  await Promise.all([
    transaction
      .delete(idempotencyRecords)
      .where(
        and(
          eq(idempotencyRecords.organizationId, event.organizationId),
          eq(idempotencyRecords.resultType, "message"),
          eq(idempotencyRecords.resultId, event.aggregateId),
        ),
      ),
    transaction
      .delete(conversationMessageMetadataQuarantine)
      .where(
        and(
          eq(
            conversationMessageMetadataQuarantine.organizationId,
            event.organizationId,
          ),
          eq(
            conversationMessageMetadataQuarantine.messageId,
            event.aggregateId,
          ),
        ),
      ),
    transaction.execute(sql`
      delete from legacy_collaboration_record_quarantine
       where organization_id = ${event.organizationId}
         and entity_type = 'message'
         and entity_id = ${event.aggregateId}
    `),
  ]);
  return { recomputed: false, effects: redacted ? 1 : 0 };
}

interface DesiredAttentionSignal {
  portfolioId: string;
  workspaceId: string;
  entityType: "work_item" | "workspace";
  entityId: string;
  reasonCode:
    | "work_item.blocked"
    | "work_item.overdue"
    | "work_item.unassigned_priority"
    | "decision.pending"
    | "approval.pending"
    | "waiting.follow_up_due"
    | "workspace.update_stale";
  signalType: string;
  severity: "info" | "low" | "medium" | "high" | "critical";
  impact: number;
  urgency: number;
  reason: string;
  recommendedAction: string;
  evidence: Record<string, unknown>;
  sourceOccurredAt: Date;
  recipientIds: string[];
}

async function recomputeAllOrganizations(
  database: TrevvDatabase,
  now: Date,
  requestedLimit: number,
): Promise<AttentionRecomputeResult[]> {
  const limit = boundedInteger(
    requestedLimit,
    1,
    1_000,
    "organization sweep limit",
  );
  const rows = await database
    .select({ id: organizations.id })
    .from(organizations)
    .where(
      and(isNull(organizations.archivedAt), isNull(organizations.deletedAt)),
    )
    .orderBy(
      sql`${organizations.attentionComputedAt} asc nulls first`,
      asc(organizations.id),
    )
    .limit(limit);
  const results: AttentionRecomputeResult[] = [];
  for (const { id } of rows)
    results.push(
      await database.transaction((transaction) =>
        recomputeOrganizationAttention(transaction, id, now),
      ),
    );
  return results;
}

async function recomputeOrganizationAttention(
  transaction: TrevvDatabase,
  organizationId: string,
  now: Date,
): Promise<AttentionRecomputeResult> {
  await transaction.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${organizationId}, 0))`,
  );
  const [organization] = await transaction
    .select()
    .from(organizations)
    .where(
      and(
        eq(organizations.id, organizationId),
        isNull(organizations.archivedAt),
        isNull(organizations.deletedAt),
      ),
    )
    .limit(1);
  if (!organization)
    return {
      organizationId,
      created: 0,
      refreshed: 0,
      resolved: 0,
      notifications: 0,
    };
  const today = localDate(now, organization.timezone);
  const itemRows = await transaction
    .select({ item: workItems, workspace: workspaces })
    .from(workItems)
    .innerJoin(
      workspaces,
      and(
        eq(workspaces.organizationId, workItems.organizationId),
        eq(workspaces.id, workItems.workspaceId),
      ),
    )
    .innerJoin(
      portfolios,
      and(
        eq(portfolios.organizationId, workspaces.organizationId),
        eq(portfolios.id, workspaces.portfolioId),
      ),
    )
    .where(
      and(
        eq(workItems.organizationId, organizationId),
        isNull(workItems.archivedAt),
        isNull(workItems.deletedAt),
        isNull(workspaces.archivedAt),
        isNull(workspaces.deletedAt),
        isNull(portfolios.archivedAt),
        isNull(portfolios.deletedAt),
      ),
    );
  const itemIds = itemRows.map(({ item }) => item.id);
  const [assigneeRows, waitingRows, updateRows] = await Promise.all([
    itemIds.length
      ? transaction
          .select({
            itemId: itemAssignees.itemId,
            userId: itemAssignees.userId,
          })
          .from(itemAssignees)
          .where(
            and(
              eq(itemAssignees.organizationId, organizationId),
              inArray(itemAssignees.itemId, itemIds),
            ),
          )
      : Promise.resolve([]),
    transaction
      .select()
      .from(waitingStates)
      .where(
        and(
          eq(waitingStates.organizationId, organizationId),
          isNull(waitingStates.resolvedAt),
          isNull(waitingStates.deletedAt),
        ),
      ),
    transaction
      .select()
      .from(workspaceUpdates)
      .where(
        and(
          eq(workspaceUpdates.organizationId, organizationId),
          isNull(workspaceUpdates.deletedAt),
        ),
      )
      .orderBy(desc(workspaceUpdates.publishedAt), desc(workspaceUpdates.id)),
  ]);
  const assigneesByItem = new Map<string, string[]>();
  for (const row of assigneeRows) {
    const current = assigneesByItem.get(row.itemId) ?? [];
    current.push(row.userId);
    assigneesByItem.set(row.itemId, current);
  }
  const latestUpdateByWorkspace = new Map<
    string,
    typeof workspaceUpdates.$inferSelect
  >();
  for (const row of updateRows)
    if (!latestUpdateByWorkspace.has(row.workspaceId))
      latestUpdateByWorkspace.set(row.workspaceId, row);

  const desired: DesiredAttentionSignal[] = [];
  for (const { item, workspace } of itemRows) {
    if (item.status === "done") continue;
    const recipientIds = uniqueStrings([
      ...(assigneesByItem.get(item.id) ?? []),
      ...(workspace.leadUserId ? [workspace.leadUserId] : []),
    ]);
    const source = {
      itemId: item.id,
      itemVersion: item.version,
      status: item.status,
      priority: item.priority,
      dueDate: item.dueDate,
    };
    if (item.status === "blocked")
      desired.push({
        portfolioId: workspace.portfolioId,
        workspaceId: workspace.id,
        entityType: "work_item",
        entityId: item.id,
        reasonCode: "work_item.blocked",
        signalType: "blocked_work",
        severity: item.priority === "urgent" ? "critical" : "high",
        impact: item.priority === "urgent" ? 5 : 4,
        urgency: 5,
        reason: `${item.title} is blocked`,
        recommendedAction: "Unblock, reassign, or record what is needed.",
        evidence: source,
        sourceOccurredAt: item.updatedAt,
        recipientIds,
      });
    if (item.dueDate && item.dueDate < today)
      desired.push({
        portfolioId: workspace.portfolioId,
        workspaceId: workspace.id,
        entityType: "work_item",
        entityId: item.id,
        reasonCode: "work_item.overdue",
        signalType: "overdue_work",
        severity: item.priority === "urgent" ? "critical" : "high",
        impact: item.priority === "urgent" ? 5 : 4,
        urgency: 5,
        reason: `${item.title} is overdue`,
        recommendedAction: "Resolve it or set an honest due date.",
        evidence: { ...source, organizationDate: today },
        sourceOccurredAt: item.updatedAt,
        recipientIds,
      });
    if (
      (item.priority === "urgent" || item.priority === "high") &&
      !assigneesByItem.get(item.id)?.length
    )
      desired.push({
        portfolioId: workspace.portfolioId,
        workspaceId: workspace.id,
        entityType: "work_item",
        entityId: item.id,
        reasonCode: "work_item.unassigned_priority",
        signalType: "unassigned_priority_work",
        severity: item.priority === "urgent" ? "critical" : "high",
        impact: item.priority === "urgent" ? 5 : 4,
        urgency: item.priority === "urgent" ? 5 : 4,
        reason: `${item.title} has no owner`,
        recommendedAction: "Assign a responsible person.",
        evidence: source,
        sourceOccurredAt: item.updatedAt,
        recipientIds,
      });
    const typeData = recordValue(item.typeData);
    if (item.itemType === "decision" && typeData.decisionState !== "decided")
      desired.push({
        portfolioId: workspace.portfolioId,
        workspaceId: workspace.id,
        entityType: "work_item",
        entityId: item.id,
        reasonCode: "decision.pending",
        signalType: "pending_decision",
        severity: item.priority === "urgent" ? "critical" : "high",
        impact: 5,
        urgency: item.priority === "urgent" ? 5 : 4,
        reason: `${item.title} still needs a decision`,
        recommendedAction: "Decide, delegate, or defer with rationale.",
        evidence: { ...source, decisionState: typeData.decisionState ?? null },
        sourceOccurredAt: item.updatedAt,
        recipientIds,
      });
    if (item.itemType === "approval" && typeData.approvalState === "pending")
      desired.push({
        portfolioId: workspace.portfolioId,
        workspaceId: workspace.id,
        entityType: "work_item",
        entityId: item.id,
        reasonCode: "approval.pending",
        signalType: "pending_approval",
        severity: item.priority === "urgent" ? "critical" : "high",
        impact: 4,
        urgency: item.priority === "urgent" ? 5 : 4,
        reason: `${item.title} is waiting for approval`,
        recommendedAction:
          "Approve, reject, or request changes with rationale.",
        evidence: { ...source, approvalState: "pending" },
        sourceOccurredAt: item.updatedAt,
        recipientIds,
      });
  }
  const itemWorkspace = new Map(
    itemRows.map(({ item, workspace }) => [item.id, workspace] as const),
  );
  for (const waiting of waitingRows) {
    const followUpDate = waiting.nextFollowUp ?? waiting.expectedBy;
    const workspace = itemWorkspace.get(waiting.entityId);
    if (!workspace || !followUpDate || followUpDate > today) continue;
    desired.push({
      portfolioId: workspace.portfolioId,
      workspaceId: workspace.id,
      entityType: "work_item",
      entityId: waiting.entityId,
      reasonCode: "waiting.follow_up_due",
      signalType: "waiting_follow_up",
      severity: followUpDate < today ? "high" : "medium",
      impact: 3,
      urgency: followUpDate < today ? 5 : 4,
      reason: waiting.waitingLabel
        ? `Follow up with ${waiting.waitingLabel}`
        : "A Waiting follow-up is due",
      recommendedAction: "Follow up, reschedule, or resolve with evidence.",
      evidence: {
        waitingId: waiting.id,
        waitingVersion: waiting.version,
        followUpDate,
        organizationDate: today,
        waitingType: waiting.waitingType,
      },
      sourceOccurredAt: waiting.updatedAt,
      recipientIds: [waiting.followUpOwnerId],
    });
  }
  const uniqueWorkspaces = new Map(
    itemRows.map(({ workspace }) => [workspace.id, workspace] as const),
  );
  const standaloneWorkspaces = await transaction
    .select({ workspace: workspaces })
    .from(workspaces)
    .innerJoin(
      portfolios,
      and(
        eq(portfolios.organizationId, workspaces.organizationId),
        eq(portfolios.id, workspaces.portfolioId),
      ),
    )
    .where(
      and(
        eq(workspaces.organizationId, organizationId),
        isNull(workspaces.archivedAt),
        isNull(workspaces.deletedAt),
        isNull(portfolios.archivedAt),
        isNull(portfolios.deletedAt),
      ),
    );
  for (const { workspace } of standaloneWorkspaces)
    uniqueWorkspaces.set(workspace.id, workspace);
  for (const workspace of uniqueWorkspaces.values()) {
    const latest = latestUpdateByWorkspace.get(workspace.id);
    const sourceOccurredAt = latest?.publishedAt ?? workspace.createdAt;
    if (
      calendarDaysBetween(
        localDate(sourceOccurredAt, organization.timezone),
        today,
      ) < 7
    )
      continue;
    desired.push({
      portfolioId: workspace.portfolioId,
      workspaceId: workspace.id,
      entityType: "workspace",
      entityId: workspace.id,
      reasonCode: "workspace.update_stale",
      signalType: "stale_workspace_update",
      severity: "medium",
      impact: 3,
      urgency: 3,
      reason: `${workspace.name} has no recent update`,
      recommendedAction: "Publish a concise Workspace update.",
      evidence: {
        latestUpdateId: latest?.id ?? null,
        latestUpdateAt: latest?.publishedAt.toISOString() ?? null,
        staleAfterDays: 7,
        organizationDate: today,
      },
      sourceOccurredAt,
      recipientIds: workspace.leadUserId ? [workspace.leadUserId] : [],
    });
  }

  const existingRows = await transaction
    .select()
    .from(attentionSignals)
    .where(
      and(
        eq(attentionSignals.organizationId, organizationId),
        sql`${attentionSignals.reasonCode} is not null`,
      ),
    )
    .orderBy(desc(attentionSignals.createdAt), desc(attentionSignals.id));
  const desiredByKey = new Map(
    desired.map((signal) => [attentionKey(signal), signal] as const),
  );
  const activeByKey = new Map<string, typeof attentionSignals.$inferSelect>();
  const knownIds = new Set(existingRows.map(({ id }) => id));
  for (const row of existingRows) {
    if (row.resolvedAt || row.dismissedAt || !row.reasonCode) continue;
    const key = `${row.entityType}:${row.entityId}:${row.reasonCode}`;
    if (!activeByKey.has(key)) activeByKey.set(key, row);
  }
  let created = 0;
  let refreshed = 0;
  let resolved = 0;
  let notificationCount = 0;
  for (const [key, row] of activeByKey) {
    const target = desiredByKey.get(key);
    const fingerprint = target ? attentionFingerprint(target) : undefined;
    if (!target || row.sourceFingerprint !== fingerprint) {
      await transaction
        .update(attentionSignals)
        .set({
          resolvedAt: now,
          actionReason: target ? "source_changed" : "source_cleared",
          computedAt: now,
          updatedAt: now,
          version: sql`${attentionSignals.version} + 1`,
        })
        .where(
          and(
            eq(attentionSignals.organizationId, organizationId),
            eq(attentionSignals.id, row.id),
            isNull(attentionSignals.resolvedAt),
            isNull(attentionSignals.dismissedAt),
          ),
        );
      resolved += 1;
    }
  }
  const requestedRecipients = uniqueStrings(
    desired.flatMap(({ recipientIds }) => recipientIds),
  );
  const activeRecipientIds = new Set(
    requestedRecipients.length
      ? (
          await transaction
            .select({ userId: memberships.userId })
            .from(memberships)
            .where(
              and(
                eq(memberships.organizationId, organizationId),
                inArray(memberships.userId, requestedRecipients),
                isNull(memberships.archivedAt),
                isNull(memberships.deletedAt),
              ),
            )
        ).map(({ userId }) => userId)
      : [],
  );
  for (const target of desired) {
    const fingerprint = attentionFingerprint(target);
    const signalId = `attention-${hashValue({ organizationId, fingerprint }).slice(0, 40)}`;
    const matching = existingRows.find(({ id }) => id === signalId);
    if (matching) {
      if (!matching.resolvedAt && !matching.dismissedAt) {
        await transaction
          .update(attentionSignals)
          .set({
            portfolioId: target.portfolioId,
            workspaceId: target.workspaceId,
            signalType: target.signalType,
            severity: target.severity,
            impact: target.impact,
            urgency: target.urgency,
            reason: target.reason,
            recommendedAction: target.recommendedAction,
            evidence: target.evidence,
            sourceOccurredAt: target.sourceOccurredAt,
            computedAt: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(attentionSignals.organizationId, organizationId),
              eq(attentionSignals.id, signalId),
            ),
          );
        refreshed += 1;
      }
      continue;
    }
    if (knownIds.has(signalId)) continue;
    const [inserted] = await transaction
      .insert(attentionSignals)
      .values({
        id: signalId,
        organizationId,
        portfolioId: target.portfolioId,
        workspaceId: target.workspaceId,
        entityType: target.entityType,
        entityId: target.entityId,
        signalType: target.signalType,
        severity: target.severity,
        impact: target.impact,
        urgency: target.urgency,
        reason: target.reason,
        reasonCode: target.reasonCode,
        recommendedAction: target.recommendedAction,
        evidence: target.evidence,
        sourceFingerprint: fingerprint,
        sourceOccurredAt: target.sourceOccurredAt,
        computedAt: now,
        metadata: { generatedBy: "trevv-worker", schemaVersion: 1 },
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: attentionSignals.id });
    if (!inserted) continue;
    created += 1;
    for (const userId of uniqueStrings(target.recipientIds)) {
      if (!activeRecipientIds.has(userId)) continue;
      const dedupKey = hashValue({ signalId, userId });
      const [notification] = await transaction
        .insert(notifications)
        .values({
          id: `notification-${dedupKey.slice(0, 40)}`,
          organizationId,
          userId,
          category: "attention",
          title: target.reason,
          body: target.recommendedAction,
          resource: {
            type: "attention_signal",
            signalId,
            workspaceId: target.workspaceId,
            entityType: target.entityType,
            entityId: target.entityId,
            reasonCode: target.reasonCode,
          },
          dedupKey,
          createdAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: notifications.id });
      if (notification) notificationCount += 1;
    }
  }
  await transaction
    .update(organizations)
    .set({ attentionComputedAt: now })
    .where(eq(organizations.id, organizationId));
  return {
    organizationId,
    created,
    refreshed,
    resolved,
    notifications: notificationCount,
  };
}

function attentionKey(signal: DesiredAttentionSignal): string {
  return `${signal.entityType}:${signal.entityId}:${signal.reasonCode}`;
}

function attentionFingerprint(signal: DesiredAttentionSignal): string {
  const stableEvidence = Object.fromEntries(
    Object.entries(signal.evidence).filter(
      ([key]) => key !== "organizationDate",
    ),
  );
  return hashValue({
    entityType: signal.entityType,
    entityId: signal.entityId,
    reasonCode: signal.reasonCode,
    evidence: stableEvidence,
    sourceOccurredAt: signal.sourceOccurredAt.toISOString(),
  });
}

function hashValue(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableJson(value: unknown): string {
  if (value === undefined)
    throw new Error("Attention fingerprints cannot contain undefined values.");
  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    if (encoded === undefined)
      throw new Error("Attention fingerprint input is not JSON-serializable.");
    return encoded;
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function localDate(value: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(value)
      .filter(({ type }) => type !== "literal")
      .map(({ type, value: partValue }) => [type, partValue]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function calendarDaysBetween(from: string, to: string): number {
  return Math.floor(
    (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) /
      86_400_000,
  );
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function normalizeWorkerId(value: string): string {
  const normalized = value.trim();
  if (!/^[a-z0-9][a-z0-9._-]{2,127}$/iu.test(normalized))
    throw new Error("WORKER_ID must be 3-128 URL-safe characters.");
  return normalized;
}

function normalizeErrorCode(value: string): string {
  const normalized = value.trim().toLocaleLowerCase("en-US");
  return /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/u.test(normalized)
    ? normalized.slice(0, 100)
    : "internal_error";
}

function workerRepositoryError(code: string): Error {
  return Object.assign(new Error(code), { code });
}

function boundedInteger(
  value: number,
  minimum: number,
  maximum: number,
  label: string,
): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum)
    throw new Error(
      `${label} must be an integer from ${minimum} to ${maximum}.`,
    );
  return value;
}
