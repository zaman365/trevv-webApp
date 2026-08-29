import type {
  AttentionSignalDto,
  PortfolioDto,
  PortfolioResponse,
  WaitingStateDto,
  WorkItemDto,
  WorkspaceDto,
} from "@founderhq/api-contract";
import type {
  OrganizationScopedRepositories,
  PostgresRepositories,
  WaitingProjection,
  WorkItemProjection,
  WorkspaceProjection,
} from "@founderhq/db";
import { createOrganizationScope } from "@founderhq/db";
import { requireAccess, type AccessContext } from "@founderhq/permissions";
import {
  DataPlaneError,
  type AccessResolver,
  type ApiMutationContext,
  type ApiRequestContext,
  type DataPlane,
} from "./data-plane.js";

export interface LiveIdentity {
  userId: string;
  expiresAt: Date;
}

export interface PostgresAdapterOptions {
  repositories: PostgresRepositories;
  resolveIdentity(request: Request): Promise<LiveIdentity | null>;
}

export function createPostgresAdapter(options: PostgresAdapterOptions): {
  dataPlane: DataPlane;
  accessResolver: AccessResolver;
} {
  const accessResolver: AccessResolver = {
    mode: "live",
    async resolve(request, resolvedRequestId) {
      const identity = await options.resolveIdentity(request);
      if (!identity) return null;
      const organizationId = request.headers.get("x-organization-id")?.trim();
      if (!organizationId)
        throw new DataPlaneError(
          "organization_context_required",
          "Choose an organization before accessing live data.",
        );
      const requestId =
        resolvedRequestId ??
        request.headers.get("x-request-id") ??
        crypto.randomUUID();
      const resolved = await options.repositories
        .forOrganization(
          createOrganizationScope({
            organizationId,
            userId: identity.userId,
            requestId,
          }),
        )
        .session.resolve();
      const access: AccessContext = {
        userId: resolved.user.id,
        organizationId: resolved.organization.id,
        role: resolved.membership.role,
        accessiblePortfolioIds: new Set(resolved.portfolioIds),
        managedPortfolioIds: new Set(resolved.managedPortfolioIds),
        accessibleWorkspaceIds: new Set(resolved.workspaceIds),
        managedWorkspaceIds: new Set(resolved.managedWorkspaceIds),
      };
      return {
        access,
        session: {
          user: {
            id: resolved.user.id,
            email: resolved.user.email,
            name: resolved.user.name,
            role: resolved.membership.role,
            locale: locale(resolved.user.locale),
          },
          organizationId: resolved.organization.id,
          expiresAt: identity.expiresAt.toISOString(),
        },
      };
    },
  };

  const dataPlane: DataPlane = {
    mode: "live",

    async listPortfolios(context) {
      const repositories = scoped(options.repositories, context);
      const portfolios = await repositories.portfolios.list();
      return portfolios
        .filter(
          (portfolio) =>
            isOrganizationManager(context.access) ||
            canSeePortfolio(context.access, portfolio.id),
        )
        .map(toPortfolioDto);
    },

    async getPortfolio(context, requestedPortfolioId) {
      const repositories = scoped(options.repositories, context);
      const portfolio = requestedPortfolioId
        ? await repositories.portfolios.getRollup(requestedPortfolioId)
        : await getDefaultPortfolioRollup(repositories, context.access);
      const visibleWorkspaces = portfolio.workspaces.filter((workspace) =>
        canSeeWorkspace(context.access, workspace.id),
      );
      if (
        !visibleWorkspaces.length &&
        !isOrganizationManager(context.access) &&
        !canSeePortfolio(context.access, portfolio.portfolio.id)
      )
        throw notFound();
      const visibleWorkspaceIds = new Set(
        visibleWorkspaces.map((workspace) => workspace.id),
      );
      const items = portfolio.items.filter((item) =>
        visibleWorkspaceIds.has(item.workspaceId),
      );
      return buildPortfolioResponse(
        portfolio.portfolio,
        visibleWorkspaces,
        items,
        context.now,
      );
    },

    async listAttention(context, filters) {
      if (filters.workspaceId)
        requireWorkspaceAccess(context.access, "read", filters.workspaceId);
      const rows = await scoped(
        options.repositories,
        context,
      ).attention.listActive({
        ...(filters.portfolioId ? { portfolioId: filters.portfolioId } : {}),
        ...(filters.workspaceId ? { workspaceId: filters.workspaceId } : {}),
        now: context.now,
      });
      return rows
        .filter((row) =>
          row.workspaceId
            ? canSeeWorkspace(context.access, row.workspaceId)
            : isOrganizationManager(context.access) ||
              canSeePortfolio(context.access, row.portfolioId),
        )
        .map(toAttentionDto);
    },

    async actOnAttention(context, id, expectedVersion, input) {
      const repositories = scoped(options.repositories, context);
      const current = await repositories.attention.get(id);
      requireScopedResourceAccess(
        context.access,
        "update",
        current.workspaceId,
      );
      const result = await repositories.attention.act(
        id,
        expectedVersion,
        {
          action: input.action,
          ...(input.reason ? { reason: input.reason } : {}),
          ...(input.snoozedUntil
            ? { snoozedUntil: new Date(input.snoozedUntil) }
            : {}),
        },
        mutation(context),
      );
      return { value: toAttentionDto(result.value), replayed: result.replayed };
    },

    async listWaiting(context) {
      return (await scoped(options.repositories, context).waiting.listActive())
        .filter((waiting) =>
          canSeeWorkspace(context.access, waiting.workspaceId),
        )
        .map(toWaitingDto);
    },

    async actOnWaiting(context, id, expectedVersion, input) {
      const repositories = scoped(options.repositories, context);
      const current = await repositories.waiting.get(id);
      requireWorkspaceAccess(context.access, "update", current.workspaceId);
      const result = await repositories.waiting.act(
        id,
        expectedVersion,
        {
          action: input.action,
          ...(input.note ? { note: input.note } : {}),
          ...(input.nextFollowUp ? { nextFollowUp: input.nextFollowUp } : {}),
        },
        mutation(context),
      );
      return { value: toWaitingDto(result.value), replayed: result.replayed };
    },

    async getChangeRadar(context) {
      const radar = await scoped(
        options.repositories,
        context,
      ).management.getChangeRadar();
      return {
        checkpoint: radar.checkpoint,
        changes: radar.changes.filter((change) =>
          canSeeWorkspace(context.access, change.workspaceId),
        ),
      };
    },

    async getManagementMemory(context) {
      const repositories = scoped(options.repositories, context);
      const memory = await repositories.management.getMemory();
      const accessibleItems = await listAccessibleItems(
        repositories,
        context.access,
      );
      const accessibleItemIds = new Set(accessibleItems.map(({ id }) => id));
      return {
        workspaceSnapshots: memory.workspaceSnapshots
          .filter((row) => canSeeWorkspace(context.access, row.workspaceId))
          .map((row) => ({
            id: row.id,
            organizationId: row.organizationId,
            portfolioId: row.portfolioId,
            workspaceId: row.workspaceId,
            capturedAt: row.capturedAt.toISOString(),
            health: row.health,
            ...(row.progress === null ? {} : { progress: row.progress }),
            openCount: row.openCount,
            overdueCount: row.overdueCount,
            blockedCount: row.blockedCount,
            decisionCount: row.decisionCount,
            attentionCount: row.attentionCount,
            ...(row.nextMilestoneId
              ? { nextMilestoneId: row.nextMilestoneId }
              : {}),
            ...(row.nextMilestoneStatus
              ? { nextMilestoneStatus: row.nextMilestoneStatus }
              : {}),
            ...(row.latestUpdateAt
              ? { latestUpdateAt: row.latestUpdateAt.toISOString() }
              : {}),
            source: reviewSource(row.source),
          })),
        reviewRituals: memory.reviewRituals
          .filter((row) =>
            row.workspaceId
              ? canSeeWorkspace(context.access, row.workspaceId)
              : isOrganizationManager(context.access) ||
                canSeePortfolio(context.access, row.portfolioId),
          )
          .map((row) => ({
            id: row.id,
            organizationId: row.organizationId,
            portfolioId: row.portfolioId,
            ...(row.workspaceId ? { workspaceId: row.workspaceId } : {}),
            type: reviewType(row.type),
            cadence: row.cadence,
            enabled: row.enabled,
            ...(row.nextDueAt
              ? { nextDueAt: row.nextDueAt.toISOString() }
              : {}),
            reminderEnabled: row.reminderEnabled,
          })),
        decisionOutcomes: memory.decisionOutcomes
          .filter((row) => accessibleItemIds.has(row.decisionItemId))
          .map((row) => ({
            id: row.id,
            organizationId: row.organizationId,
            portfolioId: row.portfolioId,
            decisionItemId: row.decisionItemId,
            outcome: decisionOutcome(row.outcome),
            learning: row.learning,
            ...(row.wouldRepeat === null
              ? {}
              : { wouldRepeat: row.wouldRepeat }),
            recordedBy: row.recordedBy,
            recordedAt: row.recordedAt.toISOString(),
          })),
      };
    },

    async submitWeeklyReview(context, input) {
      requireWorkspaceAccess(context.access, "update", input.workspaceId);
      const result = await scoped(
        options.repositories,
        context,
      ).management.submitWeeklyReview(
        {
          workspaceId: input.workspaceId,
          health: input.health,
          progressSummary: input.progress,
          blocker: input.blocker,
          nextMilestone: input.nextMilestone,
          ...(input.decisionNeeded
            ? { decisionNeeded: input.decisionNeeded }
            : {}),
          priorityNextWeek: input.priorityNextWeek,
        },
        mutation(context),
      );
      return {
        replayed: result.replayed,
        value: {
          update: {
            id: result.value.update.id,
            workspaceId: result.value.update.workspaceId,
            health: input.health,
            progress: result.value.update.wins,
            blocker: result.value.update.blocker,
            nextMilestone: result.value.update.nextMilestone,
            ...(result.value.update.helpNeeded
              ? { decisionNeeded: result.value.update.helpNeeded }
              : {}),
            priorityNextWeek: result.value.update.currentPriority,
            publishedAt: result.value.update.publishedAt.toISOString(),
          },
          snapshot: {
            id: result.value.snapshot.id,
            organizationId: result.value.snapshot.organizationId,
            portfolioId: result.value.snapshot.portfolioId,
            workspaceId: result.value.snapshot.workspaceId,
            capturedAt: result.value.snapshot.capturedAt.toISOString(),
            health: result.value.snapshot.health,
            source: "weekly_review",
          },
          attentionRefreshQueued: true,
        },
      };
    },

    listInsights: unsupported(
      "Live Insights repositories are outside Phase 1.",
    ),
    listBlueprints: unsupported(
      "Live Blueprint repositories are outside Phase 1.",
    ),
    getTeamPressure: unsupported(
      "Live resource-pressure projection is outside Phase 1.",
    ),
    getEntitlements: unsupported("Billing is outside Phase 1."),
    previewImport: unsupported("Live imports are outside Phase 1."),

    async listWorkspaces(context) {
      return (await scoped(options.repositories, context).workspaces.list())
        .filter((workspace) => canSeeWorkspace(context.access, workspace.id))
        .map(toWorkspaceDto);
    },

    async getWorkspace(context, slug) {
      const repositories = scoped(options.repositories, context);
      const workspace = await repositories.workspaces.getBySlug(slug);
      requireWorkspaceAccess(context.access, "read", workspace.id);
      const items = await listAllWorkspaceItems(repositories, workspace.id);
      return {
        workspace: toWorkspaceDto(workspace),
        rollup: rollupWorkspace(workspace, items, context.now),
        items: items.map(toWorkItemDto),
      };
    },

    async listItems(context, filters) {
      if (filters.workspaceId)
        requireWorkspaceAccess(context.access, "read", filters.workspaceId);
      const repositories = scoped(options.repositories, context);
      const workspaceIds = filters.workspaceId
        ? [filters.workspaceId]
        : [...context.access.accessibleWorkspaceIds].sort();
      const page = await paginateWorkItems(
        repositories,
        workspaceIds,
        filters.limit,
        filters.cursor,
        filters.assigneeId,
      );
      return {
        data: page.items.map(toWorkItemDto),
        nextCursor: page.nextCursor,
      };
    },

    async createItem(context, input) {
      requireWorkspaceAccess(context.access, "create", input.workspaceId);
      const result = await scoped(
        options.repositories,
        context,
      ).workItems.create(
        {
          workspaceId: input.workspaceId,
          boardId: input.boardId,
          title: input.title,
          type: input.type,
          priority: input.priority,
          status: input.status,
          assigneeIds: input.assigneeIds,
          ...(input.dueDate ? { dueDate: input.dueDate } : {}),
          ...(input.approvalState
            ? { approvalState: input.approvalState }
            : {}),
          ...(input.decisionState
            ? { decisionState: input.decisionState }
            : {}),
        },
        mutation(context),
      );
      return { value: toWorkItemDto(result.value), replayed: result.replayed };
    },

    async updateItem(context, id, expectedVersion, patch) {
      const repositories = scoped(options.repositories, context);
      const current = await repositories.workItems.get(id);
      requireWorkspaceAccess(context.access, "update", current.workspaceId);
      const result = await repositories.workItems.update(
        id,
        expectedVersion,
        {
          ...(patch.title !== undefined ? { title: patch.title } : {}),
          ...(patch.status !== undefined ? { status: patch.status } : {}),
          ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
          ...(patch.dueDate !== undefined ? { dueDate: patch.dueDate } : {}),
          ...(patch.assigneeIds !== undefined
            ? { assigneeIds: patch.assigneeIds }
            : {}),
        },
        mutation(context),
      );
      return { value: toWorkItemDto(result.value), replayed: result.replayed };
    },

    async search(context, query) {
      const result = await scoped(options.repositories, context).search(query);
      return {
        workspaces: result.workspaces
          .filter((workspace) => canSeeWorkspace(context.access, workspace.id))
          .map(toWorkspaceDto),
        items: result.items
          .filter((item) => canSeeWorkspace(context.access, item.workspaceId))
          .map(toWorkItemDto),
      };
    },

    exportOrganization: unsupported(
      "Live organization exports require the Phase 5 export-audit policy.",
    ),
    exportBoardCsv: unsupported(
      "Live Board exports require the Phase 5 export-audit policy.",
    ),
  };

  return { dataPlane, accessResolver };
}

