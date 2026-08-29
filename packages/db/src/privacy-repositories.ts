import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type {
  MutationContext,
  MutationResult,
  TenantScope,
  TrevvDatabase,
} from "./repositories.js";
import { RepositoryError, withIdempotency } from "./repositories.js";
import {
  auditLogs,
  dataLifecycleRequests,
  dataRetentionPolicies,
  memberships,
  outboxEvents,
} from "./schema.js";

export type PrivacyRequestKind =
  | "access"
  | "portability"
  | "erasure"
  | "rectification"
  | "restriction"
  | "objection";
export type PrivacyRequestScope = "user" | "organization";
export type OrganizationPrivacyRequestKind =
  "access" | "portability" | "erasure" | "restriction";
export type CreatePrivacyRequestInput =
  | { kind: PrivacyRequestKind; scope: "user" }
  | { kind: OrganizationPrivacyRequestKind; scope: "organization" };
export type PrivacyDataCategory =
  | "identity"
  | "organization"
  | "work"
  | "collaboration"
  | "audit"
  | "operations"
  | "integrations"
  | "billing";
export type PrivacyDisposition =
  "delete" | "anonymize" | "archive" | "manual_review";

export interface RetentionPolicyProjection {
  category: PrivacyDataCategory;
  retentionDays: number;
  disposition: PrivacyDisposition;
  legalHold: boolean;
  policyVersion: number;
  source: "default" | "organization_override";
  effectiveAt: Date;
  enforcementStatus: "not_implemented";
}

export const privacyInventoryVersion = "2026-08-29.1";
export const privacyPolicyVersion = "2026-08-29.1";
export const privacyDataInventory = [
  {
    category: "identity",
    examples: ["name", "email", "membership", "session references"],
    purpose: "Account access, tenant membership, and security.",
    classification: "personal",
    defaultRetentionDays: 730,
    defaultDisposition: "anonymize",
  },
  {
    category: "organization",
    examples: ["organization profile", "portfolios", "workspace settings"],
    purpose: "Operate the customer-selected organization boundary.",
    classification: "customer_content",
    defaultRetentionDays: 730,
    defaultDisposition: "delete",
  },
  {
    category: "work",
    examples: ["work items", "decisions", "reviews", "evidence"],
    purpose: "Provide the founder operating workflow and its history.",
    classification: "customer_content",
    defaultRetentionDays: 730,
    defaultDisposition: "delete",
  },
  {
    category: "collaboration",
    examples: ["teams", "room membership", "messages", "reactions"],
    purpose: "Coordinate work among explicitly authorized collaborators.",
    classification: "customer_content",
    defaultRetentionDays: 365,
    defaultDisposition: "delete",
  },
  {
    category: "audit",
    examples: ["security events", "mutation journals", "request history"],
    purpose: "Investigate access, prove requested effects, and recover safely.",
    classification: "security",
    defaultRetentionDays: 730,
    defaultDisposition: "manual_review",
  },
  {
    category: "operations",
    examples: ["redacted logs", "correlation IDs", "delivery attempts"],
    purpose: "Operate and secure the service without storing message bodies.",
    classification: "security",
    defaultRetentionDays: 90,
    defaultDisposition: "delete",
  },
  {
    category: "integrations",
    examples: ["provider connection metadata", "webhook delivery hashes"],
    purpose: "Reserved foundation; no external provider is enabled.",
    classification: "security",
    defaultRetentionDays: 90,
    defaultDisposition: "delete",
  },
  {
    category: "billing",
    examples: ["plan keys", "entitlements", "billing event references"],
    purpose: "Reserved foundation; live billing is not enabled.",
    classification: "commercial",
    defaultRetentionDays: 2555,
    defaultDisposition: "manual_review",
  },
] as const;

const defaultRetentionPolicies = privacyDataInventory.map((entry) => ({
  category: entry.category,
  retentionDays: entry.defaultRetentionDays,
  disposition: entry.defaultDisposition,
  legalHold: false,
  policyVersion: 1,
  source: "default" as const,
  effectiveAt: new Date("2026-08-29T00:00:00.000Z"),
  enforcementStatus: "not_implemented" as const,
}));

