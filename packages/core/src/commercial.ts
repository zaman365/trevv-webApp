export type ProgressMode =
  | "none"
  | "manual"
  | "task_completion"
  | "weighted_work_items"
  | "milestone_completion";

export interface Portfolio {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description: string;
  isDefault: boolean;
}

export type EntitlementKey =
  | "portfolios.max"
  | "hubs.max"
  | "members.max"
  | "guests.max"
  | "storage.bytes"
  | "automations.monthly"
  | "ai.actions"
  | "integration.github"
  | "integration.drive"
  | "integration.figma";

export type EntitlementValue = number | boolean | "unlimited";

export interface EntitlementSet {
  planKey: string;
  values: Readonly<Partial<Record<EntitlementKey, EntitlementValue>>>;
}

export interface EntitlementResult {
  allowed: boolean;
  key: EntitlementKey;
  currentUsage: number;
  limit: EntitlementValue;
  reason?: string;
}

export function checkEntitlement(
  entitlements: EntitlementSet,
  key: EntitlementKey,
  currentUsage = 0,
  requested = 1,
): EntitlementResult {
  const limit = entitlements.values[key] ?? false;
  const allowed =
    limit === true ||
    limit === "unlimited" ||
    (typeof limit === "number" && currentUsage + requested <= limit);
  return {
    allowed,
    key,
    currentUsage,
    limit,
    ...(!allowed
      ? { reason: `This workspace has reached its ${key} entitlement.` }
      : {}),
  };
}

export const unrestrictedDevelopmentEntitlements: EntitlementSet = {
  planKey: "development-unrestricted",
  values: {
    "portfolios.max": "unlimited",
    "hubs.max": "unlimited",
    "members.max": "unlimited",
    "guests.max": "unlimited",
    "storage.bytes": "unlimited",
    "automations.monthly": "unlimited",
    "ai.actions": "unlimited",
    "integration.github": true,
    "integration.drive": true,
    "integration.figma": true,
  },
};

export type AttentionSeverity = "info" | "low" | "medium" | "high" | "critical";
export type AttentionState = "active" | "resolved" | "dismissed" | "snoozed";
export type AttentionSignalType =
  | "overdue_high_priority_work"
  | "overdue_milestone"
  | "blocked_work"
  | "many_blockers"
  | "progress_stalled"
  | "deadline_progress_risk"
  | "dependency_threat"
  | "missing_owner"
  | "missing_hub_lead"
  | "resource_pressure"
  | "missing_update"
  | "stale_update"
  | "health_evidence_mismatch"
  | "reported_blocker"
  | "decision_overdue"
  | "decision_missing_recommendation"
  | "decision_blocking_execution"
  | "approval_overdue"
  | "follow_up_overdue"
  | "waiting_too_long"
  | "too_many_critical_hubs"
  | "milestone_conflict";

export interface AttentionSignal {
  id: string;
  organizationId: string;
  portfolioId: string;
  hubId?: string;
  entityType: string;
  entityId: string;
  signalType: AttentionSignalType;
  severity: AttentionSeverity;
  impact: number;
  urgency: number;
  responsibility: number;
  reason: string;
  recommendedAction?: string;
  createdAt: string;
  resolvedAt?: string;
  dismissedAt?: string;
  snoozedUntil?: string;
  actionReason?: string;
  metadata: Record<string, unknown>;
}

export function attentionState(
  signal: AttentionSignal,
  now = new Date(),
): AttentionState {
  if (signal.resolvedAt) return "resolved";
  if (signal.dismissedAt) return "dismissed";
  if (signal.snoozedUntil && new Date(signal.snoozedUntil) > now)
    return "snoozed";
  return "active";
}

const severityWeight: Record<AttentionSeverity, number> = {
  info: 1,
  low: 2,
  medium: 3,
  high: 4,
  critical: 5,
};

export function attentionScore(
  signal: AttentionSignal,
  now = new Date(),
): number {
  const ageDays = Math.max(
    0,
    (now.getTime() - new Date(signal.createdAt).getTime()) / 86_400_000,
  );
  const recency = Math.max(0.7, 1.25 - ageDays * 0.03);
  return Math.round(
    severityWeight[signal.severity] *
      signal.impact *
      signal.urgency *
      signal.responsibility *
      recency,
  );
}

