import type {
  AttentionSignalDto,
  PortfolioDto,
  Session,
  WaitingStateDto,
  WorkItemDto,
  WorkspaceDto,
} from "@founderhq/api-contract";
import {
  calculateResourcePressure,
  changesSinceCheckpoint,
  demoBlueprintInstances,
  demoBlueprintVersions,
  demoChangeCheckpoint,
  demoDecisionOutcomes,
  demoDependencies,
  demoInsights,
  demoItems,
  demoMeaningfulChanges,
  demoPortfolios,
  demoReviewRituals,
  demoWaitingStates,
  demoWorkspaceSnapshots,
  demoWorkspaces,
  generateAttentionSignals,
  portfolioSignals,
  previewBlueprintUpdate,
  rollupWorkspace,
  unrestrictedDevelopmentEntitlements,
  workspacesForPortfolio,
  type WorkItem,
} from "@founderhq/core";
import { requireAccess, type AccessContext } from "@founderhq/permissions";
import {
  DataPlaneError,
  type AccessResolver,
  type ApiMutationContext,
  type DataPlane,
  type ImportPreviewInput,
  type MutationResult,
} from "./data-plane.js";

interface StoredIdempotency<T> {
  method: string;
  route: string;
  fingerprint: string;
  responseStatus: number;
  value: T;
  expiresAt: number;
}

export interface DemoAdapter {
  dataPlane: DataPlane;
  accessResolver: AccessResolver;
}