function scoped(
  repositories: PostgresRepositories,
  context: ApiRequestContext,
): OrganizationScopedRepositories {
  return repositories.forOrganization(
    createOrganizationScope({
      organizationId: context.access.organizationId,
      userId: context.access.userId,
      requestId: context.requestId,
    }),
  );
}

function mutation(context: ApiMutationContext) {
  return {
    method: context.method,
    route: context.route,
    requestFingerprint: context.requestFingerprint,
    responseStatus: context.responseStatus,
    now: context.now,
    ...(context.idempotencyKey
      ? { idempotencyKey: context.idempotencyKey }
      : {}),
  };
}

async function getDefaultPortfolioRollup(
  repositories: OrganizationScopedRepositories,
  access: AccessContext,
) {
  const portfolios = await repositories.portfolios.list();
  const accessiblePortfolios = portfolios.filter(
    (portfolio) =>
      isOrganizationManager(access) || canSeePortfolio(access, portfolio.id),
  );
  const portfolio =
    accessiblePortfolios.find((candidate) => candidate.isDefault) ??
    accessiblePortfolios[0];
  if (!portfolio) throw notFound();
  return repositories.portfolios.getRollup(portfolio.id);
}

function buildPortfolioResponse(
  portfolio: Awaited<
    ReturnType<OrganizationScopedRepositories["portfolios"]["get"]>
  >,
  workspaces: WorkspaceProjection[],
  items: WorkItemProjection[],
  now: Date,
): PortfolioResponse {
  return {
    asOf: now.toISOString(),
    portfolio: toPortfolioDto(portfolio),
    signals: portfolioSignals(workspaces, items, now),
    workspaces: workspaces
      .map((workspace) => ({
        workspace: toWorkspaceDto(workspace),
        rollup: rollupWorkspace(workspace, items, now),
      }))
      .sort((left, right) => right.rollup.score - left.rollup.score),
  };
}