export function rankAttentionSignals(
  signals: readonly AttentionSignal[],
  now = new Date(),
): AttentionSignal[] {
  return signals
    .filter((signal) => attentionState(signal, now) === "active")
    .filter(
      (signal, index, all) =>
        all.findIndex(
          (candidate) =>
            candidate.entityType === signal.entityType &&
            candidate.entityId === signal.entityId &&
            candidate.signalType === signal.signalType,
        ) === index,
    )
    .sort(
      (left, right) => attentionScore(right, now) - attentionScore(left, now),
    );
}

export interface AttentionEvidenceHub {
  id: string;
  portfolioId: string;
  name: string;
  health: "on_track" | "watch" | "critical" | "parked";
  latestUpdate: { date: string };
  lead?: { name: string };
}

export interface AttentionEvidenceItem {
  id: string;
  hubId: string;
  title: string;
  type: "task" | "decision" | "approval" | "milestone" | "idea" | "request";
  priority: "urgent" | "high" | "normal" | "low" | "none";
  status: "not_started" | "working" | "blocked" | "review" | "done";
  dueDate?: string;
  assignee?: string;
  decisionState?: "needed" | "analyzing" | "delegated" | "deferred" | "decided";
  approvalState?: "pending" | "changes_requested" | "approved" | "rejected";
}

export interface WorkItemDependency {
  itemId: string;
  dependsOnItemId: string;
  relation: "depends_on" | "blocks" | "related";
}

export function generateAttentionSignals(
  organizationId: string,
  hubs: readonly AttentionEvidenceHub[],
  items: readonly AttentionEvidenceItem[],
  waitingStates: readonly WaitingState[] = [],
  now = new Date(),
  dependencies: readonly WorkItemDependency[] = [],
): AttentionSignal[] {
  const signals: AttentionSignal[] = [];
  const add = (
    signal: Omit<AttentionSignal, "id" | "organizationId" | "createdAt">,
  ) => {
    const id = `signal-${signal.signalType}-${signal.entityId}`;
    signals.push({
      id,
      organizationId,
      createdAt: now.toISOString(),
      ...signal,
    });
  };
  const hubById = new Map(hubs.map((hub) => [hub.id, hub]));
  for (const item of items) {
    if (item.status === "done") continue;
    const hub = hubById.get(item.hubId);
    if (!hub) continue;
    const overdue = Boolean(
      item.dueDate && new Date(`${item.dueDate}T23:59:59Z`) < now,
    );
    const base = {
      portfolioId: hub.portfolioId,
      hubId: hub.id,
      entityType: item.type,
      entityId: item.id,
      responsibility: item.assignee ? 1 : 1.2,
      metadata: { title: item.title, hubName: hub.name, dueDate: item.dueDate },
    };
    if (item.status === "blocked")
      add({
        ...base,
        signalType: "blocked_work",
        severity: item.priority === "urgent" ? "critical" : "high",
        impact: item.priority === "urgent" ? 5 : 4,
        urgency: overdue ? 5 : 4,
        reason: `${item.title} is blocked${overdue ? " and past its due date" : ""}.`,
        recommendedAction:
          "Open the dependency and agree the next unblock step.",
      });
    if (overdue && ["urgent", "high"].includes(item.priority))
      add({
        ...base,
        signalType:
          item.type === "milestone"
            ? "overdue_milestone"
            : item.type === "decision"
              ? "decision_overdue"
              : item.type === "approval"
                ? "approval_overdue"
                : "overdue_high_priority_work",
        severity: item.priority === "urgent" ? "critical" : "high",
        impact: item.priority === "urgent" ? 5 : 4,
        urgency: 5,
        reason: `${item.title} is overdue and marked ${item.priority}.`,
        recommendedAction:
          "Confirm ownership, a realistic date, and the immediate next action.",
      });
    if (!item.assignee && ["urgent", "high"].includes(item.priority))
      add({
        ...base,
        signalType: "missing_owner",
        severity: "high",
        impact: 4,
        urgency: overdue ? 5 : 3,
        reason: `${item.title} is ${item.priority} priority but has no owner.`,
        recommendedAction: "Assign one accountable owner.",
      });
  }
  const itemById = new Map(items.map((item) => [item.id, item]));
  for (const dependency of dependencies) {
    if (dependency.relation !== "depends_on") continue;
    const item = itemById.get(dependency.itemId);
    const prerequisite = itemById.get(dependency.dependsOnItemId);
    if (!item || !prerequisite || item.status === "done") continue;
    const prerequisiteOverdue = Boolean(
      prerequisite.dueDate &&
      new Date(`${prerequisite.dueDate}T23:59:59Z`) < now,
    );
    if (prerequisite.status !== "blocked" && !prerequisiteOverdue) continue;
    const hub = hubById.get(item.hubId);
    const prerequisiteHub = hubById.get(prerequisite.hubId);
    if (!hub || !prerequisiteHub) continue;
    add({
      portfolioId: hub.portfolioId,
      hubId: hub.id,
      entityType: item.type,
      entityId: item.id,
      signalType: "dependency_threat",
      severity: item.priority === "urgent" ? "critical" : "high",
      impact: item.priority === "urgent" ? 5 : 4,
      urgency: prerequisiteOverdue ? 5 : 4,
      responsibility: item.assignee ? 1 : 1.2,
      reason: `${item.title} depends on blocked work in ${prerequisiteHub.name}: ${prerequisite.title}.`,
      recommendedAction:
        "Coordinate the owners across both projects and agree the unblock path.",
      metadata: {
        title: item.title,
        dependsOnItemId: prerequisite.id,
        dependsOnHubId: prerequisiteHub.id,
        crossHub: prerequisiteHub.id !== hub.id,
      },
    });
  }
  for (const hub of hubs) {
    const ageDays = Math.floor(
      (now.getTime() -
        new Date(`${hub.latestUpdate.date}T12:00:00Z`).getTime()) /
        86_400_000,
    );
    if (ageDays > 7 && hub.health !== "parked")
      add({
        portfolioId: hub.portfolioId,
        hubId: hub.id,
        entityType: "hub",
        entityId: hub.id,
        signalType: "stale_update",
        severity: ageDays > 14 ? "high" : "medium",
        impact: hub.health === "critical" ? 5 : 3,
        urgency: Math.min(5, Math.ceil(ageDays / 4)),
        responsibility: 1,
        reason: `${hub.name} has not published an update for ${ageDays} days.`,
        recommendedAction: "Ask the project lead for a structured update.",
        metadata: { hubName: hub.name, ageDays },
      });
  }
  for (const waiting of waitingStates) {
    if (waiting.resolvedAt || !waiting.expectedBy) continue;
    if (new Date(`${waiting.expectedBy}T23:59:59Z`) >= now) continue;
    add({
      portfolioId: waiting.portfolioId,
      hubId: waiting.hubId,
      entityType: waiting.entityType,
      entityId: waiting.entityId,
      signalType: "waiting_too_long",
      severity: "high",
      impact: 4,
      urgency: 4,
      responsibility: 1.1,
      reason: `${waiting.title} has waited past ${waiting.expectedBy}${waiting.waitingLabel ? ` for ${waiting.waitingLabel}` : ""}.`,
      recommendedAction:
        "Send the planned follow-up or reset the expected date.",
      metadata: {
        waitingStateId: waiting.id,
        waitingType: waiting.waitingType,
        expectedBy: waiting.expectedBy,
      },
    });
  }
  return rankAttentionSignals(signals, now);
}