export interface PrivacyRepositories {
  listRequests(options?: {
    requestedBy?: string;
  }): Promise<Array<typeof dataLifecycleRequests.$inferSelect>>;
  getRequest(id: string): Promise<typeof dataLifecycleRequests.$inferSelect>;
  createRequest(
    input: CreatePrivacyRequestInput,
    context: MutationContext,
  ): Promise<MutationResult<typeof dataLifecycleRequests.$inferSelect>>;
  cancelRequest(
    id: string,
    expectedVersion: number,
    context: MutationContext,
  ): Promise<MutationResult<typeof dataLifecycleRequests.$inferSelect>>;
  listRetentionPolicies(): Promise<RetentionPolicyProjection[]>;
  updateRetentionPolicy(
    expectedVersion: number,
    input: {
      category: PrivacyDataCategory;
      retentionDays: number;
      disposition: PrivacyDisposition;
      legalHold: boolean;
    },
    context: MutationContext,
  ): Promise<MutationResult<RetentionPolicyProjection>>;
}

export function createPrivacyRepositories(
  database: TrevvDatabase,
  scope: TenantScope,
  runInTransaction: <T>(
    callback: (transaction: TrevvDatabase) => Promise<T>,
  ) => Promise<T>,
): PrivacyRepositories {
  return {
    listRequests: (options) =>
      database
        .select()
        .from(dataLifecycleRequests)
        .where(
          and(
            eq(dataLifecycleRequests.organizationId, scope.organizationId),
            options?.requestedBy
              ? eq(dataLifecycleRequests.requestedBy, options.requestedBy)
              : undefined,
          ),
        )
        .orderBy(desc(dataLifecycleRequests.createdAt)),
    getRequest: (id) => getRequest(database, scope, id),
    createRequest: (input, context) =>
      runInTransaction((transaction) =>
        createRequest(transaction, scope, input, context),
      ),
    cancelRequest: (id, expectedVersion, context) =>
      runInTransaction((transaction) =>
        cancelRequest(transaction, scope, id, expectedVersion, context),
      ),
    listRetentionPolicies: () => listRetentionPolicies(database, scope),
    updateRetentionPolicy: (expectedVersion, input, context) =>
      runInTransaction((transaction) =>
        updateRetentionPolicy(
          transaction,
          scope,
          expectedVersion,
          input,
          context,
        ),
      ),
  };
}

async function getRequest(
  database: TrevvDatabase,
  scope: TenantScope,
  id: string,
) {
  const [request] = await database
    .select()
    .from(dataLifecycleRequests)
    .where(
      and(
        eq(dataLifecycleRequests.organizationId, scope.organizationId),
        eq(dataLifecycleRequests.id, id),
      ),
    )
    .limit(1);
  if (!request) throw notFound();
  return request;
}