export function createDemoAdapter(): DemoAdapter {
  const itemStore = new Map<string, WorkItemDto>(
    demoItems.map((item) => [item.id, toWorkItemDto(item)]),
  );
  const attentionStore = new Map<string, AttentionSignalDto>(
    generateAttentionSignals(
      "org-demo",
      demoWorkspaces,
      demoItems,
      demoWaitingStates,
      new Date("2026-08-24T12:00:00.000Z"),
      demoDependencies,
    ).map((signal) => [signal.id, { ...signal, version: 0 }]),
  );
  const waitingStore = new Map<string, WaitingStateDto>(
    demoWaitingStates.map((waiting) => [
      waiting.id,
      { ...waiting, version: 0 },
    ]),
  );
  const idempotencyStore = new Map<string, StoredIdempotency<unknown>>();

  const accessResolver: AccessResolver = {
    mode: "demo",
    async resolve() {
      return { access: demoAccess(), session: demoSession() };
    },
  };

  const dataPlane: DataPlane = {
    mode: "demo",
    async listPortfolios(context) {
      requireAccess(context.access, "read", "portfolio", {
        organizationId: "org-demo",
      });
      const accessiblePortfolioIds = new Set(
        demoWorkspaces
          .filter((workspace) =>
            context.access.accessibleWorkspaceIds.has(workspace.id),
          )
          .map((workspace) => workspace.portfolioId),
      );
      return demoPortfolios.filter((portfolio) =>
        accessiblePortfolioIds.has(portfolio.id),
      ) as PortfolioDto[];
    },

    async getPortfolio(context, requestedPortfolioId) {
      requireAccess(context.access, "read", "portfolio", {
        organizationId: "org-demo",
      });
      const portfolioId = requestedPortfolioId ?? "portfolio-demo";
      const portfolio = demoPortfolios.find(
        (candidate) => candidate.id === portfolioId,
      );
      if (!portfolio) throw notFound();
      const workspaces = workspacesForPortfolio(portfolio.id).filter(
        (workspace) => context.access.accessibleWorkspaceIds.has(workspace.id),
      );
      const workspaceIds = new Set(workspaces.map((workspace) => workspace.id));
      const items = currentItems(itemStore).filter((item) =>
        workspaceIds.has(item.workspaceId),
      );
      return {
        asOf: context.now.toISOString(),
        portfolio,
        signals: portfolioSignals(workspaces, items, context.now),
        workspaces: workspaces
          .map((workspace) => ({
            workspace: toWorkspaceDto(workspace),
            rollup: rollupWorkspace(workspace, items, context.now),
          }))
          .sort((left, right) => right.rollup.score - left.rollup.score),
      };
    },

    async listAttention(context, filters) {
      requireAccess(context.access, "read", "portfolio", {
        organizationId: "org-demo",
      });
      if (filters.workspaceId) {
        const workspace = workspaceForId(filters.workspaceId);
        if (!workspace) throw notFound();
        requireAccess(context.access, "read", "workspace", {
          organizationId: "org-demo",
          workspaceId: workspace.id,
        });
        if (
          filters.portfolioId &&
          workspace.portfolioId !== filters.portfolioId
        )
          throw notFound();
      }
      return [...attentionStore.values()]
        .filter(
          (signal) =>
            !filters.portfolioId || signal.portfolioId === filters.portfolioId,
        )
        .filter(
          (signal) =>
            !filters.workspaceId || signal.workspaceId === filters.workspaceId,
        )
        .filter(
          (signal) =>
            !signal.workspaceId ||
            context.access.accessibleWorkspaceIds.has(signal.workspaceId),
        )
        .filter((signal) => !signal.resolvedAt && !signal.dismissedAt)
        .filter(
          (signal) =>
            !signal.snoozedUntil ||
            new Date(signal.snoozedUntil).getTime() <= context.now.getTime(),
        )
        .sort((left, right) => {
          const weight = { info: 1, low: 2, medium: 3, high: 4, critical: 5 };
          return weight[right.severity] - weight[left.severity];
        });
    },

    async actOnAttention(context, id, expectedVersion, input) {
      return withIdempotency(idempotencyStore, context, () => {
        const signal = attentionStore.get(id);
        if (!signal) throw notFound();
        requireAccess(context.access, "update", "item", {
          organizationId: signal.organizationId,
          ...(signal.workspaceId ? { workspaceId: signal.workspaceId } : {}),
        });
        if (signal.version !== expectedVersion)
          throw versionConflict(signal.version);
        const changedAt = context.now.toISOString();
        const updated: AttentionSignalDto = {
          ...signal,
          ...(input.action === "resolve" ? { resolvedAt: changedAt } : {}),
          ...(input.action === "dismiss" ? { dismissedAt: changedAt } : {}),
          ...(input.action === "snooze" && input.snoozedUntil
            ? { snoozedUntil: input.snoozedUntil }
            : {}),
          ...(input.reason ? { actionReason: input.reason } : {}),
          version: signal.version + 1,
        };
        attentionStore.set(updated.id, updated);
        return updated;
      });
    },

    async listWaiting(context) {
      return [...waitingStore.values()].filter(
        (waiting) =>
          waiting.organizationId === context.access.organizationId &&
          !waiting.resolvedAt &&
          context.access.accessibleWorkspaceIds.has(waiting.workspaceId),
      );
    },

    async actOnWaiting(context, id, expectedVersion, input) {
      return withIdempotency(idempotencyStore, context, () => {
        const waiting = waitingStore.get(id);
        if (!waiting) throw notFound();
        requireAccess(context.access, "update", "item", {
          organizationId: waiting.organizationId,
          workspaceId: waiting.workspaceId,
        });
        if (waiting.version !== expectedVersion)
          throw versionConflict(waiting.version);
        const updated: WaitingStateDto = {
          ...waiting,
          ...(input.action === "resolve"
            ? { resolvedAt: context.now.toISOString() }
            : {}),
          ...(input.nextFollowUp ? { nextFollowUp: input.nextFollowUp } : {}),
          ...(input.note ? { waitingNote: input.note } : {}),
          version: waiting.version + 1,
        };
        waitingStore.set(updated.id, updated);
        return updated;
      });
    },

    async getChangeRadar(context) {
      requireAccess(context.access, "read", "portfolio", {
        organizationId: "org-demo",
      });
      return {
        checkpoint: demoChangeCheckpoint,
        changes: changesSinceCheckpoint(
          demoMeaningfulChanges,
          demoChangeCheckpoint,
        ),
      };
    },

    async getManagementMemory(context) {
      requireAccess(context.access, "read", "portfolio", {
        organizationId: "org-demo",
      });
      return {
        workspaceSnapshots: demoWorkspaceSnapshots,
        reviewRituals: demoReviewRituals,
        decisionOutcomes: demoDecisionOutcomes,
      };
    },

    async submitWeeklyReview(context, input) {
      return withIdempotency(idempotencyStore, context, () => {
        const workspace = workspaceForId(input.workspaceId);
        if (!workspace) throw notFound();
        requireAccess(context.access, "update", "workspace", {
          organizationId: "org-demo",
          workspaceId: input.workspaceId,
        });
        return {
          update: {
            id: context.newId(),
            ...input,
            publishedAt: context.now.toISOString(),
          },
          snapshot: {
            id: context.newId(),
            organizationId: "org-demo",
            portfolioId: workspace.portfolioId,
            workspaceId: workspace.id,
            capturedAt: context.now.toISOString(),
            health: input.health,
            source: "weekly_review" as const,
          },
          attentionRefreshQueued: false,
        };
      });
    },

    async listInsights(context) {
      return demoInsights.filter(
        (insight) =>
          insight.organizationId === context.access.organizationId &&
          (!insight.workspaceId ||
            context.access.accessibleWorkspaceIds.has(insight.workspaceId)),
      );
    },

    async listBlueprints(context) {
      requireAccess(context.access, "read", "portfolio", {
        organizationId: "org-demo",
      });
      const instance = demoBlueprintInstances[0];
      const current = demoBlueprintVersions[0];
      const next = demoBlueprintVersions[1];
      return {
        instances: demoBlueprintInstances,
        versions: demoBlueprintVersions,
        preview:
          instance && current && next
            ? previewBlueprintUpdate(instance, current, next)
            : null,
      };
    },

    async getTeamPressure(context) {
      requireAccess(context.access, "read", "portfolio", {
        organizationId: "org-demo",
      });
      return calculateResourcePressure(
        demoWorkspaces,
        currentItems(itemStore),
        context.now,
      );
    },

    async getEntitlements(context) {
      requireAccess(context.access, "read", "settings", {
        organizationId: "org-demo",
      });
      return unrestrictedDevelopmentEntitlements;
    },

    async previewImport(context, input) {
      requireAccess(context.access, "update", "settings", {
        organizationId: "org-demo",
      });
      return previewImport(input);
    },

    async listWorkspaces(context) {
      return demoWorkspaces
        .filter((workspace) =>
          context.access.accessibleWorkspaceIds.has(workspace.id),
        )
        .map(toWorkspaceDto);
    },

    async getWorkspace(context, slug) {
      const workspace = demoWorkspaces.find(
        (candidate) => candidate.slug === slug,
      );
      if (!workspace) throw notFound();
      requireAccess(context.access, "read", "workspace", {
        organizationId: "org-demo",
        workspaceId: workspace.id,
      });
      const items = [...itemStore.values()].filter(
        (item) => item.workspaceId === workspace.id,
      );
      const rollupItems = currentItems(itemStore).filter(
        (item) => item.workspaceId === workspace.id,
      );
      return {
        workspace: toWorkspaceDto(workspace),
        rollup: rollupWorkspace(workspace, rollupItems, context.now),
        items,
      };
    },

    async listItems(context, filters) {
      let items = [...itemStore.values()].filter((item) =>
        context.access.accessibleWorkspaceIds.has(item.workspaceId),
      );
      if (filters.workspaceId)
        items = items.filter(
          (item) => item.workspaceId === filters.workspaceId,
        );
      if (filters.assigneeId)
        items = items.filter((item) =>
          item.assignees.some((assignee) => assignee.id === filters.assigneeId),
        );
      const offset = filters.cursor
        ? Number.parseInt(
            Buffer.from(filters.cursor, "base64url").toString("utf8"),
            10,
          ) || 0
        : 0;
      const data = items.slice(offset, offset + filters.limit);
      const nextOffset = offset + data.length;
      return {
        data,
        nextCursor:
          nextOffset < items.length
            ? Buffer.from(String(nextOffset)).toString("base64url")
            : null,
      };
    },

    async createItem(context, input) {
      return withIdempotency(idempotencyStore, context, () => {
        requireAccess(context.access, "create", "item", {
          organizationId: "org-demo",
          workspaceId: input.workspaceId,
        });
        const workspace = workspaceForId(input.workspaceId);
        const boardWorkspaceId = demoItems.find(
          (item) => item.boardId === input.boardId,
        )?.workspaceId;
        if (!workspace || boardWorkspaceId !== workspace.id) throw notFound();
        const assignees = input.assigneeIds.map(demoUserForId);
        if (assignees.some((assignee) => !assignee)) throw notFound();
        const { assigneeIds: _assigneeIds, ...itemInput } = input;
        const item: WorkItemDto = {
          id: context.newId(),
          ...itemInput,
          assignees: assignees.filter(
            (assignee): assignee is { id: string; name: string } =>
              Boolean(assignee),
          ),
          version: 0,
        };
        itemStore.set(item.id, item);
        return item;
      });
    },

    async updateItem(context, id, expectedVersion, patch) {
      return withIdempotency(idempotencyStore, context, () => {
        const existing = itemStore.get(id);
        if (!existing) throw notFound();
        requireAccess(context.access, "update", "item", {
          organizationId: "org-demo",
          workspaceId: existing.workspaceId,
        });
        if (existing.version !== expectedVersion)
          throw versionConflict(existing.version);
        const { assigneeIds } = patch;
        const assignees = assigneeIds?.map(demoUserForId);
        if (assignees?.some((assignee) => !assignee)) throw notFound();
        const updated: WorkItemDto = {
          ...existing,
          ...(assignees
            ? {
                assignees: assignees.filter(
                  (assignee): assignee is { id: string; name: string } =>
                    Boolean(assignee),
                ),
              }
            : {}),
          version: existing.version + 1,
        };
        if (patch.title !== undefined) updated.title = patch.title;
        if (patch.status !== undefined) updated.status = patch.status;
        if (patch.priority !== undefined) updated.priority = patch.priority;
        if (patch.dueDate !== undefined) updated.dueDate = patch.dueDate;
        itemStore.set(existing.id, updated);
        return updated;
      });
    },

    async search(context, query) {
      const normalized = query.toLocaleLowerCase();
      const workspaces = demoWorkspaces
        .filter(
          (workspace) =>
            context.access.accessibleWorkspaceIds.has(workspace.id) &&
            `${workspace.name} ${workspace.priority} ${workspace.healthNote}`
              .toLocaleLowerCase()
              .includes(normalized),
        )
        .map(toWorkspaceDto);
      const items = [...itemStore.values()].filter(
        (item) =>
          context.access.accessibleWorkspaceIds.has(item.workspaceId) &&
          item.title.toLocaleLowerCase().includes(normalized),
      );
      return { workspaces, items: items.slice(0, 50) };
    },

    async exportOrganization(context) {
      requireAccess(context.access, "export", "settings", {
        organizationId: "org-demo",
      });
      const items = [...itemStore.values()];
      return {
        exportedAt: context.now.toISOString(),
        organization: { id: "org-demo", name: "TREVV Demo" },
        portfolios: demoPortfolios,
        workspaces: demoWorkspaces.map(toWorkspaceDto),
        boards: [...new Set(items.map((item) => item.boardId))].map(
          (boardId) => ({
            id: boardId,
            workspaceId: items.find((item) => item.boardId === boardId)
              ?.workspaceId,
          }),
        ),
        items,
        milestones: items.filter((item) => item.type === "milestone"),
        ideas: items.filter((item) => item.type === "idea"),
        decisions: items.filter((item) => item.type === "decision"),
        decisionOutcomes: demoDecisionOutcomes,
        approvals: items.filter((item) => item.type === "approval"),
        updates: demoWorkspaces.map((workspace) => ({
          workspaceId: workspace.id,
          text: workspace.latestUpdate.text,
          date: workspace.latestUpdate.date,
        })),
        insights: demoInsights,
        snapshots: demoWorkspaceSnapshots,
        waiting: [...waitingStore.values()],
        attention: [...attentionStore.values()],
        dependencies: demoDependencies,
        commentMetadata: [],
        smartLinks: [],
      };
    },

    async exportBoardCsv(context, boardId) {
      const items = [...itemStore.values()].filter(
        (item) => item.boardId === boardId,
      );
      const first = items[0];
      if (!first) throw notFound();
      requireAccess(context.access, "read", "board", {
        organizationId: "org-demo",
        workspaceId: first.workspaceId,
      });
      return [
        "id,title,type,status,priority,due_date,assignee,version",
        ...items.map((item) =>
          [
            item.id,
            quote(item.title),
            item.type,
            item.status,
            item.priority,
            item.dueDate ?? "",
            quote(item.assignees.map((assignee) => assignee.name).join("; ")),
            item.version,
          ].join(","),
        ),
      ].join("\n");
    },
  };

  return { dataPlane, accessResolver };
}