function toPortfolioDto(
  portfolio: Awaited<
    ReturnType<OrganizationScopedRepositories["portfolios"]["get"]>
  >,
): PortfolioDto {
  return {
    id: portfolio.id,
    organizationId: portfolio.organizationId,
    name: portfolio.name,
    slug: portfolio.slug,
    description: portfolio.description,
    isDefault: portfolio.isDefault,
  };
}

function toWorkspaceDto(workspace: WorkspaceProjection): WorkspaceDto {
  return {
    id: workspace.id,
    portfolioId: workspace.portfolioId,
    slug: workspace.slug,
    name: workspace.name,
    icon: workspace.icon,
    accent: workspace.accent,
    type: workspace.type,
    stage: workspace.stage,
    health: workspace.health,
    healthNote: workspace.healthNote,
    priority: workspace.priority,
    ...(workspace.lead
      ? {
          lead: {
            name: workspace.lead.name,
            initials: workspace.lead.initials,
            color: workspace.accent,
          },
        }
      : {}),
    ...(workspace.nextMilestone.title && workspace.nextMilestone.date
      ? {
          nextMilestone: {
            title: workspace.nextMilestone.title,
            date: workspace.nextMilestone.date,
          },
        }
      : {}),
    ...(workspace.latestUpdate
      ? {
          latestUpdate: {
            text: workspace.latestUpdate.text,
            date: workspace.latestUpdate.date.slice(0, 10),
          },
        }
      : {}),
    metrics: workspace.metrics
      .filter((metric) => metric.value !== null)
      .slice(0, 12)
      .map((metric) => ({
        label: metric.label,
        value: formatMetric(metric.value!, metric.target, metric.unit),
      })),
  };
}