export type WaitingType =
  | "person"
  | "team"
  | "external_partner"
  | "client"
  | "vendor"
  | "decision"
  | "document"
  | "dependency"
  | "other";

export interface WaitingState {
  id: string;
  organizationId: string;
  portfolioId: string;
  hubId: string;
  entityType: "work_item" | "decision" | "approval";
  entityId: string;
  title: string;
  waitingType: WaitingType;
  waitingReferenceId?: string;
  waitingLabel?: string;
  waitingSince: string;
  expectedBy?: string;
  followUpOwnerId: string;
  followUpOwnerName: string;
  nextFollowUp?: string;
  waitingNote?: string;
  resolvedAt?: string;
}

export type MeaningfulChangeType =
  | "health_changed"
  | "milestone_changed"
  | "priority_changed"
  | "decision_requested"
  | "decision_resolved"
  | "blocker_added"
  | "blocker_resolved"
  | "update_published"
  | "update_became_stale"
  | "major_work_completed"
  | "due_date_materially_changed"
  | "ownership_changed";

export interface MeaningfulChange {
  id: string;
  organizationId: string;
  portfolioId: string;
  hubId: string;
  entityType: string;
  entityId: string;
  type: MeaningfulChangeType;
  summary: string;
  occurredAt: string;
  importance: number;
  metadata: Record<string, unknown>;
}

export interface UserSeenCheckpoint {
  userId: string;
  portfolioId: string;
  lastSeenAt: string;
}