function demoAccess(): AccessContext {
  return {
    userId: "user-owner",
    organizationId: "org-demo",
    role: "owner",
    accessiblePortfolioIds: new Set(["portfolio-demo"]),
    managedPortfolioIds: new Set(["portfolio-demo"]),
    accessibleWorkspaceIds: new Set(
      demoWorkspaces.map((workspace) => workspace.id),
    ),
    managedWorkspaceIds: new Set(
      demoWorkspaces.map((workspace) => workspace.id),
    ),
  };
}

function demoSession(): Session {
  return {
    user: {
      id: "user-owner",
      email: "owner@trevv.local",
      name: "Mohammed Zaman",
      role: "owner",
      locale: "en",
    },
    organizationId: "org-demo",
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  };
}

function currentItems(itemStore: Map<string, WorkItemDto>): WorkItem[] {
  return [...itemStore.values()].map((item) => ({
    id: item.id,
    workspaceId: item.workspaceId,
    boardId: item.boardId,
    title: item.title,
    type: item.type,
    priority: item.priority,
    status: item.status,
    ...(item.dueDate ? { dueDate: item.dueDate } : {}),
    ...(item.assignees[0] ? { assignee: item.assignees[0].name } : {}),
    ...(item.approvalState ? { approvalState: item.approvalState } : {}),
    ...(item.decisionState ? { decisionState: item.decisionState } : {}),
  }));
}