function toWorkItemDto(item: WorkItemProjection): WorkItemDto {
  return {
    id: item.id,
    workspaceId: item.workspaceId,
    boardId: item.boardId,
    title: item.title,
    type: item.type,
    priority: item.priority,
    status: item.status,
    ...(item.dueDate ? { dueDate: item.dueDate } : {}),
    assignees: item.assignees,
    ...(item.approvalState
      ? { approvalState: approvalState(item.approvalState) }
      : {}),
    ...(item.decisionState
      ? { decisionState: decisionState(item.decisionState) }
      : {}),
    version: item.version,
  };
}

function toAttentionDto(
  row: Awaited<ReturnType<OrganizationScopedRepositories["attention"]["get"]>>,
): AttentionSignalDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    portfolioId: row.portfolioId,
    ...(row.workspaceId ? { workspaceId: row.workspaceId } : {}),
    entityType: row.entityType,
    entityId: row.entityId,
    signalType: row.signalType,
    severity: row.severity,
    impact: row.impact,
    urgency: row.urgency,
    responsibility: row.responsibility,
    reason: row.reason,
    ...(row.recommendedAction
      ? { recommendedAction: row.recommendedAction }
      : {}),
    createdAt: row.createdAt.toISOString(),
    ...(row.resolvedAt ? { resolvedAt: row.resolvedAt.toISOString() } : {}),
    ...(row.dismissedAt ? { dismissedAt: row.dismissedAt.toISOString() } : {}),
    ...(row.snoozedUntil
      ? { snoozedUntil: row.snoozedUntil.toISOString() }
      : {}),
    ...(row.actionReason ? { actionReason: row.actionReason } : {}),
    metadata: isRecord(row.metadata) ? row.metadata : {},
    version: row.version,
  };
}