export function changesSinceCheckpoint(
  changes: readonly MeaningfulChange[],
  checkpoint: UserSeenCheckpoint,
  minimumImportance = 2,
): MeaningfulChange[] {
  return changes
    .filter(
      (change) =>
        change.portfolioId === checkpoint.portfolioId &&
        change.importance >= minimumImportance &&
        new Date(change.occurredAt) > new Date(checkpoint.lastSeenAt),
    )
    .sort(
      (left, right) =>
        new Date(right.occurredAt).getTime() -
        new Date(left.occurredAt).getTime(),
    );
}

export interface HubSnapshot {
  id: string;
  organizationId: string;
  portfolioId: string;
  hubId: string;
  capturedAt: string;
  health: "on_track" | "watch" | "critical" | "parked";
  progress?: number;
  openCount: number;
  overdueCount: number;
  blockedCount: number;
  decisionCount: number;
  attentionCount: number;
  nextMilestoneId?: string;
  nextMilestoneStatus?: string;
  latestUpdateAt?: string;
  source: "weekly_review" | "monthly_review" | "manual";
}

export interface ReviewRitual {
  id: string;
  organizationId: string;
  portfolioId: string;
  hubId?: string;
  type: "daily_focus" | "weekly_hub" | "monthly_portfolio";
  cadence: string;
  enabled: boolean;
  nextDueAt?: string;
  reminderEnabled: boolean;
}

export interface DecisionOutcome {
  id: string;
  organizationId: string;
  portfolioId: string;
  decisionItemId: string;
  outcome:
    | "better_than_expected"
    | "as_expected"
    | "worse_than_expected"
    | "too_early";
  learning: string;
  wouldRepeat?: boolean;
  recordedBy: string;
  recordedAt: string;
}

export type InsightSourceType =
  | "customer_feedback"
  | "research"
  | "analytics"
  | "quote"
  | "url"
  | "screenshot"
  | "file"
  | "email"
  | "slack"
  | "figma"
  | "github"
  | "other";

export interface Insight {
  id: string;
  organizationId: string;
  portfolioId: string;
  hubId?: string;
  title: string;
  description: string;
  sourceType: InsightSourceType;
  sourceUrl?: string;
  impact?: "low" | "medium" | "high";
  labels: string[];
  capturedBy: string;
  capturedAt: string;
}

export interface InsightLink {
  id: string;
  organizationId: string;
  insightId: string;
  entityType: "idea" | "decision" | "hub" | "board" | "work_item";
  entityId: string;
}

export interface IdeaOpportunity {
  itemId: string;
  problemOrOpportunity?: string;
  hypothesis?: string;
  expectedImpact?: number;
  effort?: number;
  confidence?: number;
  strategicFit?: number;
  reviewDate?: string;
  promotedEntityType?: "board" | "work_item" | "decision" | "milestone";
  promotedEntityId?: string;
}

export function opportunityScore(idea: IdeaOpportunity): number | null {
  if (
    idea.expectedImpact === undefined ||
    idea.effort === undefined ||
    idea.confidence === undefined ||
    idea.strategicFit === undefined ||
    idea.effort <= 0
  )
    return null;
  return Number(
    (
      (idea.expectedImpact * idea.confidence * idea.strategicFit) /
      idea.effort
    ).toFixed(1),
  );
}

export interface BlueprintVersion {
  id: string;
  blueprintId: string;
  version: number;
  summary: string;
  definition: {
    groups: string[];
    statuses: string[];
    customFields: string[];
    views: string[];
    updateCadence: string;
    defaultRoles: string[];
    automationRules: string[];
    reviewRitual: string;
  };
  createdAt: string;
}

export interface Blueprint {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  currentVersionId: string;
}

export interface BlueprintInstance {
  id: string;
  organizationId: string;
  blueprintId: string;
  blueprintVersionId: string;
  hubId: string;
  boardId: string;
  detachedAt?: string;
  localOverrides: string[];
}

export interface BlueprintDiff {
  additions: string[];
  changes: string[];
  conflicts: string[];
  preservedOverrides: string[];
}