async function createRequest(
  database: TrevvDatabase,
  scope: TenantScope,
  input: { kind: PrivacyRequestKind; scope: PrivacyRequestScope },
  context: MutationContext,
): Promise<MutationResult<typeof dataLifecycleRequests.$inferSelect>> {
  assertRequestInput(input);
  const idempotencyKey = context.idempotencyKey;
  if (!idempotencyKey)
    throw new RepositoryError(
      "constraint_conflict",
      "Privacy requests require an idempotency key.",
    );
  const fingerprint =
    context.requestFingerprint ??
    hash({
      method: context.method,
      route: context.route,
      input,
      userId: scope.userId,
    });
  return withIdempotency(
    database,
    scope,
    { ...context, requestFingerprint: fingerprint },
    input,
    async () => {
      await assertActiveRequester(database, scope);
      const now = context.now ?? new Date();
      const retentionAtSubmission = await listRetentionPolicies(
        database,
        scope,
      );
      const id = randomUUID();
      const [created] = await database
        .insert(dataLifecycleRequests)
        .values({
          id,
          organizationId: scope.organizationId,
          requestedBy: scope.userId,
          subjectUserId: input.scope === "user" ? scope.userId : null,
          kind: input.kind,
          requestScope: input.scope,
          status: "submitted",
          idempotencyKey,
          requestFingerprint: fingerprint,
          dueAt: new Date(now.getTime() + 30 * 86_400_000),
          retentionUntil: new Date(now.getTime() + 730 * 86_400_000),
          resultManifest: {
            externalProviders: [],
            providerRevocation: "not_applicable_no_provider_enabled",
            effectsApplied: false,
            submission: {
              inventoryVersion: privacyInventoryVersion,
              policyVersion: privacyPolicyVersion,
              deadlineBasis: "engineering_30_day_review_target",
              retention: retentionAtSubmission.map((policy) => ({
                category: policy.category,
                retentionDays: policy.retentionDays,
                disposition: policy.disposition,
                legalHold: policy.legalHold,
                policyVersion: policy.policyVersion,
                source: policy.source,
                enforcementStatus: policy.enforcementStatus,
              })),
            },
          },
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      if (!created) throw unavailable();
      await journal(database, scope, {
        action: "privacy.request.submitted",
        requestId: id,
        payload: {
          kind: input.kind,
          requestScope: input.scope,
          status: "submitted",
          effectsApplied: false,
        },
        now,
      });
      return created;
    },
    restoreLifecycleRequest,
  );
}

async function cancelRequest(
  database: TrevvDatabase,
  scope: TenantScope,
  id: string,
  expectedVersion: number,
  context: MutationContext,
): Promise<MutationResult<typeof dataLifecycleRequests.$inferSelect>> {
  if (!context.idempotencyKey)
    throw new RepositoryError(
      "constraint_conflict",
      "Privacy request cancellation requires an idempotency key.",
    );
  return withIdempotency(
    database,
    scope,
    context,
    { id, expectedVersion },
    async () => {
      const current = await getRequest(database, scope, id);
      if (current.requestedBy !== scope.userId) throw notFound();
      if (current.version !== expectedVersion)
        throw conflict(expectedVersion, current.version);
      if (!["submitted", "under_review"].includes(current.status))
        throw new RepositoryError(
          "constraint_conflict",
          "Only submitted or under-review requests can be cancelled.",
        );
      const now = context.now ?? new Date();
      const [updated] = await database
        .update(dataLifecycleRequests)
        .set({
          status: "cancelled",
          cancelledAt: now,
          updatedAt: now,
          version: sql`${dataLifecycleRequests.version} + 1`,
        })
        .where(
          and(
            eq(dataLifecycleRequests.organizationId, scope.organizationId),
            eq(dataLifecycleRequests.id, id),
            eq(dataLifecycleRequests.requestedBy, scope.userId),
            eq(dataLifecycleRequests.version, expectedVersion),
          ),
        )
        .returning();
      if (!updated) {
        const latest = await getRequest(database, scope, id);
        throw conflict(expectedVersion, latest.version);
      }
      await journal(database, scope, {
        action: "privacy.request.cancelled",
        requestId: id,
        payload: { kind: current.kind, requestScope: current.requestScope },
        now,
      });
      return updated;
    },
    restoreLifecycleRequest,
  );
}

async function listRetentionPolicies(
  database: TrevvDatabase,
  scope: TenantScope,
): Promise<RetentionPolicyProjection[]> {
  const overrides = await database
    .select()
    .from(dataRetentionPolicies)
    .where(eq(dataRetentionPolicies.organizationId, scope.organizationId));
  const byCategory = new Map(overrides.map((row) => [row.category, row]));
  return defaultRetentionPolicies.map((fallback) => {
    const row = byCategory.get(fallback.category);
    return row
      ? {
          category: privacyCategory(row.category),
          retentionDays: row.retentionDays,
          disposition: privacyDisposition(row.disposition),
          legalHold: row.legalHold,
          policyVersion: row.policyVersion,
          source: "organization_override",
          effectiveAt: row.effectiveAt,
          enforcementStatus: "not_implemented",
        }
      : fallback;
  });
}

async function updateRetentionPolicy(
  database: TrevvDatabase,
  scope: TenantScope,
  expectedVersion: number,
  input: {
    category: PrivacyDataCategory;
    retentionDays: number;
    disposition: PrivacyDisposition;
    legalHold: boolean;
  },
  context: MutationContext,
): Promise<MutationResult<RetentionPolicyProjection>> {
  if (!context.idempotencyKey)
    throw new RepositoryError(
      "constraint_conflict",
      "Retention updates require an idempotency key.",
    );
  return withIdempotency(
    database,
    scope,
    context,
    { expectedVersion, input },
    async () => {
      await assertActiveRequester(database, scope);
      const [current] = await database
        .select()
        .from(dataRetentionPolicies)
        .where(
          and(
            eq(dataRetentionPolicies.organizationId, scope.organizationId),
            eq(dataRetentionPolicies.category, input.category),
          ),
        )
        .limit(1);
      const currentVersion = current?.policyVersion ?? 1;
      if (currentVersion !== expectedVersion)
        throw conflict(expectedVersion, currentVersion);
      const now = context.now ?? new Date();
      const nextVersion = currentVersion + 1;
      const [updated] = await database
        .insert(dataRetentionPolicies)
        .values({
          organizationId: scope.organizationId,
          category: input.category,
          retentionDays: input.retentionDays,
          disposition: input.disposition,
          legalHold: input.legalHold,
          policyVersion: nextVersion,
          updatedBy: scope.userId,
          effectiveAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            dataRetentionPolicies.organizationId,
            dataRetentionPolicies.category,
          ],
          set: {
            retentionDays: input.retentionDays,
            disposition: input.disposition,
            legalHold: input.legalHold,
            policyVersion: nextVersion,
            updatedBy: scope.userId,
            effectiveAt: now,
            updatedAt: now,
          },
          setWhere: current
            ? eq(dataRetentionPolicies.policyVersion, expectedVersion)
            : isNull(dataRetentionPolicies.organizationId),
        })
        .returning();
      if (!updated) {
        const [latest] = await database
          .select({ policyVersion: dataRetentionPolicies.policyVersion })
          .from(dataRetentionPolicies)
          .where(
            and(
              eq(dataRetentionPolicies.organizationId, scope.organizationId),
              eq(dataRetentionPolicies.category, input.category),
            ),
          )
          .limit(1);
        throw conflict(expectedVersion, latest?.policyVersion ?? 1);
      }
      await journal(database, scope, {
        action: "privacy.retention.updated",
        requestId: `${input.category}:${nextVersion}`,
        payload: {
          category: input.category,
          retentionDays: input.retentionDays,
          disposition: input.disposition,
          legalHold: input.legalHold,
          policyVersion: nextVersion,
        },
        now,
      });
      return {
        category: input.category,
        retentionDays: input.retentionDays,
        disposition: input.disposition,
        legalHold: input.legalHold,
        policyVersion: nextVersion,
        source: "organization_override" as const,
        effectiveAt: now,
        enforcementStatus: "not_implemented" as const,
      };
    },
    restoreRetentionPolicy,
  );
}

async function assertActiveRequester(
  database: TrevvDatabase,
  scope: TenantScope,
) {
  const [membership] = await database
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(
      and(
        eq(memberships.organizationId, scope.organizationId),
        eq(memberships.userId, scope.userId),
        isNull(memberships.archivedAt),
        isNull(memberships.deletedAt),
      ),
    )
    .limit(1);
  if (!membership) throw notFound();
}

async function journal(
  database: TrevvDatabase,
  scope: TenantScope,
  input: {
    action:
      | "privacy.request.submitted"
      | "privacy.request.cancelled"
      | "privacy.retention.updated";
    requestId: string;
    payload: Record<string, unknown>;
    now: Date;
  },
) {
  const payload = { requestId: scope.requestId, ...input.payload };
  const dedupKey = hash({
    organizationId: scope.organizationId,
    correlationId: scope.requestId,
    action: input.action,
    targetId: input.requestId,
    payload: input.payload,
  });
  await database.insert(auditLogs).values({
    id: randomUUID(),
    organizationId: scope.organizationId,
    actorId: scope.userId,
    action: input.action,
    targetType: input.action.startsWith("privacy.request")
      ? "data_lifecycle_request"
      : "data_retention_policy",
    targetId: input.requestId,
    payload,
    createdAt: input.now,
  });
  await database.insert(outboxEvents).values({
    id: randomUUID(),
    organizationId: scope.organizationId,
    eventType: input.action,
    aggregateType: input.action.startsWith("privacy.request")
      ? "data_lifecycle_request"
      : "data_retention_policy",
    aggregateId: input.requestId,
    schemaVersion: 1,
    actorId: scope.userId,
    requestId: scope.requestId,
    correlationId: scope.requestId,
    dedupKey,
    payload,
    availableAt: input.now,
    createdAt: input.now,
  });
}

function privacyCategory(value: string): PrivacyDataCategory {
  const found = privacyDataInventory.find((entry) => entry.category === value);
  if (!found) throw unavailable();
  return found.category;
}

function privacyDisposition(value: string): PrivacyDisposition {
  if (["delete", "anonymize", "archive", "manual_review"].includes(value))
    return value as PrivacyDisposition;
  throw unavailable();
}

function restoreLifecycleRequest(
  value: unknown,
): typeof dataLifecycleRequests.$inferSelect {
  if (!value || typeof value !== "object") throw unavailable();
  const record = value as Record<string, unknown>;
  for (const key of [
    "id",
    "organizationId",
    "requestedBy",
    "kind",
    "requestScope",
    "status",
    "idempotencyKey",
    "requestFingerprint",
  ])
    if (typeof record[key] !== "string") throw unavailable();
  if (typeof record.version !== "number") throw unavailable();
  return {
    ...(record as unknown as typeof dataLifecycleRequests.$inferSelect),
    dueAt: persistedDate(record.dueAt),
    processingStartedAt: persistedOptionalDate(record.processingStartedAt),
    completedAt: persistedOptionalDate(record.completedAt),
    cancelledAt: persistedOptionalDate(record.cancelledAt),
    retentionUntil: persistedOptionalDate(record.retentionUntil),
    createdAt: persistedDate(record.createdAt),
    updatedAt: persistedDate(record.updatedAt),
  };
}

function restoreRetentionPolicy(value: unknown): RetentionPolicyProjection {
  if (!value || typeof value !== "object") throw unavailable();
  const record = value as Record<string, unknown>;
  if (
    typeof record.category !== "string" ||
    typeof record.retentionDays !== "number" ||
    typeof record.disposition !== "string" ||
    typeof record.legalHold !== "boolean" ||
    typeof record.policyVersion !== "number" ||
    record.source !== "organization_override"
  )
    throw unavailable();
  return {
    category: privacyCategory(record.category),
    retentionDays: record.retentionDays,
    disposition: privacyDisposition(record.disposition),
    legalHold: record.legalHold,
    policyVersion: record.policyVersion,
    source: "organization_override",
    effectiveAt: persistedDate(record.effectiveAt),
    enforcementStatus: "not_implemented",
  };
}

function assertRequestInput(input: {
  kind: PrivacyRequestKind;
  scope: PrivacyRequestScope;
}): asserts input is CreatePrivacyRequestInput {
  if (
    input.scope === "organization" &&
    !new Set<PrivacyRequestKind>([
      "access",
      "portability",
      "erasure",
      "restriction",
    ]).has(input.kind)
  )
    throw new RepositoryError(
      "constraint_conflict",
      "That privacy request kind is available only for an individual.",
    );
}

function persistedOptionalDate(value: unknown): Date | null {
  return value === null || value === undefined ? null : persistedDate(value);
}

function persistedDate(value: unknown): Date {
  if (value instanceof Date && Number.isFinite(value.valueOf())) return value;
  if (typeof value !== "string") throw unavailable();
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.valueOf())) throw unavailable();
  return parsed;
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function notFound(): RepositoryError {
  return new RepositoryError(
    "resource_not_found",
    "The requested resource is unavailable.",
  );
}

function conflict(expectedVersion: number, currentVersion: number) {
  return new RepositoryError(
    "version_conflict",
    "The resource changed before this request was applied.",
    { expectedVersion, currentVersion },
  );
}

function unavailable(): RepositoryError {
  return new RepositoryError(
    "repository_unavailable",
    "The privacy repository returned an invalid result.",
  );
}