function toWaitingDto(waiting: WaitingProjection): WaitingStateDto {
  return {
    id: waiting.id,
    organizationId: waiting.organizationId,
    portfolioId: waiting.portfolioId,
    workspaceId: waiting.workspaceId,
    entityType: waitingEntityType(waiting.entityType),
    entityId: waiting.entityId,
    title: waiting.title,
    waitingType: waitingType(waiting.waitingType),
    ...(waiting.waitingReferenceId
      ? { waitingReferenceId: waiting.waitingReferenceId }
      : {}),
    ...(waiting.waitingLabel ? { waitingLabel: waiting.waitingLabel } : {}),
    waitingSince: waiting.waitingSince,
    ...(waiting.expectedBy ? { expectedBy: waiting.expectedBy } : {}),
    followUpOwnerId: waiting.followUpOwnerId,
    followUpOwnerName: waiting.followUpOwnerName,
    ...(waiting.nextFollowUp ? { nextFollowUp: waiting.nextFollowUp } : {}),
    ...(waiting.waitingNote ? { waitingNote: waiting.waitingNote } : {}),
    ...(waiting.resolvedAt ? { resolvedAt: waiting.resolvedAt } : {}),
    version: waiting.version,
  };
}

function rollupWorkspace(
  workspace: WorkspaceProjection,
  allItems: WorkItemProjection[],
  now: Date,
) {
  const items = allItems.filter(
    (item) => item.workspaceId === workspace.id && item.status !== "done",
  );
  const overdue = items.filter(
    (item) => item.dueDate && new Date(item.dueDate).getTime() < now.getTime(),
  ).length;
  const blocked = items.filter((item) => item.status === "blocked").length;
  const decisions = items.filter(
    (item) => item.type === "decision" && item.decisionState !== "decided",
  ).length;
  const approvals = items.filter(
    (item) => item.type === "approval" && item.approvalState === "pending",
  ).length;
  const healthWeight = {
    critical: 40,
    watch: 22,
    on_track: 4,
    parked: 0,
  } as const;
  return {
    open: items.length,
    overdue,
    blocked,
    decisions,
    approvals,
    score:
      healthWeight[workspace.health] +
      overdue * 6 +
      blocked * 8 +
      decisions * 5 +
      approvals * 4,
  };
}