export function previewBlueprintUpdate(
  instance: BlueprintInstance,
  current: BlueprintVersion,
  next: BlueprintVersion,
): BlueprintDiff {
  const added = <T>(before: readonly T[], after: readonly T[]) =>
    after.filter((value) => !before.includes(value));
  const additions = [
    ...added(current.definition.groups, next.definition.groups).map(
      (value) => `Group: ${value}`,
    ),
    ...added(current.definition.statuses, next.definition.statuses).map(
      (value) => `Status: ${value}`,
    ),
    ...added(current.definition.customFields, next.definition.customFields).map(
      (value) => `Field: ${value}`,
    ),
    ...added(current.definition.views, next.definition.views).map(
      (value) => `View: ${value}`,
    ),
    ...added(
      current.definition.automationRules,
      next.definition.automationRules,
    ).map((value) => `Automation: ${value}`),
  ];
  const changes = [
    ...(current.definition.updateCadence !== next.definition.updateCadence
      ? [
          `Update cadence: ${current.definition.updateCadence} → ${next.definition.updateCadence}`,
        ]
      : []),
    ...(current.definition.reviewRitual !== next.definition.reviewRitual
      ? [
          `Review ritual: ${current.definition.reviewRitual} → ${next.definition.reviewRitual}`,
        ]
      : []),
  ];
  const conflicts = additions.filter((entry) =>
    instance.localOverrides.some((override) =>
      entry.toLocaleLowerCase().includes(override.toLocaleLowerCase()),
    ),
  );
  return {
    additions: additions.filter((entry) => !conflicts.includes(entry)),
    changes,
    conflicts,
    preservedOverrides: [...instance.localOverrides],
  };
}

export type DependencyRelation =
  "blocks" | "blocked_by" | "depends_on" | "related";

export interface ResourcePressure {
  userId: string;
  userName: string;
  urgentHighActive: number;
  dueThisWeek: number;
  blockedResponsibilities: number;
  criticalHubResponsibilities: number;
  milestonesOwned: number;
  hubIds: string[];
  pressure: "normal" | "elevated" | "critical";
}

export function calculateResourcePressure(
  hubs: readonly Pick<AttentionEvidenceHub, "id" | "health">[],
  items: readonly AttentionEvidenceItem[],
  now = new Date(),
): ResourcePressure[] {
  const active = items.filter(
    (item) => item.status !== "done" && Boolean(item.assignee),
  );
  const names = [
    ...new Set(active.map((item) => item.assignee).filter(Boolean)),
  ] as string[];
  const weekEnd = new Date(now);
  weekEnd.setDate(weekEnd.getDate() + 7);
  return names
    .map((userName) => {
      const owned = active.filter((item) => item.assignee === userName);
      const hubIds = [...new Set(owned.map((item) => item.hubId))];
      const urgentHighActive = owned.filter((item) =>
        ["urgent", "high"].includes(item.priority),
      ).length;
      const dueThisWeek = owned.filter(
        (item) =>
          item.dueDate &&
          new Date(`${item.dueDate}T23:59:59Z`) >= now &&
          new Date(`${item.dueDate}T23:59:59Z`) <= weekEnd,
      ).length;
      const blockedResponsibilities = owned.filter(
        (item) => item.status === "blocked",
      ).length;
      const criticalHubResponsibilities = hubIds.filter(
        (hubId) => hubs.find((hub) => hub.id === hubId)?.health === "critical",
      ).length;
      const milestonesOwned = owned.filter(
        (item) => item.type === "milestone",
      ).length;
      const score =
        urgentHighActive +
        dueThisWeek +
        blockedResponsibilities * 2 +
        criticalHubResponsibilities * 2 +
        milestonesOwned;
      return {
        userId: `user-${userName.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        userName,
        urgentHighActive,
        dueThisWeek,
        blockedResponsibilities,
        criticalHubResponsibilities,
        milestonesOwned,
        hubIds,
        pressure: score >= 12 ? "critical" : score >= 7 ? "elevated" : "normal",
      } satisfies ResourcePressure;
    })
    .sort((left, right) => {
      const weight = { normal: 0, elevated: 1, critical: 2 } as const;
      return weight[right.pressure] - weight[left.pressure];
    });
}

export interface StakeholderExposure {
  id: string;
  organizationId: string;
  hubId: string;
  principalId: string;
  health: boolean;
  latestUpdate: boolean;
  milestones: boolean;
  selectedWorkItemIds: string[];
  selectedResourceIds: string[];
  approvalItemIds: string[];
  decisionItemIds: string[];
  internalComments: false;
}

export type ImportPreset = "generic_csv" | "monday" | "clickup" | "asana";

export interface ImportPreview {
  preset: ImportPreset;
  rowsDetected: number;
  rowsReady: number;
  warnings: string[];
  unsupportedFields: string[];
  mapping: Record<string, string>;
  dryRun: true;
}