const demoUsers = (
  [
    ["Mohammed Zaman", "user-owner"],
    ["Amira Demir", "user-admin"],
    ["Nora Klein", "user-lead"],
    ["Tim Bauer", "user-member"],
    ["Elias Hart", "user-demo-elias-hart"],
    ["Jana Roth", "user-demo-jana-roth"],
    ["Sofia Marin", "user-demo-sofia-marin"],
  ] satisfies Array<[string, string]>
).map(([name, id]) => ({ id, name }));

function demoUserForId(id: string) {
  return demoUsers.find((user) => user.id === id);
}

function toWorkItemDto(item: WorkItem): WorkItemDto {
  const {
    assignee: assigneeName,
    groupId: _groupId,
    ...itemWithoutAssignee
  } = item;
  const assignee = assigneeName
    ? demoUsers.find((user) => user.name === assigneeName)
    : undefined;
  return {
    ...itemWithoutAssignee,
    assignees: assignee ? [assignee] : [],
    version: 0,
  };
}

function workspaceForId(id: string) {
  return demoWorkspaces.find((workspace) => workspace.id === id);
}

function toWorkspaceDto(
  workspace: (typeof demoWorkspaces)[number],
): WorkspaceDto {
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
    lead: workspace.lead,
    nextMilestone: workspace.nextMilestone,
    latestUpdate: workspace.latestUpdate,
    metrics: workspace.metrics.map(({ label, value }) => ({ label, value })),
  };
}