function portfolioSignals(
  workspaces: WorkspaceProjection[],
  items: WorkItemProjection[],
  now: Date,
) {
  const open = items.filter((item) => item.status !== "done");
  return {
    decisions: open.filter(
      (item) => item.type === "decision" && item.decisionState !== "decided",
    ).length,
    approvals: open.filter(
      (item) => item.type === "approval" && item.approvalState === "pending",
    ).length,
    blocked: open.filter((item) => item.status === "blocked").length,
    overdueMilestones: open.filter(
      (item) =>
        item.type === "milestone" &&
        item.dueDate &&
        new Date(item.dueDate).getTime() < now.getTime(),
    ).length,
    staleUpdates: workspaces.filter(
      (workspace) =>
        !workspace.latestUpdate ||
        now.getTime() - new Date(workspace.latestUpdate.date).getTime() >
          7 * 86_400_000,
    ).length,
    unassignedUrgent: open.filter(
      (item) =>
        item.assignees.length === 0 &&
        (item.priority === "urgent" || item.priority === "high"),
    ).length,
  };
}

function canSeeWorkspace(access: AccessContext, workspaceId: string): boolean {
  return access.accessibleWorkspaceIds.has(workspaceId);
}

function canSeePortfolio(access: AccessContext, portfolioId: string): boolean {
  return access.accessiblePortfolioIds.has(portfolioId);
}

function requireWorkspaceAccess(
  access: AccessContext,
  action: "read" | "create" | "update",
  workspaceId: string,
): void {
  requireAccess(access, action, "workspace", {
    organizationId: access.organizationId,
    workspaceId,
    explicitlyShared: true,
  });
}

function requireScopedResourceAccess(
  access: AccessContext,
  action: "update",
  workspaceId: string | null,
): void {
  requireAccess(access, action, "item", {
    organizationId: access.organizationId,
    ...(workspaceId ? { workspaceId, explicitlyShared: true } : {}),
  });
}

function isOrganizationManager(access: AccessContext): boolean {
  return access.role === "owner" || access.role === "admin";
}

function formatMetric(
  value: number,
  target: number | null,
  unit: string,
): string {
  const measured = target === null ? String(value) : `${value}/${target}`;
  return unit
    ? `${measured}${unit.startsWith("%") ? "" : " "}${unit}`
    : measured;
}

function locale(value: string): "en" | "de" {
  if (value === "en" || value === "de") return value;
  throw new DataPlaneError(
    "repository_unavailable",
    "A persisted user locale is invalid.",
  );
}

function approvalState(
  value: string,
): NonNullable<WorkItemDto["approvalState"]> {
  if (
    value === "pending" ||
    value === "changes_requested" ||
    value === "approved" ||
    value === "rejected"
  )
    return value;
  throw new DataPlaneError(
    "repository_unavailable",
    "A persisted approval state is invalid.",
  );
}

function decisionState(
  value: string,
): NonNullable<WorkItemDto["decisionState"]> {
  if (
    value === "needed" ||
    value === "analyzing" ||
    value === "delegated" ||
    value === "deferred" ||
    value === "decided"
  )
    return value;
  throw new DataPlaneError(
    "repository_unavailable",
    "A persisted decision state is invalid.",
  );
}

interface WorkItemCursor {
  workspaceIndex: number;
  offset: number;
}

