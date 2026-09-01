import type {
  BoardDto,
  CalendarDto,
  CalendarEventDto,
  AttentionSignalDto,
  InboxItemDto,
  PortfolioDto,
  Session,
  WaitingStateDto,
  WeeklyReviewRecordDto,
  WorkItemEvidenceDto,
  WorkItemHistoryEntryDto,
  WorkItemDto,
  WorkspaceDto,
} from "@founderhq/api-contract";
import {
  calculateResourcePressure,
  changesSinceCheckpoint,
  demoBlueprintInstances,
  demoBlueprintVersions,
  demoBoards,
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
  safeCsvCell,
  unrestrictedDevelopmentEntitlements,
  workspacesForPortfolio,
  type WorkItem,
} from "@founderhq/core";
import {
  privacyDataInventory,
  privacyInventoryVersion,
  privacyPolicyVersion,
} from "@founderhq/db";
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
  const demoTimestamp = "2026-08-24T12:00:00.000Z";
  const itemStore = new Map<string, WorkItemDto>(
    demoItems.map((item) => [item.id, toWorkItemDto(item, demoTimestamp)]),
  );
  const boardStore = new Map<string, BoardDto>(
    demoBoards.map((board, ordering) => [
      board.id,
      {
        id: board.id,
        workspaceId: board.workspaceId,
        name: board.name,
        description: board.description,
        visibility: "private",
        progressMode: "task_completion",
        ordering,
        versionTag: demoTimestamp,
        createdAt: demoTimestamp,
        updatedAt: demoTimestamp,
      },
    ]),
  );
  const calendarStore = new Map<string, CalendarDto>(
    demoWorkspaces.map((workspace) => [
      `calendar-${workspace.id}`,
      {
        id: `calendar-${workspace.id}`,
        workspaceId: workspace.id,
        provider: "trevv",
        name: `${workspace.name} calendar`,
        color: workspace.accent,
        isPrimary: true,
        visibleByDefault: true,
        readOnly: false,
        connectionState: "native",
        syncState: "idle",
        version: 0,
      },
    ]),
  );
  const calendarEventStore = new Map<string, CalendarEventDto>();
  const inboxStore = new Map<string, InboxItemDto>();
  const evidenceStore = new Map<string, WorkItemEvidenceDto[]>();
  const historyStore = new Map<string, WorkItemHistoryEntryDto[]>();
  const attentionStore = new Map<string, AttentionSignalDto>(
    generateAttentionSignals(
      "org-demo",
      demoWorkspaces,
      demoItems,
      demoWaitingStates,
      new Date(demoTimestamp),
      demoDependencies,
    ).map((signal) => [
      signal.id,
      {
        ...signal,
        reasonCode: signal.signalType,
        sourceFingerprint: `fictional-demo:${signal.id}`,
        computedAt: signal.createdAt,
        sourceEvidence: [
          {
            sourceType: signal.entityType,
            sourceId: signal.entityId,
            capturedAt: signal.createdAt,
            summary: signal.reason,
            data: { source: "fictional_demo_fixture" },
          },
        ],
        version: 0,
      },
    ]),
  );
  const waitingStore = new Map<string, WaitingStateDto>(
    demoWaitingStates.map((waiting) => [
      waiting.id,
      { ...waiting, version: 0 },
    ]),
  );
  const idempotencyStore = new Map<string, StoredIdempotency<unknown>>();
  const collaborationUnavailable = async (): Promise<never> => {
    throw demoUnavailable(
      "Persistent Teams and Messages require a live account. The fictional demo keeps its separate, non-persistent collaboration preview.",
    );
  };

  const accessResolver: AccessResolver = {
    mode: "demo",
    async resolve() {
      return { access: demoAccess(), session: demoSession() };
    },
  };

  const dataPlane: DataPlane = {
    mode: "demo",
    async readiness() {
      return { database: "not_applicable" };
    },
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

    async createPortfolio() {
      throw demoUnavailable(
        "Portfolio creation is available only in the persistent live preview.",
      );
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

    async createWorkspace() {
      throw demoUnavailable(
        "Workspace creation is available only in the persistent live preview.",
      );
    },

    async updateWorkspace() {
      throw demoUnavailable(
        "Workspace settings are available only in the persistent live preview.",
      );
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

    listTeamDirectory: collaborationUnavailable,
    getTeam: collaborationUnavailable,
    createTeam: collaborationUnavailable,
    updateTeam: collaborationUnavailable,
    setTeamMember: collaborationUnavailable,
    removeTeamMember: collaborationUnavailable,
    listConversations: collaborationUnavailable,
    getConversation: collaborationUnavailable,
    createConversation: collaborationUnavailable,
    setConversationParticipant: collaborationUnavailable,
    listConversationMessages: collaborationUnavailable,
    sendConversationMessage: collaborationUnavailable,
    updateMessageResponse: collaborationUnavailable,
    addMessageReaction: collaborationUnavailable,
    removeMessageReaction: collaborationUnavailable,
    markConversationRead: collaborationUnavailable,
    listCollaborationEvents: collaborationUnavailable,

    async listBoards(context, workspaceId) {
      requireAccess(context.access, "read", "workspace", {
        organizationId: "org-demo",
        workspaceId,
      });
      return [...boardStore.values()].filter(
        (board) => board.workspaceId === workspaceId,
      );
    },

    async getBoard(context, id) {
      const board = boardStore.get(id);
      if (!board) throw notFound();
      requireAccess(context.access, "read", "board", {
        organizationId: "org-demo",
        workspaceId: board.workspaceId,
      });
      return board;
    },

    async createBoard() {
      throw demoUnavailable(
        "Board creation is available only in the persistent live preview.",
      );
    },

    async getWorkspaceCalendar(context, workspaceId, range) {
      requireAccess(context.access, "read", "workspace", {
        organizationId: "org-demo",
        workspaceId,
      });
      const calendars = [...calendarStore.values()].filter(
        (calendar) => calendar.workspaceId === workspaceId,
      );
      return {
        workspaceId,
        range: {
          from: range.from.toISOString(),
          to: range.to.toISOString(),
        },
        calendars,
        events: [...calendarEventStore.values()].filter(
          (event) =>
            event.workspaceId === workspaceId &&
            event.startAt < range.to.toISOString() &&
            event.endAt > range.from.toISOString(),
        ),
        providerAvailability: [
          {
            provider: "google_calendar",
            label: "Google Calendar",
            state: "not_configured",
            message: "Secure OAuth setup is required before connecting.",
          },
          {
            provider: "microsoft_outlook_calendar",
            label: "Microsoft Outlook",
            state: "not_configured",
            message: "Secure OAuth setup is required before connecting.",
          },
        ],
      };
    },

    async createCalendarEvent(context, workspaceId, input) {
      return withIdempotency(idempotencyStore, context, () => {
        requireAccess(context.access, "create", "workspace", {
          organizationId: "org-demo",
          workspaceId,
        });
        const calendar = calendarStore.get(input.calendarId);
        if (!calendar || calendar.workspaceId !== workspaceId) throw notFound();
        const event: CalendarEventDto = {
          id: context.newId(),
          workspaceId,
          calendarId: calendar.id,
          source: "trevv",
          kind: input.kind,
          title: input.title,
          description: input.description,
          startAt: input.startAt,
          endAt: input.endAt,
          allDay: input.allDay,
          timezone: input.timezone,
          location: input.location,
          ...(input.meetingUrl ? { meetingUrl: input.meetingUrl } : {}),
          attendees: input.attendees,
          ...(input.recurrenceRule
            ? { recurrenceRule: input.recurrenceRule }
            : {}),
          status: "confirmed",
          readOnly: false,
          version: 0,
          createdAt: context.now.toISOString(),
          updatedAt: context.now.toISOString(),
        };
        calendarEventStore.set(event.id, event);
        return event;
      });
    },

    async updateCalendarEvent(context, eventId, expectedVersion, input) {
      return withIdempotency(idempotencyStore, context, () => {
        const existing = calendarEventStore.get(eventId);
        if (!existing) throw notFound();
        requireAccess(context.access, "update", "workspace", {
          organizationId: "org-demo",
          workspaceId: existing.workspaceId,
        });
        if (existing.version !== expectedVersion)
          throw new DataPlaneError(
            "version_conflict",
            "The event has changed.",
          );
        const updated: CalendarEventDto = {
          ...existing,
          ...(input.calendarId !== undefined
            ? { calendarId: input.calendarId }
            : {}),
          ...(input.kind !== undefined ? { kind: input.kind } : {}),
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
          ...(input.startAt !== undefined ? { startAt: input.startAt } : {}),
          ...(input.endAt !== undefined ? { endAt: input.endAt } : {}),
          ...(input.allDay !== undefined ? { allDay: input.allDay } : {}),
          ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
          ...(input.location !== undefined ? { location: input.location } : {}),
          ...(input.meetingUrl !== undefined
            ? { meetingUrl: input.meetingUrl }
            : {}),
          ...(input.attendees !== undefined
            ? { attendees: input.attendees }
            : {}),
          ...(input.recurrenceRule !== undefined
            ? { recurrenceRule: input.recurrenceRule }
            : {}),
          version: existing.version + 1,
          updatedAt: context.now.toISOString(),
        };
        calendarEventStore.set(eventId, updated);
        return updated;
      });
    },

    async deleteCalendarEvent(context, eventId, expectedVersion) {
      return withIdempotency(idempotencyStore, context, () => {
        const existing = calendarEventStore.get(eventId);
        if (!existing) throw notFound();
        requireAccess(context.access, "update", "workspace", {
          organizationId: "org-demo",
          workspaceId: existing.workspaceId,
        });
        if (existing.version !== expectedVersion)
          throw new DataPlaneError(
            "version_conflict",
            "The event has changed.",
          );
        calendarEventStore.delete(eventId);
        return { ...existing, version: existing.version + 1 };
      });
    },

    async listInbox(context) {
      return [...inboxStore.values()].filter(
        (item) => item.userId === context.access.userId,
      );
    },

    async captureInboxItem() {
      throw demoUnavailable(
        "Inbox capture is available only in the persistent live preview.",
      );
    },

    async updateInboxItem() {
      throw demoUnavailable(
        "Inbox updates are available only in the persistent live preview.",
      );
    },

    async convertInboxItem() {
      throw demoUnavailable(
        "Inbox conversion is available only in the persistent live preview.",
      );
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

    async getItem(context, id) {
      const item = itemStore.get(id);
      if (!item) throw notFound();
      requireAccess(context.access, "read", "item", {
        organizationId: "org-demo",
        workspaceId: item.workspaceId,
      });
      return item;
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
          createdAt: context.now.toISOString(),
          updatedAt: context.now.toISOString(),
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
          updatedAt: context.now.toISOString(),
        };
        if (patch.title !== undefined) updated.title = patch.title;
        if (patch.description !== undefined)
          updated.description = patch.description;
        if (patch.status !== undefined) updated.status = patch.status;
        if (patch.priority !== undefined) updated.priority = patch.priority;
        if (patch.dueDate !== undefined) updated.dueDate = patch.dueDate;
        itemStore.set(existing.id, updated);
        return updated;
      });
    },

    async listItemHistory(context, id) {
      const item = itemStore.get(id);
      if (!item) throw notFound();
      requireAccess(context.access, "read", "item", {
        organizationId: "org-demo",
        workspaceId: item.workspaceId,
      });
      return historyStore.get(id) ?? [];
    },

    async listItemEvidence(context, id) {
      const item = itemStore.get(id);
      if (!item) throw notFound();
      requireAccess(context.access, "read", "item", {
        organizationId: "org-demo",
        workspaceId: item.workspaceId,
      });
      return evidenceStore.get(id) ?? [];
    },

    async addItemEvidence(context, id, expectedVersion, input) {
      return withIdempotency(idempotencyStore, context, () => {
        const item = requireDemoItem(itemStore, context.access, id);
        if (item.version !== expectedVersion)
          throw versionConflict(item.version);
        const now = context.now.toISOString();
        const evidence: WorkItemEvidenceDto = {
          id: context.newId(),
          itemId: id,
          author: { id: context.access.userId, name: "Mohammed Zaman" },
          body: input.body,
          evidence: true,
          createdAt: now,
          updatedAt: now,
        };
        const version = item.version + 1;
        itemStore.set(id, { ...item, version, updatedAt: now });
        evidenceStore.set(id, [...(evidenceStore.get(id) ?? []), evidence]);
        appendDemoHistory(historyStore, id, {
          id: context.newId(),
          type: "evidence.added",
          reasonCode: "evidence_added",
          summary: "Evidence was added to the item.",
          actor: evidence.author,
          evidence: [{ id: evidence.id, body: evidence.body }],
          itemVersion: version,
          occurredAt: now,
          metadata: {},
        });
        return { evidence, itemVersion: version };
      });
    },

    async assignItem(context, id, expectedVersion, input) {
      return withIdempotency(idempotencyStore, context, () => {
        const item = requireDemoItem(itemStore, context.access, id);
        if (item.version !== expectedVersion)
          throw versionConflict(item.version);
        const assignees = input.assigneeIds.map(demoUserForId);
        if (assignees.some((assignee) => !assignee)) throw notFound();
        const now = context.now.toISOString();
        const updated: WorkItemDto = {
          ...item,
          assignees: assignees.filter(
            (assignee): assignee is { id: string; name: string } =>
              Boolean(assignee),
          ),
          version: item.version + 1,
          updatedAt: now,
        };
        itemStore.set(id, updated);
        return { item: updated, attentionRefreshQueued: false };
      });
    },

    async setItemBlocked(context, id, expectedVersion, input) {
      return withIdempotency(idempotencyStore, context, () => {
        const item = requireDemoItem(itemStore, context.access, id);
        if (item.version !== expectedVersion)
          throw versionConflict(item.version);
        const now = context.now.toISOString();
        const updated: WorkItemDto = {
          ...item,
          status: input.blocked ? "blocked" : "working",
          version: item.version + 1,
          updatedAt: now,
        };
        itemStore.set(id, updated);
        appendDemoHistory(historyStore, id, {
          id: context.newId(),
          type: input.blocked ? "item.blocked" : "item.unblocked",
          reasonCode: input.blocked ? "blocked" : "unblocked",
          summary: input.reason,
          actor: { id: context.access.userId, name: "Mohammed Zaman" },
          itemVersion: updated.version,
          occurredAt: now,
          metadata: {},
        });
        return { item: updated, attentionRefreshQueued: false };
      });
    },

    async transitionDecision(context, id, expectedVersion, input) {
      return transitionDemoItem(
        itemStore,
        evidenceStore,
        historyStore,
        idempotencyStore,
        context,
        id,
        expectedVersion,
        "decision",
        input.state,
        input.rationale,
        input.evidence,
      );
    },

    async transitionApproval(context, id, expectedVersion, input) {
      return transitionDemoItem(
        itemStore,
        evidenceStore,
        historyStore,
        idempotencyStore,
        context,
        id,
        expectedVersion,
        "approval",
        input.state,
        input.rationale,
        input.evidence,
      );
    },

    async resolveItem(context, id, expectedVersion, input) {
      return transitionDemoItem(
        itemStore,
        evidenceStore,
        historyStore,
        idempotencyStore,
        context,
        id,
        expectedVersion,
        "resolve",
        "done",
        "Item resolved with evidence.",
        input.evidence,
      );
    },

    async createWaiting(context, expectedItemVersion, input) {
      return withIdempotency(idempotencyStore, context, () => {
        const workspace = workspaceForId(input.workspaceId);
        if (!workspace) throw notFound();
        requireAccess(context.access, "create", "item", {
          organizationId: "org-demo",
          workspaceId: input.workspaceId,
        });
        const item = itemStore.get(input.entityId);
        if (!item || item.version !== expectedItemVersion)
          throw item ? versionConflict(item.version) : notFound();
        const owner = demoUserForId(input.followUpOwnerId);
        if (!owner) throw notFound();
        const waiting: WaitingStateDto = {
          id: context.newId(),
          organizationId: "org-demo",
          portfolioId: workspace.portfolioId,
          workspaceId: input.workspaceId,
          entityType: input.entityType,
          entityId: input.entityId,
          title: input.title,
          waitingType: input.waitingType,
          ...(input.waitingReferenceId
            ? { waitingReferenceId: input.waitingReferenceId }
            : {}),
          ...(input.waitingLabel ? { waitingLabel: input.waitingLabel } : {}),
          waitingSince: context.now.toISOString().slice(0, 10),
          ...(input.expectedBy ? { expectedBy: input.expectedBy } : {}),
          followUpOwnerId: owner.id,
          followUpOwnerName: owner.name,
          ...(input.nextFollowUp ? { nextFollowUp: input.nextFollowUp } : {}),
          ...(input.note ? { waitingNote: input.note } : {}),
          version: 0,
        };
        itemStore.set(item.id, {
          ...item,
          version: item.version + 1,
          updatedAt: context.now.toISOString(),
        });
        waitingStore.set(waiting.id, waiting);
        return waiting;
      });
    },

    async listWeeklyReviews(context, workspaceId) {
      if (workspaceId)
        requireAccess(context.access, "read", "workspace", {
          organizationId: "org-demo",
          workspaceId,
        });
      return [] satisfies WeeklyReviewRecordDto[];
    },

    async listSnapshots(context, filters) {
      return demoWorkspaceSnapshots.filter(
        (snapshot) =>
          snapshot.organizationId === context.access.organizationId &&
          (!filters.portfolioId ||
            snapshot.portfolioId === filters.portfolioId) &&
          (!filters.workspaceId ||
            snapshot.workspaceId === filters.workspaceId) &&
          context.access.accessibleWorkspaceIds.has(snapshot.workspaceId),
      );
    },

    async getOperationsStatus() {
      return { pendingOutbox: 0, failedCount: 0 };
    },

    async getPrivacyProgram() {
      return {
        inventoryVersion: privacyInventoryVersion,
        policyVersion: privacyPolicyVersion,
        legalDocuments: {
          privacyNotice: {
            version: privacyPolicyVersion,
            reviewStatus: "pending",
          },
          terms: { version: privacyPolicyVersion, reviewStatus: "pending" },
        },
        externalProviders: {
          enabled: false,
          configured: [],
          revocationAutomation: "unavailable",
        },
        requestsAreReviewedBeforeEffects: true,
        inventory: privacyDataInventory.map((entry) => ({
          ...entry,
          examples: [...entry.examples],
        })),
        retention: privacyDataInventory.map((entry) => ({
          category: entry.category,
          retentionDays: entry.defaultRetentionDays,
          disposition: entry.defaultDisposition,
          legalHold: false,
          policyVersion: 1,
          source: "default",
          effectiveAt: "2026-08-29T00:00:00.000Z",
          enforcementStatus: "not_implemented",
        })),
      };
    },

    async listPrivacyRequests() {
      return [];
    },

    async createPrivacyRequest() {
      throw demoUnavailable(
        "Privacy requests are unavailable in the fictional-data preview because it stores no user data durably.",
      );
    },

    async cancelPrivacyRequest() {
      throw demoUnavailable(
        "Privacy requests are unavailable in the fictional-data preview.",
      );
    },

    async updateRetentionPolicy() {
      throw demoUnavailable(
        "Retention settings are unavailable in the fictional-data preview.",
      );
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
            safeCsvCell(item.title),
            item.type,
            item.status,
            item.priority,
            item.dueDate ?? "",
            safeCsvCell(
              item.assignees.map((assignee) => assignee.name).join("; "),
            ),
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
    organization: {
      id: "org-demo",
      name: "TREVV Demo",
      slug: "trevv-demo",
      role: "owner",
      timezone: "Europe/Berlin",
    },
    availableOrganizations: [
      {
        id: "org-demo",
        name: "TREVV Demo",
        slug: "trevv-demo",
        role: "owner",
      },
    ],
    managedWorkspaceIds: demoWorkspaces.map((workspace) => workspace.id),
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

function toWorkItemDto(item: WorkItem, timestamp: string): WorkItemDto {
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
    description: "",
    assignees: assignee ? [assignee] : [],
    version: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
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
    description: workspace.healthNote,
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
    versionTag: `${workspace.latestUpdate.date}T12:00:00.000Z`,
    updatedAt: `${workspace.latestUpdate.date}T12:00:00.000Z`,
  };
}

function requireDemoItem(
  store: Map<string, WorkItemDto>,
  access: AccessContext,
  id: string,
): WorkItemDto {
  const item = store.get(id);
  if (!item) throw notFound();
  requireAccess(access, "update", "item", {
    organizationId: "org-demo",
    workspaceId: item.workspaceId,
  });
  return item;
}

function appendDemoHistory(
  store: Map<string, WorkItemHistoryEntryDto[]>,
  itemId: string,
  entry: WorkItemHistoryEntryDto,
) {
  store.set(itemId, [...(store.get(itemId) ?? []), entry]);
}

function transitionDemoItem(
  itemStore: Map<string, WorkItemDto>,
  evidenceStore: Map<string, WorkItemEvidenceDto[]>,
  historyStore: Map<string, WorkItemHistoryEntryDto[]>,
  idempotencyStore: Map<string, StoredIdempotency<unknown>>,
  context: ApiMutationContext,
  id: string,
  expectedVersion: number,
  kind: "decision" | "approval" | "resolve",
  state: string,
  rationale: string,
  evidenceBody?: string,
) {
  return withIdempotency(idempotencyStore, context, () => {
    const item = requireDemoItem(itemStore, context.access, id);
    if (item.version !== expectedVersion) throw versionConflict(item.version);
    if (kind !== "resolve" && item.type !== kind) throw notFound();
    const now = context.now.toISOString();
    const updated: WorkItemDto = {
      ...item,
      ...(kind === "decision"
        ? { decisionState: state as WorkItemDto["decisionState"] }
        : {}),
      ...(kind === "approval"
        ? { approvalState: state as WorkItemDto["approvalState"] }
        : {}),
      ...(kind === "resolve" ? { status: "done" as const } : {}),
      version: item.version + 1,
      updatedAt: now,
    };
    const evidence = evidenceBody
      ? {
          id: context.newId(),
          itemId: id,
          author: { id: context.access.userId, name: "Mohammed Zaman" },
          body: evidenceBody,
          evidence: true as const,
          createdAt: now,
          updatedAt: now,
        }
      : undefined;
    itemStore.set(id, updated);
    if (evidence)
      evidenceStore.set(id, [...(evidenceStore.get(id) ?? []), evidence]);
    appendDemoHistory(historyStore, id, {
      id: context.newId(),
      type: `item.${kind}`,
      reasonCode: `${kind}_${state}`,
      summary: rationale,
      actor: { id: context.access.userId, name: "Mohammed Zaman" },
      ...(evidence
        ? { evidence: [{ id: evidence.id, body: evidence.body }] }
        : {}),
      itemVersion: updated.version,
      occurredAt: now,
      metadata: { state },
    });
    return {
      item: updated,
      ...(evidence ? { evidence } : {}),
      attentionRefreshQueued: false,
    };
  });
}

function demoUnavailable(message: string): DataPlaneError {
  return new DataPlaneError("capability_unavailable", message);
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