function previewImport(input: ImportPreviewInput) {
  const unsupportedFields = input.headers.filter((header) =>
    /time track|formula|mirror/i.test(header),
  );
  return {
    preset: input.preset,
    rowsDetected: input.rowCount,
    rowsReady: input.rowCount,
    warnings: unsupportedFields.length
      ? ["Unsupported values will be preserved in the import report."]
      : [],
    unsupportedFields,
    mapping: Object.fromEntries(
      input.headers.map((header) => [header, header.toLocaleLowerCase()]),
    ),
    dryRun: true,
  };
}

function withIdempotency<T>(
  store: Map<string, StoredIdempotency<unknown>>,
  context: ApiMutationContext,
  mutate: () => T,
): MutationResult<T> {
  const key = context.idempotencyKey
    ? `${context.access.organizationId}:${context.access.userId}:${context.idempotencyKey}`
    : undefined;
  if (key) {
    const existing = store.get(key) as StoredIdempotency<T> | undefined;
    if (existing && existing.expiresAt > context.now.getTime()) {
      if (
        existing.method !== context.method ||
        existing.route !== context.route ||
        existing.fingerprint !== context.requestFingerprint ||
        existing.responseStatus !== context.responseStatus
      )
        throw new DataPlaneError(
          "idempotency_key_reused",
          "This idempotency key was already used for a different request.",
        );
      return { value: structuredClone(existing.value), replayed: true };
    }
  }
  const value = mutate();
  if (key)
    store.set(key, {
      method: context.method,
      route: context.route,
      fingerprint: context.requestFingerprint,
      responseStatus: context.responseStatus,
      value: structuredClone(value),
      expiresAt: context.now.getTime() + 86_400_000,
    });
  return { value };
}

function notFound(): DataPlaneError {
  return new DataPlaneError(
    "resource_not_found",
    "The requested resource is unavailable.",
  );
}

function versionConflict(currentVersion: number): DataPlaneError {
  return new DataPlaneError(
    "version_conflict",
    "This resource changed elsewhere. Refresh and retry.",
    { currentVersion },
  );
}

function quote(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