async function paginateWorkItems(
  repositories: OrganizationScopedRepositories,
  workspaceIds: string[],
  limit: number,
  cursor?: string,
  assigneeId?: string,
): Promise<{ items: WorkItemProjection[]; nextCursor: string | null }> {
  const initial = decodeCursor(cursor);
  let workspaceIndex = initial.workspaceIndex;
  let offset = initial.offset;
  const items: WorkItemProjection[] = [];
  while (workspaceIndex < workspaceIds.length && items.length < limit) {
    const workspaceId = workspaceIds[workspaceIndex];
    if (!workspaceId) break;
    const remaining = limit - items.length;
    const batch = await repositories.workItems.list({
      workspaceId,
      ...(assigneeId ? { assigneeId } : {}),
      limit: remaining,
      offset,
    });
    items.push(...batch);
    if (batch.length === remaining)
      return {
        items,
        nextCursor: encodeCursor({
          workspaceIndex,
          offset: offset + batch.length,
        }),
      };
    workspaceIndex += 1;
    offset = 0;
  }
  return { items, nextCursor: null };
}

async function listAccessibleItems(
  repositories: OrganizationScopedRepositories,
  access: AccessContext,
): Promise<WorkItemProjection[]> {
  const result: WorkItemProjection[] = [];
  for (const workspaceId of access.accessibleWorkspaceIds)
    result.push(...(await listAllWorkspaceItems(repositories, workspaceId)));
  return result;
}

async function listAllWorkspaceItems(
  repositories: OrganizationScopedRepositories,
  workspaceId: string,
): Promise<WorkItemProjection[]> {
  const result: WorkItemProjection[] = [];
  let offset = 0;
  while (true) {
    const batch = await repositories.workItems.list({
      workspaceId,
      limit: 100,
      offset,
    });
    result.push(...batch);
    if (batch.length < 100) return result;
    offset += batch.length;
  }
}

function decodeCursor(cursor?: string): WorkItemCursor {
  if (!cursor) return { workspaceIndex: 0, offset: 0 };
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    );
    if (
      isRecord(parsed) &&
      Number.isSafeInteger(parsed.workspaceIndex) &&
      Number(parsed.workspaceIndex) >= 0 &&
      Number.isSafeInteger(parsed.offset) &&
      Number(parsed.offset) >= 0
    )
      return {
        workspaceIndex: Number(parsed.workspaceIndex),
        offset: Number(parsed.offset),
      };
  } catch {
    // Invalid cursors are treated as the first page and never enter SQL.
  }
  return { workspaceIndex: 0, offset: 0 };
}

function encodeCursor(cursor: WorkItemCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function unsupported(message: string) {
  return async (): Promise<never> => {
    throw unavailable(message);
  };
}

function unavailable(message: string): DataPlaneError {
  return new DataPlaneError("capability_unavailable", message);
}

function notFound(): DataPlaneError {
  return new DataPlaneError(
    "resource_not_found",
    "The requested resource is unavailable.",
  );
}

function waitingEntityType(value: string): WaitingStateDto["entityType"] {
  if (value === "work_item" || value === "decision" || value === "approval")
    return value;
  throw new DataPlaneError(
    "repository_unavailable",
    "A persisted Waiting entity type is invalid.",
  );
}

function waitingType(value: string): WaitingStateDto["waitingType"] {
  const values: WaitingStateDto["waitingType"][] = [
    "person",
    "team",
    "external_partner",
    "client",
    "vendor",
    "decision",
    "document",
    "dependency",
    "other",
  ];
  const matched = values.find((candidate) => candidate === value);
  if (matched) return matched;
  throw new DataPlaneError(
    "repository_unavailable",
    "A persisted Waiting type is invalid.",
  );
}

function reviewSource(value: string) {
  if (
    value === "weekly_review" ||
    value === "monthly_review" ||
    value === "manual"
  )
    return value;
  throw invalidManagementValue("snapshot source");
}

function reviewType(value: string) {
  if (
    value === "daily_focus" ||
    value === "weekly_workspace" ||
    value === "monthly_portfolio"
  )
    return value;
  throw invalidManagementValue("review type");
}

function decisionOutcome(value: string) {
  if (
    value === "better_than_expected" ||
    value === "as_expected" ||
    value === "worse_than_expected" ||
    value === "too_early"
  )
    return value;
  throw invalidManagementValue("decision outcome");
}

function invalidManagementValue(field: string): DataPlaneError {
  return new DataPlaneError(
    "repository_unavailable",
    `A persisted ${field} is invalid.`,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
