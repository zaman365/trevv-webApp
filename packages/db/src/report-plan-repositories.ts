import { and, desc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import {
  RepositoryError,
  withIdempotency,
  type MutationContext,
  type TenantScope,
  type TrevvDatabase,
} from "./repositories.js";
import {
  auditLogs,
  memberReportPlans,
  memberships,
  portfolios,
  users,
  workspaces,
} from "./schema.js";

type Row = typeof memberReportPlans.$inferSelect;
export type MemberReportPlanRecord = Row & { authorName: string };
export type SaveMemberReportPlanInput = Pick<
  Row,
  | "kind"
  | "title"
  | "period"
  | "periodStart"
  | "periodEnd"
  | "context"
  | "health"
  | "state"
  | "content"
>;
export interface MemberReportPlanFilters {
  kind?: Row["kind"] | undefined;
  authorId?: string | undefined;
  state?: Row["state"] | undefined;
  attention?: "true" | undefined;
  from?: string | undefined;
  to?: string | undefined;
  page: number;
}
export type ReportPlanRepositories = ReturnType<
  typeof createReportPlanRepositories
>;

/** Draft visibility is enforced here, including for organization administrators. */
export function createReportPlanRepositories(
  database: TrevvDatabase,
  scope: TenantScope,
  transact: <T>(
    operation: (transaction: TrevvDatabase) => Promise<T>,
  ) => Promise<T>,
) {
  const visible = () =>
    and(
      eq(memberReportPlans.organizationId, scope.organizationId),
      isNull(memberReportPlans.deletedAt),
      or(
        eq(memberReportPlans.authorId, scope.userId),
        and(
          eq(memberReportPlans.state, "published"),
          isNull(memberReportPlans.archivedAt),
        ),
      ),
    );
  const get = async (
    id: string,
    db = database,
  ): Promise<MemberReportPlanRecord> => {
    const [result] = await db
      .select({ record: memberReportPlans, authorName: users.name })
      .from(memberReportPlans)
      .innerJoin(users, eq(users.id, memberReportPlans.authorId))
      .innerJoin(workspaces, eq(workspaces.id, memberReportPlans.workspaceId))
      .innerJoin(portfolios, eq(portfolios.id, workspaces.portfolioId))
      .where(
        and(
          visible(),
          eq(memberReportPlans.id, id),
          isNull(workspaces.archivedAt),
          isNull(workspaces.deletedAt),
          isNull(portfolios.archivedAt),
          isNull(portfolios.deletedAt),
        ),
      )
      .limit(1);
    if (!result) throw missing();
    return { ...result.record, authorName: result.authorName };
  };
  const audit = async (
    db: TrevvDatabase,
    record: Row,
    action: string,
    now: Date,
  ) => {
    // Operational metadata only: personal report text stays in the scoped record.
    await db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      organizationId: scope.organizationId,
      actorId: scope.userId,
      action,
      targetType: "member_report_plan",
      targetId: record.id,
      payload: {
        workspaceId: record.workspaceId,
        kind: record.kind,
        state: record.state,
        version: record.version,
        requestId: scope.requestId,
      },
      createdAt: now,
    });
  };
  const assertWriter = async (db: TrevvDatabase, workspaceId: string) => {
    const [row] = await db
      .select({ role: memberships.role })
      .from(memberships)
      .innerJoin(
        workspaces,
        and(
          eq(workspaces.organizationId, memberships.organizationId),
          eq(workspaces.id, workspaceId),
        ),
      )
      .innerJoin(portfolios, eq(portfolios.id, workspaces.portfolioId))
      .where(
        and(
          eq(memberships.organizationId, scope.organizationId),
          eq(memberships.userId, scope.userId),
          isNull(memberships.archivedAt),
          isNull(memberships.deletedAt),
          isNull(workspaces.archivedAt),
          isNull(workspaces.deletedAt),
          isNull(portfolios.archivedAt),
          isNull(portfolios.deletedAt),
        ),
      )
      .limit(1);
    if (!row || row.role === "guest" || row.role === "viewer") throw missing();
  };
  return {
    get,
    async list(workspaceId: string, filters: MemberReportPlanFilters) {
      const [workspace] = await database
        .select({ id: workspaces.id })
        .from(workspaces)
        .innerJoin(portfolios, eq(portfolios.id, workspaces.portfolioId))
        .where(
          and(
            eq(workspaces.organizationId, scope.organizationId),
            eq(workspaces.id, workspaceId),
            isNull(workspaces.archivedAt),
            isNull(workspaces.deletedAt),
            isNull(portfolios.archivedAt),
            isNull(portfolios.deletedAt),
          ),
        )
        .limit(1);
      if (!workspace) throw missing();
      const rows = await database
        .select({ record: memberReportPlans, authorName: users.name })
        .from(memberReportPlans)
        .innerJoin(users, eq(users.id, memberReportPlans.authorId))
        .where(
          and(
            visible(),
            eq(memberReportPlans.workspaceId, workspaceId),
            isNull(memberReportPlans.archivedAt),
            filters.kind ? eq(memberReportPlans.kind, filters.kind) : undefined,
            filters.authorId
              ? eq(memberReportPlans.authorId, filters.authorId)
              : undefined,
            filters.state
              ? eq(memberReportPlans.state, filters.state)
              : undefined,
            filters.from
              ? gte(memberReportPlans.periodEnd, filters.from)
              : undefined,
            filters.to
              ? lte(memberReportPlans.periodStart, filters.to)
              : undefined,
            filters.attention
              ? or(
                  eq(memberReportPlans.health, "blocked"),
                  eq(memberReportPlans.health, "at_risk"),
                  sql`length(trim(${memberReportPlans.content}->>'supportNeeded')) > 0`,
                  sql`length(trim(${memberReportPlans.content}->>'blockers')) > 0`,
                )
              : undefined,
          ),
        )
        .orderBy(
          desc(memberReportPlans.periodStart),
          desc(memberReportPlans.createdAt),
          desc(memberReportPlans.id),
        )
        .limit(25)
        .offset((filters.page - 1) * 24);
      return {
        data: rows
          .slice(0, 24)
          .map((row) => ({ ...row.record, authorName: row.authorName })),
        page: filters.page,
        hasMore: rows.length > 24,
      };
    },
    create(
      workspaceId: string,
      input: SaveMemberReportPlanInput,
      context: MutationContext,
    ) {
      return transact(async (db) => {
        await assertWriter(db, workspaceId);
        return withIdempotency(
          db,
          scope,
          context,
          { workspaceId, ...input },
          async () => {
            const now = context.now ?? new Date();
            const id = crypto.randomUUID();
            await db.insert(memberReportPlans).values({
              ...input,
              id,
              organizationId: scope.organizationId,
              workspaceId,
              authorId: scope.userId,
              publishedAt: input.state === "published" ? now : null,
              createdAt: now,
              updatedAt: now,
            });
            const record = await get(id, db);
            await audit(db, record, "member_report_plan.created", now);
            return record;
          },
          restore,
        );
      });
    },
    update(
      id: string,
      expectedVersion: number,
      input: SaveMemberReportPlanInput,
      context: MutationContext,
    ) {
      return transact(async (db) =>
        withIdempotency(
          db,
          scope,
          context,
          { id, expectedVersion, ...input },
          async () => {
            const current = await get(id, db);
            if (current.authorId !== scope.userId || current.archivedAt)
              throw missing();
            await assertWriter(db, current.workspaceId);
            if (
              input.kind !== current.kind ||
              (current.state === "published" && input.state !== "published")
            ) {
              throw new RepositoryError(
                "constraint_conflict",
                "Published updates stay shared. Create a new draft for a different update.",
              );
            }
            const now = context.now ?? new Date();
            const rows = await db
              .update(memberReportPlans)
              .set({
                ...input,
                version: expectedVersion + 1,
                publishedAt:
                  current.publishedAt ??
                  (input.state === "published" ? now : null),
                updatedAt: now,
              })
              .where(
                and(
                  eq(memberReportPlans.id, id),
                  eq(memberReportPlans.organizationId, scope.organizationId),
                  eq(memberReportPlans.authorId, scope.userId),
                  eq(memberReportPlans.version, expectedVersion),
                  isNull(memberReportPlans.archivedAt),
                ),
              )
              .returning();
            if (!rows.length) throw conflict();
            const record = await get(id, db);
            await audit(db, record, "member_report_plan.updated", now);
            return record;
          },
          restore,
        ),
      );
    },
    archive(id: string, expectedVersion: number, context: MutationContext) {
      return transact(async (db) =>
        withIdempotency(
          db,
          scope,
          context,
          { id, expectedVersion, action: "archive" },
          async () => {
            const current = await get(id, db);
            if (current.authorId !== scope.userId || current.archivedAt)
              throw missing();
            await assertWriter(db, current.workspaceId);
            const now = context.now ?? new Date();
            const rows = await db
              .update(memberReportPlans)
              .set({
                archivedAt: now,
                updatedAt: now,
                version: expectedVersion + 1,
              })
              .where(
                and(
                  eq(memberReportPlans.id, id),
                  eq(memberReportPlans.organizationId, scope.organizationId),
                  eq(memberReportPlans.authorId, scope.userId),
                  eq(memberReportPlans.version, expectedVersion),
                  isNull(memberReportPlans.archivedAt),
                ),
              )
              .returning();
            if (!rows.length) throw conflict();
            const record = await get(id, db);
            await audit(db, record, "member_report_plan.archived", now);
            return record;
          },
          restore,
        ),
      );
    },
  };
}

function missing() {
  return new RepositoryError(
    "resource_not_found",
    "This report or plan is not available.",
  );
}
function conflict() {
  return new RepositoryError(
    "version_conflict",
    "This update has changed. Reload it before saving again.",
  );
}
function restore(value: unknown): MemberReportPlanRecord {
  const record = value as MemberReportPlanRecord;
  return {
    ...record,
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
    publishedAt: record.publishedAt ? new Date(record.publishedAt) : null,
    archivedAt: record.archivedAt ? new Date(record.archivedAt) : null,
    deletedAt: record.deletedAt ? new Date(record.deletedAt) : null,
  };
}
