import { createHash } from "node:crypto";
import {
  createIdentityRepositories,
  type IdentityRepositories,
  type IdentityScope,
} from "./identity-repositories.js";
import type {
  DecisionOutcome,
  MeaningfulChange,
  ReviewRitual,
  WorkItem as CoreWorkItem,
  WorkspaceSnapshot,
} from "@founderhq/core";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as databaseSchema from "./schema.js";
import {
  activityEvents,
  appUserOrganizationSelections,
  attentionSignals,
  auditLogs,
  boards,
  comments,
  decisionOutcomes,
  idempotencyRecords,
  inboxItems,
  itemAssignees,
  itemDependencies,
  invitations,
  memberships,
  organizations,
  outboxEvents,
  portfolioMembers,
  portfolios,
  reviewRituals,
  users,
  userSeenCheckpoints,
  waitingStates,
  workItems,
  workspaceSnapshots,
  workspaceUpdates,
  workspaceMembers,
  workspaces,
} from "./schema.js";

export type TrevvDatabase = PostgresJsDatabase<typeof databaseSchema>;

export type RepositoryErrorCode =
  | "resource_not_found"
  | "version_conflict"
  | "idempotency_key_reused"
  | "constraint_conflict"
  | "identity_not_verified"
  | "identity_access_unavailable"
  | "organization_selection_required"
  | "onboarding_conflict"
  | "invitation_invalid"
  | "repository_unavailable";

export class RepositoryError extends Error {
  constructor(
    readonly code: RepositoryErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "RepositoryError";
  }
}

export interface OrganizationScope {
  organizationId: string;
  userId: string;
  requestId: string;
}

declare const tenantScopeBrand: unique symbol;

export type TenantScope = OrganizationScope & {
  readonly [tenantScopeBrand]: "TenantScope";
};

export function createOrganizationScope(scope: OrganizationScope): TenantScope {
  assertScope(scope);
  return Object.freeze({ ...scope }) as TenantScope;
}

export interface MutationContext {
  method: string;
  route: string;
  idempotencyKey?: string;
  requestFingerprint?: string;
  now?: Date;
  responseStatus?: number;
}

export interface MutationResult<T> {
  value: T;
  replayed: boolean;
}

export interface WorkItemProjection {
  id: string;
  workspaceId: string;
  boardId: string;
  title: string;
  description: string;
  type: (typeof workItems.$inferSelect)["itemType"];
  priority: (typeof workItems.$inferSelect)["priority"];
  status: (typeof workItems.$inferSelect)["status"];
  dueDate?: string;
  assignee?: string;
  assigneeIds: string[];
  assignees: Array<{ id: string; name: string }>;
  approvalState?: NonNullable<CoreWorkItem["approvalState"]>;
  decisionState?: NonNullable<CoreWorkItem["decisionState"]>;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceProjection {
  id: string;
  organizationId: string;
  portfolioId: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  accent: string;
  type: (typeof workspaces.$inferSelect)["type"];
  stage: (typeof workspaces.$inferSelect)["lifecycleStage"];
  health: (typeof workspaces.$inferSelect)["health"];
  healthNote: string;
  priority: string;
  lead: { id: string; name: string; initials: string } | null;
  nextMilestone: { title: string; date: string | null };
  latestUpdate: { id: string; text: string; date: string } | null;
  metrics: Array<{
    id: string;
    label: string;
    unit: string;
    value: number | null;
    target: number | null;
  }>;
  versionTag: string;
}

export interface InboxItemProjection {
  id: string;
  organizationId: string;
  userId: string;
  category: string;
  title: string;
  body: string;
  resource: unknown;
  doneAt: string | null;
  snoozedUntil: string | null;
  convertedItemId: string | null;
  convertedAt: string | null;
  version: number;
  createdAt: string;
}

export interface WaitingProjection {
  id: string;
  organizationId: string;
  portfolioId: string;
  workspaceId: string;
  entityType: string;
  entityId: string;
  title: string;
  waitingType: string;
  waitingReferenceId?: string;
  waitingLabel?: string;
  waitingSince: string;
  expectedBy?: string;
  followUpOwnerId: string;
  followUpOwnerName: string;
  nextFollowUp?: string;
  waitingNote?: string;
  resolvedAt?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChangeRadarProjection {
  checkpoint: { userId: string; portfolioId: string; lastSeenAt: string };
  changes: MeaningfulChange[];
}

export interface CreateWorkItemInput {
  id?: string;
  workspaceId: string;
  boardId: string;
  title: string;
  description?: string;
  type: (typeof workItems.$inferInsert)["itemType"];
  priority: (typeof workItems.$inferInsert)["priority"];
  status: (typeof workItems.$inferInsert)["status"];
  dueDate?: string;
  assigneeIds?: string[];
  approvalState?: NonNullable<CoreWorkItem["approvalState"]>;
  decisionState?: NonNullable<CoreWorkItem["decisionState"]>;
}

export interface CreatePortfolioInput {
  name: string;
  slug: string;
  description?: string;
  isDefault?: boolean;
  ordering?: number;
}

export interface UpdatePortfolioInput {
  name?: string;
  slug?: string;
  description?: string;
  isDefault?: boolean;
  ordering?: number;
}

export interface CreateWorkspaceInput {
  portfolioId: string;
  name: string;
  slug: string;
  description?: string;
  type: (typeof workspaces.$inferInsert)["type"];
  accentColor: string;
  icon: string;
  visibility?: (typeof workspaces.$inferInsert)["visibility"];
  lifecycleStage: (typeof workspaces.$inferInsert)["lifecycleStage"];
  health: (typeof workspaces.$inferInsert)["health"];
  healthNote?: string;
  leadUserId?: string;
  currentPriority?: string;
  nextMilestoneSummary?: string;
  nextMilestoneDate?: string;
  primaryBlocker?: string;
  founderHelpSummary?: string;
  reviewCadence?: string;
  nextReviewDate?: string;
  ordering?: number;
  progressMode?: (typeof workspaces.$inferInsert)["progressMode"];
  manualProgressValue?: number;
}

export type UpdateWorkspaceInput = Partial<
  Omit<CreateWorkspaceInput, "portfolioId" | "type">
> & {
  type?: (typeof workspaces.$inferInsert)["type"];
  leadUserId?: string | null;
  nextMilestoneDate?: string | null;
  nextReviewDate?: string | null;
  manualProgressValue?: number | null;
};

export interface ConvertInboxToWorkItemInput {
  workspaceId: string;
  boardId: string;
  title?: string;
  description?: string;
  type?: (typeof workItems.$inferInsert)["itemType"];
  priority?: (typeof workItems.$inferInsert)["priority"];
  status?: (typeof workItems.$inferInsert)["status"];
  dueDate?: string;
  assigneeIds?: string[];
  approvalState?: NonNullable<CoreWorkItem["approvalState"]>;
  decisionState?: NonNullable<CoreWorkItem["decisionState"]>;
}

export interface UpdateWorkItemInput {
  title?: string;
  description?: string;
  priority?: (typeof workItems.$inferInsert)["priority"];
  status?: (typeof workItems.$inferInsert)["status"];
  dueDate?: string | null;
  assigneeIds?: string[];
  approvalState?: NonNullable<CoreWorkItem["approvalState"]> | null;
  decisionState?: NonNullable<CoreWorkItem["decisionState"]> | null;
}

export interface AttentionActionInput {
  action: "resolve" | "dismiss" | "snooze";
  reason?: string;
  snoozedUntil?: Date;
}

export interface WaitingActionInput {
  action: "resolve" | "nudge" | "reschedule";
  note?: string;
  nextFollowUp?: string;
}

export interface WeeklyReviewInput {
  workspaceId: string;
  health: (typeof workspaces.$inferInsert)["health"];
  progress?: number;
  progressSummary: string;
  blocker: string;
  nextMilestone: string;
  decisionNeeded?: string;
  priorityNextWeek: string;
}

export type InvitationRole =
  "admin" | "workspace_lead" | "member" | "guest" | "viewer";

export interface CreateInvitationInput {
  email: string;
  role: InvitationRole;
  tokenHash: string;
  expiresAt: Date;
}

export type InvitationProjection = Omit<
  typeof invitations.$inferSelect,
  "tokenHash"
>;

export interface CreateBoardInput {
  workspaceId: string;
  name: string;
  description?: string;
  templateKey?: string;
  visibility?: (typeof boards.$inferInsert)["visibility"];
  progressMode?: (typeof boards.$inferInsert)["progressMode"];
  startDate?: string;
  endDate?: string;
}

export interface UpdateBoardInput {
  name?: string;
  description?: string;
  visibility?: (typeof boards.$inferInsert)["visibility"];
  progressMode?: (typeof boards.$inferInsert)["progressMode"];
  manualProgressValue?: number | null;
  manualProgressNote?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

export interface CreateWorkspaceUpdateInput {
  workspaceId: string;
  wins: string;
  currentPriority: string;
  blocker: string;
  nextMilestone: string;
  helpNeeded: string;
  note?: string;
  publishedAt?: Date;
}

export interface CreateDecisionOutcomeInput {
  portfolioId: string;
  decisionItemId: string;
  outcome: DecisionOutcome["outcome"];
  learning: string;
  wouldRepeat?: boolean;
  recordedAt?: Date;
}

export interface CreateReviewRitualInput {
  portfolioId: string;
  workspaceId?: string;
  type: ReviewRitual["type"];
  cadence: string;
  enabled?: boolean;
  nextDueAt?: Date;
  reminderEnabled?: boolean;
}

export interface UpdateReviewRitualInput {
  type?: ReviewRitual["type"];
  cadence?: string;
  enabled?: boolean;
  nextDueAt?: Date | null;
  reminderEnabled?: boolean;
}

export interface CreateWorkspaceSnapshotInput {
  portfolioId: string;
  workspaceId: string;
  capturedAt?: Date;
  health: (typeof workspaceSnapshots.$inferInsert)["health"];
  progress?: number;
  openCount: number;
  overdueCount: number;
  blockedCount: number;
  decisionCount: number;
  attentionCount: number;
  nextMilestoneId?: string;
  nextMilestoneStatus?: string;
  latestUpdateAt?: Date;
  source: WorkspaceSnapshot["source"];
}

export interface OrganizationScopedRepositories {
  organization: {
    get: () => Promise<typeof organizations.$inferSelect>;
    update: (
      input: {
        name?: string;
        slug?: string;
        locale?: string;
        timezone?: string;
      },
      context: MutationContext,
    ) => Promise<MutationResult<typeof organizations.$inferSelect>>;
  };
  users: {
    list: () => Promise<Array<typeof users.$inferSelect>>;
    get: (id: string) => Promise<typeof users.$inferSelect>;
    getMemberHistory: (id: string) => Promise<typeof users.$inferSelect>;
    update: (
      id: string,
      input: { email?: string; name?: string; locale?: string },
      context: MutationContext,
    ) => Promise<MutationResult<typeof users.$inferSelect>>;
  };
  memberships: {
    list: () => Promise<Array<typeof memberships.$inferSelect>>;
    get: (userId: string) => Promise<typeof memberships.$inferSelect>;
    create: (
      input: {
        userId: string;
        role: (typeof memberships.$inferInsert)["role"];
      },
      context: MutationContext,
    ) => Promise<MutationResult<typeof memberships.$inferSelect>>;
    update: (
      userId: string,
      input: {
        role?: (typeof memberships.$inferInsert)["role"];
        archived?: boolean;
      },
      context: MutationContext,
    ) => Promise<MutationResult<typeof memberships.$inferSelect>>;
  };
  invitations: {
    list: () => Promise<InvitationProjection[]>;
    get: (id: string) => Promise<InvitationProjection>;
    create: (
      input: CreateInvitationInput,
      context: MutationContext,
    ) => Promise<MutationResult<InvitationProjection>>;
    resend: (
      id: string,
      expectedVersion: number,
      input: { tokenHash: string; expiresAt: Date },
      context: MutationContext,
    ) => Promise<MutationResult<InvitationProjection>>;
    revoke: (
      id: string,
      expectedVersion: number,
      context: MutationContext,
    ) => Promise<MutationResult<InvitationProjection>>;
    recordDelivery: (
      id: string,
      expectedVersion: number,
      input:
        | { status: "sent"; providerMessageId?: string }
        | { status: "failed"; errorCode: string },
      context: MutationContext,
      originatingContext?: MutationContext,
    ) => Promise<MutationResult<InvitationProjection>>;
  };
  session: {
    resolve: () => Promise<{
      organization: typeof organizations.$inferSelect;
      user: typeof users.$inferSelect;
      membership: typeof memberships.$inferSelect;
      portfolioIds: string[];
      managedPortfolioIds: string[];
      workspaceIds: string[];
      managedWorkspaceIds: string[];
    }>;
  };
  portfolios: {
    list: () => Promise<Array<typeof portfolios.$inferSelect>>;
    get: (id: string) => Promise<typeof portfolios.$inferSelect>;
    getRollup: (id: string) => Promise<{
      portfolio: typeof portfolios.$inferSelect;
      workspaces: WorkspaceProjection[];
      items: WorkItemProjection[];
    }>;
    create: (
      input: CreatePortfolioInput,
      context: MutationContext,
    ) => Promise<MutationResult<typeof portfolios.$inferSelect>>;
    update: (
      id: string,
      expectedUpdatedAt: Date,
      input: UpdatePortfolioInput,
      context: MutationContext,
    ) => Promise<MutationResult<typeof portfolios.$inferSelect>>;
    archive: (
      id: string,
      expectedUpdatedAt: Date,
      context: MutationContext,
    ) => Promise<MutationResult<typeof portfolios.$inferSelect>>;
  };
  workspaces: {
    list: (portfolioId?: string) => Promise<WorkspaceProjection[]>;
    getBySlug: (slug: string) => Promise<WorkspaceProjection>;
    create: (
      input: CreateWorkspaceInput,
      context: MutationContext,
    ) => Promise<MutationResult<WorkspaceProjection>>;
    update: (
      id: string,
      expectedUpdatedAt: Date,
      input: UpdateWorkspaceInput,
      context: MutationContext,
    ) => Promise<MutationResult<WorkspaceProjection>>;
    archive: (
      id: string,
      expectedUpdatedAt: Date,
      context: MutationContext,
    ) => Promise<MutationResult<WorkspaceProjection>>;
  };
  boards: {
    list: (workspaceId?: string) => Promise<Array<typeof boards.$inferSelect>>;
    get: (id: string) => Promise<typeof boards.$inferSelect>;
    create: (
      input: CreateBoardInput,
      context: MutationContext,
    ) => Promise<MutationResult<typeof boards.$inferSelect>>;
    update: (
      id: string,
      input: UpdateBoardInput,
      context: MutationContext,
    ) => Promise<MutationResult<typeof boards.$inferSelect>>;
  };
  workItems: {
    list: (filters?: {
      workspaceId?: string;
      boardId?: string;
      assigneeId?: string;
      limit?: number;
      offset?: number;
    }) => Promise<WorkItemProjection[]>;
    get: (id: string) => Promise<WorkItemProjection>;
    create: (
      input: CreateWorkItemInput,
      context: MutationContext,
    ) => Promise<MutationResult<WorkItemProjection>>;
    update: (
      id: string,
      expectedVersion: number,
      input: UpdateWorkItemInput,
      context: MutationContext,
    ) => Promise<MutationResult<WorkItemProjection>>;
  };
  itemAssignees: {
    list: (
      itemId: string,
    ) => Promise<Array<{ id: string; name: string; assignedAt: Date }>>;
    replace: (
      itemId: string,
      expectedVersion: number,
      userIds: string[],
      context: MutationContext,
    ) => Promise<MutationResult<WorkItemProjection>>;
  };
  itemDependencies: {
    list: (
      itemId: string,
    ) => Promise<Array<typeof itemDependencies.$inferSelect>>;
    add: (
      itemId: string,
      expectedVersion: number,
      dependsOnItemId: string,
      relation: string,
      context: MutationContext,
    ) => Promise<MutationResult<typeof itemDependencies.$inferSelect>>;
    remove: (
      itemId: string,
      expectedVersion: number,
      dependsOnItemId: string,
      context: MutationContext,
    ) => Promise<MutationResult<{ itemId: string; dependsOnItemId: string }>>;
  };
  comments: {
    list: (itemId: string) => Promise<Array<typeof comments.$inferSelect>>;
    get: (id: string) => Promise<typeof comments.$inferSelect>;
    create: (
      input: { itemId: string; expectedItemVersion: number; body: string },
      context: MutationContext,
    ) => Promise<MutationResult<typeof comments.$inferSelect>>;
    update: (
      id: string,
      expectedUpdatedAt: Date,
      expectedItemVersion: number,
      input: { body: string },
      context: MutationContext,
    ) => Promise<MutationResult<typeof comments.$inferSelect>>;
  };
  workspaceUpdates: {
    list: (
      workspaceId?: string,
    ) => Promise<Array<typeof workspaceUpdates.$inferSelect>>;
    get: (id: string) => Promise<typeof workspaceUpdates.$inferSelect>;
    create: (
      input: CreateWorkspaceUpdateInput,
      context: MutationContext,
    ) => Promise<MutationResult<typeof workspaceUpdates.$inferSelect>>;
    update: (
      id: string,
      expectedUpdatedAt: Date,
      input: Partial<Omit<CreateWorkspaceUpdateInput, "workspaceId">>,
      context: MutationContext,
    ) => Promise<MutationResult<typeof workspaceUpdates.$inferSelect>>;
  };
  decisions: {
    listItems: (portfolioId?: string) => Promise<WorkItemProjection[]>;
    listOutcomes: (
      portfolioId?: string,
    ) => Promise<Array<typeof decisionOutcomes.$inferSelect>>;
    getOutcome: (id: string) => Promise<typeof decisionOutcomes.$inferSelect>;
    recordOutcome: (
      input: CreateDecisionOutcomeInput,
      context: MutationContext,
    ) => Promise<MutationResult<typeof decisionOutcomes.$inferSelect>>;
    updateState: (
      itemId: string,
      expectedVersion: number,
      decisionState: NonNullable<CoreWorkItem["decisionState"]>,
      context: MutationContext,
    ) => Promise<MutationResult<WorkItemProjection>>;
  };
  approvals: {
    list: (portfolioId?: string) => Promise<WorkItemProjection[]>;
    updateState: (
      itemId: string,
      expectedVersion: number,
      approvalState: NonNullable<CoreWorkItem["approvalState"]>,
      context: MutationContext,
    ) => Promise<MutationResult<WorkItemProjection>>;
  };
  reviews: {
    list: (
      portfolioId?: string,
    ) => Promise<Array<typeof reviewRituals.$inferSelect>>;
    get: (id: string) => Promise<typeof reviewRituals.$inferSelect>;
    create: (
      input: CreateReviewRitualInput,
      context: MutationContext,
    ) => Promise<MutationResult<typeof reviewRituals.$inferSelect>>;
    update: (
      id: string,
      expectedUpdatedAt: Date,
      input: UpdateReviewRitualInput,
      context: MutationContext,
    ) => Promise<MutationResult<typeof reviewRituals.$inferSelect>>;
  };
  snapshots: {
    list: (filters?: {
      portfolioId?: string;
      workspaceId?: string;
    }) => Promise<Array<typeof workspaceSnapshots.$inferSelect>>;
    get: (id: string) => Promise<typeof workspaceSnapshots.$inferSelect>;
    create: (
      input: CreateWorkspaceSnapshotInput,
      context: MutationContext,
    ) => Promise<MutationResult<typeof workspaceSnapshots.$inferSelect>>;
  };
  attention: {
    listActive: (filters?: {
      portfolioId?: string;
      workspaceId?: string;
      now?: Date;
    }) => Promise<Array<typeof attentionSignals.$inferSelect>>;
    get: (id: string) => Promise<typeof attentionSignals.$inferSelect>;
    act: (
      id: string,
      expectedVersion: number,
      input: AttentionActionInput,
      context: MutationContext,
    ) => Promise<MutationResult<typeof attentionSignals.$inferSelect>>;
  };
  waiting: {
    listActive: (workspaceId?: string) => Promise<WaitingProjection[]>;
    get: (id: string) => Promise<WaitingProjection>;
    act: (
      id: string,
      expectedVersion: number,
      input: WaitingActionInput,
      context: MutationContext,
    ) => Promise<MutationResult<WaitingProjection>>;
  };
  inbox: {
    list: () => Promise<InboxItemProjection[]>;
    capture: (
      input: {
        id?: string;
        category: string;
        title: string;
        body?: string;
        resource?: Record<string, unknown>;
      },
      context: MutationContext,
    ) => Promise<MutationResult<InboxItemProjection>>;
    update: (
      id: string,
      expectedVersion: number,
      input: { done?: boolean; snoozedUntil?: Date | null },
      context: MutationContext,
    ) => Promise<MutationResult<InboxItemProjection>>;
    convertToWorkItem: (
      id: string,
      expectedVersion: number,
      input: ConvertInboxToWorkItemInput,
      context: MutationContext,
    ) => Promise<
      MutationResult<{
        inboxItem: InboxItemProjection;
        workItem: WorkItemProjection;
      }>
    >;
  };
  management: {
    getChangeRadar: (portfolioId?: string) => Promise<ChangeRadarProjection>;
    getMemory: (portfolioId?: string) => Promise<{
      workspaceSnapshots: Array<typeof workspaceSnapshots.$inferSelect>;
      reviewRituals: Array<typeof reviewRituals.$inferSelect>;
      decisionOutcomes: Array<typeof decisionOutcomes.$inferSelect>;
    }>;
    submitWeeklyReview: (
      input: WeeklyReviewInput,
      context: MutationContext,
    ) => Promise<
      MutationResult<{
        update: typeof workspaceUpdates.$inferSelect;
        snapshot: typeof workspaceSnapshots.$inferSelect;
      }>
    >;
  };
  search: (
    query: string,
    limit?: number,
  ) => Promise<{
    workspaces: WorkspaceProjection[];
    items: WorkItemProjection[];
  }>;
  exportOrganization: () => Promise<Record<string, unknown>>;
  unitOfWork: {
    run: <T>(
      callback: (repositories: OrganizationScopedRepositories) => Promise<T>,
    ) => Promise<T>;
  };
}

export interface PostgresRepositories {
  forOrganization(scope: TenantScope): OrganizationScopedRepositories;
  forIdentity(scope: IdentityScope): IdentityRepositories;
}

export function fingerprintRequest(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function createPostgresRepositories(
  database: TrevvDatabase,
): PostgresRepositories {
  return {
    forOrganization(scope) {
      assertScope(scope);
      return createScopedRepositories(database, scope, false);
    },
    forIdentity(scope) {
      return createIdentityRepositories(database, scope);
    },
  };
}

function createScopedRepositories(
  database: TrevvDatabase,
  scope: TenantScope,
  transactionBound: boolean,
): OrganizationScopedRepositories {
  const runInTransaction = async <T>(
    callback: (transaction: TrevvDatabase) => Promise<T>,
  ): Promise<T> => {
    if (transactionBound) return callback(database);
    return database.transaction((transaction) =>
      callback(transaction as unknown as TrevvDatabase),
    );
  };

  const listPortfolios = async () =>
    database
      .select()
      .from(portfolios)
      .where(
        and(
          eq(portfolios.organizationId, scope.organizationId),
          isNull(portfolios.archivedAt),
          isNull(portfolios.deletedAt),
        ),
      )
      .orderBy(desc(portfolios.isDefault), asc(portfolios.ordering));

  const getPortfolio = async (id: string) => {
    const [portfolio] = await database
      .select()
      .from(portfolios)
      .where(
        and(
          eq(portfolios.organizationId, scope.organizationId),
          eq(portfolios.id, id),
          isNull(portfolios.archivedAt),
          isNull(portfolios.deletedAt),
        ),
      )
      .limit(1);
    if (!portfolio) throw notFound();
    return portfolio;
  };

  const listWorkspaceRows = async (portfolioId?: string) =>
    database
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
          eq(workspaces.organizationId, scope.organizationId),
          isNull(workspaces.archivedAt),
          isNull(workspaces.deletedAt),
          isNull(portfolios.archivedAt),
          isNull(portfolios.deletedAt),
          portfolioId ? eq(workspaces.portfolioId, portfolioId) : undefined,
        ),
      )
      .orderBy(asc(workspaces.ordering), asc(workspaces.id))
      .then((rows) => rows.map(({ workspace }) => workspace));

  const listWorkspaces = async (portfolioId?: string) =>
    hydrateWorkspaces(
      database,
      scope.organizationId,
      await listWorkspaceRows(portfolioId),
    );

  const getWorkspaceBySlug = async (slug: string) => {
    const [row] = await database
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
          eq(workspaces.organizationId, scope.organizationId),
          eq(workspaces.slug, slug),
          isNull(workspaces.archivedAt),
          isNull(workspaces.deletedAt),
          isNull(portfolios.archivedAt),
          isNull(portfolios.deletedAt),
        ),
      )
      .limit(1);
    const workspace = row?.workspace;
    if (!workspace) throw notFound();
    const [projection] = await hydrateWorkspaces(
      database,
      scope.organizationId,
      [workspace],
    );
    if (!projection) throw notFound();
    return projection;
  };

  const getBoard = async (id: string) => {
    return getActiveBoard(database, scope.organizationId, id);
  };

  const listWorkItemRecords = async (filters?: {
    workspaceId?: string;
    boardId?: string;
    assigneeId?: string;
    limit?: number;
    offset?: number;
  }): Promise<WorkItemProjection[]> => {
    const limit = Math.max(1, Math.min(filters?.limit ?? 100, 100));
    const offset = Math.max(0, filters?.offset ?? 0);
    const rows = filters?.assigneeId
      ? await database
          .select({ item: workItems })
          .from(workItems)
          .innerJoin(
            itemAssignees,
            and(
              eq(itemAssignees.organizationId, workItems.organizationId),
              eq(itemAssignees.itemId, workItems.id),
              eq(itemAssignees.userId, filters.assigneeId),
            ),
          )
          .where(
            workItemPredicate(
              scope.organizationId,
              filters.workspaceId,
              filters.boardId,
            ),
          )
          .orderBy(asc(workItems.ordering), asc(workItems.id))
          .limit(limit)
          .offset(offset)
      : await database
          .select({ item: workItems })
          .from(workItems)
          .where(
            workItemPredicate(
              scope.organizationId,
              filters?.workspaceId,
              filters?.boardId,
            ),
          )
          .orderBy(asc(workItems.ordering), asc(workItems.id))
          .limit(limit)
          .offset(offset);
    return hydrateWorkItems(
      database,
      scope.organizationId,
      rows.map(({ item }) => item),
    );
  };

  const getWorkItem = async (id: string): Promise<WorkItemProjection> => {
    const item = await findScopedWorkItemRow(
      database,
      scope.organizationId,
      id,
    );
    if (!item) throw notFound();
    const [projection] = await hydrateWorkItems(
      database,
      scope.organizationId,
      [item],
    );
    if (!projection) throw notFound();
    return projection;
  };

  return {
    organization: {
      get: () => getOrganization(database, scope),
      update: (input, context) =>
        runInTransaction((transaction) =>
          updateOrganization(transaction, scope, input, context),
        ),
    },
    users: {
      list: () => listOrganizationUsers(database, scope),
      get: (id) => getOrganizationUser(database, scope, id),
      getMemberHistory: (id) =>
        getOrganizationMemberHistory(database, scope, id),
      update: (id, input, context) =>
        runInTransaction((transaction) =>
          updateOrganizationUser(transaction, scope, id, input, context),
        ),
    },
    memberships: {
      list: () => listMemberships(database, scope),
      get: (userId) => getMembership(database, scope, userId),
      create: (input, context) =>
        runInTransaction((transaction) =>
          createMembership(transaction, scope, input, context),
        ),
      update: (userId, input, context) =>
        runInTransaction((transaction) =>
          updateMembership(transaction, scope, userId, input, context),
        ),
    },
    invitations: {
      list: () => listInvitations(database, scope),
      get: (id) => getInvitation(database, scope, id),
      create: (input, context) =>
        runInTransaction((transaction) =>
          createInvitation(transaction, scope, input, context),
        ),
      resend: (id, expectedVersion, input, context) =>
        runInTransaction((transaction) =>
          resendInvitation(
            transaction,
            scope,
            id,
            expectedVersion,
            input,
            context,
          ),
        ),
      revoke: (id, expectedVersion, context) =>
        runInTransaction((transaction) =>
          revokeInvitation(transaction, scope, id, expectedVersion, context),
        ),
      recordDelivery: (
        id,
        expectedVersion,
        input,
        context,
        originatingContext,
      ) =>
        runInTransaction((transaction) =>
          recordInvitationDelivery(
            transaction,
            scope,
            id,
            expectedVersion,
            input,
            context,
            originatingContext,
          ),
        ),
    },
    session: {
      resolve: () => resolveSession(database, scope),
    },
    portfolios: {
      list: listPortfolios,
      get: getPortfolio,
      getRollup: async (id) => {
        const portfolio = await getPortfolio(id);
        const scopedWorkspaces = await listWorkspaces(id);
        const workspaceIds = scopedWorkspaces.map((workspace) => workspace.id);
        const items = workspaceIds.length
          ? await hydrateWorkItems(
              database,
              scope.organizationId,
              await database
                .select()
                .from(workItems)
                .where(
                  and(
                    workItemPredicate(scope.organizationId),
                    inArray(workItems.workspaceId, workspaceIds),
                  ),
                ),
            )
          : [];
        return { portfolio, workspaces: scopedWorkspaces, items };
      },
      create: (input, context) =>
        runInTransaction((transaction) =>
          createPortfolio(transaction, scope, input, context),
        ),
      update: (id, expectedUpdatedAt, input, context) =>
        runInTransaction((transaction) =>
          updatePortfolio(
            transaction,
            scope,
            id,
            expectedUpdatedAt,
            input,
            context,
          ),
        ),
      archive: (id, expectedUpdatedAt, context) =>
        runInTransaction((transaction) =>
          archivePortfolio(transaction, scope, id, expectedUpdatedAt, context),
        ),
    },
    workspaces: {
      list: listWorkspaces,
      getBySlug: getWorkspaceBySlug,
      create: (input, context) =>
        runInTransaction((transaction) =>
          createWorkspace(transaction, scope, input, context),
        ),
      update: (id, expectedUpdatedAt, input, context) =>
        runInTransaction((transaction) =>
          updateWorkspace(
            transaction,
            scope,
            id,
            expectedUpdatedAt,
            input,
            context,
          ),
        ),
      archive: (id, expectedUpdatedAt, context) =>
        runInTransaction((transaction) =>
          archiveWorkspace(transaction, scope, id, expectedUpdatedAt, context),
        ),
    },
    boards: {
      list: (workspaceId) => listBoards(database, scope, workspaceId),
      get: getBoard,
      create: (input, context) =>
        runInTransaction((transaction) =>
          createBoard(transaction, scope, input, context),
        ),
      update: (id, input, context) =>
        runInTransaction((transaction) =>
          updateBoard(transaction, scope, id, input, context),
        ),
    },
    workItems: {
      list: listWorkItemRecords,
      get: getWorkItem,
      create: (input, context) =>
        runInTransaction((transaction) =>
          createWorkItem(transaction, scope, input, context),
        ),
      update: (id, expectedVersion, input, context) =>
        runInTransaction((transaction) =>
          updateWorkItem(
            transaction,
            scope,
            id,
            expectedVersion,
            input,
            context,
          ),
        ),
    },
    itemAssignees: {
      list: (itemId) => listItemAssignees(database, scope, itemId),
      replace: (itemId, expectedVersion, userIds, context) =>
        runInTransaction((transaction) =>
          updateWorkItem(
            transaction,
            scope,
            itemId,
            expectedVersion,
            { assigneeIds: userIds },
            context,
          ),
        ),
    },
    itemDependencies: {
      list: (itemId) => listItemDependencies(database, scope, itemId),
      add: (itemId, expectedVersion, dependsOnItemId, relation, context) =>
        runInTransaction((transaction) =>
          addItemDependency(
            transaction,
            scope,
            itemId,
            expectedVersion,
            dependsOnItemId,
            relation,
            context,
          ),
        ),
      remove: (itemId, expectedVersion, dependsOnItemId, context) =>
        runInTransaction((transaction) =>
          removeItemDependency(
            transaction,
            scope,
            itemId,
            expectedVersion,
            dependsOnItemId,
            context,
          ),
        ),
    },
    comments: {
      list: (itemId) => listComments(database, scope, itemId),
      get: (id) => getComment(database, scope, id),
      create: (input, context) =>
        runInTransaction((transaction) =>
          createComment(transaction, scope, input, context),
        ),
      update: (id, expectedUpdatedAt, expectedItemVersion, input, context) =>
        runInTransaction((transaction) =>
          updateComment(
            transaction,
            scope,
            id,
            expectedUpdatedAt,
            expectedItemVersion,
            input,
            context,
          ),
        ),
    },
    workspaceUpdates: {
      list: (workspaceId) => listWorkspaceUpdates(database, scope, workspaceId),
      get: (id) => getWorkspaceUpdate(database, scope, id),
      create: (input, context) =>
        runInTransaction((transaction) =>
          createWorkspaceUpdate(transaction, scope, input, context),
        ),
      update: (id, expectedUpdatedAt, input, context) =>
        runInTransaction((transaction) =>
          updateWorkspaceUpdate(
            transaction,
            scope,
            id,
            expectedUpdatedAt,
            input,
            context,
          ),
        ),
    },
    decisions: {
      listItems: (portfolioId) =>
        listTypedWorkItems(database, scope, "decision", portfolioId),
      listOutcomes: (portfolioId) =>
        listDecisionOutcomes(database, scope, portfolioId),
      getOutcome: (id) => getDecisionOutcome(database, scope, id),
      recordOutcome: (input, context) =>
        runInTransaction((transaction) =>
          recordDecisionOutcome(transaction, scope, input, context),
        ),
      updateState: (itemId, expectedVersion, decisionState, context) =>
        runInTransaction((transaction) =>
          updateTypedWorkItemState(
            transaction,
            scope,
            "decision",
            itemId,
            expectedVersion,
            { decisionState },
            context,
          ),
        ),
    },
    approvals: {
      list: (portfolioId) =>
        listTypedWorkItems(database, scope, "approval", portfolioId),
      updateState: (itemId, expectedVersion, approvalState, context) =>
        runInTransaction((transaction) =>
          updateTypedWorkItemState(
            transaction,
            scope,
            "approval",
            itemId,
            expectedVersion,
            { approvalState },
            context,
          ),
        ),
    },
    reviews: {
      list: (portfolioId) => listReviewRituals(database, scope, portfolioId),
      get: (id) => getReviewRitual(database, scope, id),
      create: (input, context) =>
        runInTransaction((transaction) =>
          createReviewRitual(transaction, scope, input, context),
        ),
      update: (id, expectedUpdatedAt, input, context) =>
        runInTransaction((transaction) =>
          updateReviewRitual(
            transaction,
            scope,
            id,
            expectedUpdatedAt,
            input,
            context,
          ),
        ),
    },
    snapshots: {
      list: (filters) => listSnapshots(database, scope, filters),
      get: (id) => getSnapshot(database, scope, id),
      create: (input, context) =>
        runInTransaction((transaction) =>
          createSnapshot(transaction, scope, input, context),
        ),
    },
    attention: {
      listActive: (filters) => listActiveAttention(database, scope, filters),
      get: (id) => getAttention(database, scope, id),
      act: (id, expectedVersion, input, context) =>
        runInTransaction((transaction) =>
          actOnAttention(
            transaction,
            scope,
            id,
            expectedVersion,
            input,
            context,
          ),
        ),
    },
    waiting: {
      listActive: (workspaceId) =>
        listActiveWaiting(database, scope, workspaceId),
      get: (id) => getWaiting(database, scope, id),
      act: (id, expectedVersion, input, context) =>
        runInTransaction((transaction) =>
          actOnWaiting(transaction, scope, id, expectedVersion, input, context),
        ),
    },
    inbox: {
      list: () => listInbox(database, scope),
      capture: (input, context) =>
        runInTransaction((transaction) =>
          captureInboxItem(transaction, scope, input, context),
        ),
      update: (id, expectedVersion, input, context) =>
        runInTransaction((transaction) =>
          updateInboxItem(
            transaction,
            scope,
            id,
            expectedVersion,
            input,
            context,
          ),
        ),
      convertToWorkItem: (id, expectedVersion, input, context) =>
        runInTransaction((transaction) =>
          convertInboxToWorkItem(
            transaction,
            scope,
            id,
            expectedVersion,
            input,
            context,
          ),
        ),
    },
    management: {
      getChangeRadar: (portfolioId) =>
        getChangeRadar(database, scope, portfolioId),
      getMemory: (portfolioId) =>
        getManagementMemory(database, scope, portfolioId),
      submitWeeklyReview: (input, context) =>
        runInTransaction((transaction) =>
          submitWeeklyReview(transaction, scope, input, context),
        ),
    },
    search: (query, limit) => search(database, scope, query, limit),
    exportOrganization: () => exportOrganization(database, scope),
    unitOfWork: {
      run: (callback) =>
        runInTransaction((transaction) =>
          callback(createScopedRepositories(transaction, scope, true)),
        ),
    },
  };
}

async function getOrganization(
  database: TrevvDatabase,
  scope: OrganizationScope,
) {
  const [organization] = await database
    .select()
    .from(organizations)
    .where(
      and(
        eq(organizations.id, scope.organizationId),
        isNull(organizations.deletedAt),
      ),
    )
    .limit(1);
  if (!organization) throw notFound();
  return organization;
}

async function updateOrganization(
  transaction: TrevvDatabase,
  scope: OrganizationScope,
  input: {
    name?: string;
    slug?: string;
    locale?: string;
    timezone?: string;
  },
  context: MutationContext,
) {
  return withIdempotency(
    transaction,
    scope,
    context,
    input,
    async () => {
      await assertActorMembership(transaction, scope);
      const now = context.now ?? new Date();
      const [updated] = await transaction
        .update(organizations)
        .set({ ...input, updatedAt: now })
        .where(
          and(
            eq(organizations.id, scope.organizationId),
            isNull(organizations.deletedAt),
          ),
        )
        .returning();
      if (!updated) throw notFound();
      await writeAuditAndOutbox(transaction, scope, {
        action: "organization.updated",
        aggregateType: "organization",
        aggregateId: scope.organizationId,
        eventType: "organization.updated",
        payload: { fields: Object.keys(input).sort() },
        now,
      });
      return updated;
    },
    (value) => restoreRowWithDates(value, organizationDateFields),
  );
}

async function listOrganizationUsers(
  database: TrevvDatabase,
  scope: OrganizationScope,
) {
  return database
    .select({ user: users })
    .from(users)
    .innerJoin(
      memberships,
      and(
        eq(memberships.userId, users.id),
        eq(memberships.organizationId, scope.organizationId),
      ),
    )
    .where(
      and(
        isNull(users.deletedAt),
        isNull(memberships.archivedAt),
        isNull(memberships.deletedAt),
      ),
    )
    .orderBy(asc(users.name), asc(users.id))
    .then((rows) => rows.map(({ user }) => user));
}

async function getOrganizationUser(
  database: TrevvDatabase,
  scope: OrganizationScope,
  id: string,
) {
  const [resolved] = await database
    .select({ user: users })
    .from(users)
    .innerJoin(
      memberships,
      and(
        eq(memberships.userId, users.id),
        eq(memberships.organizationId, scope.organizationId),
      ),
    )
    .where(
      and(
        eq(users.id, id),
        isNull(users.deletedAt),
        isNull(memberships.archivedAt),
        isNull(memberships.deletedAt),
      ),
    )
    .limit(1);
  if (!resolved) throw notFound();
  return resolved.user;
}

async function getOrganizationMemberHistory(
  database: TrevvDatabase,
  scope: OrganizationScope,
  id: string,
) {
  const [resolved] = await database
    .select({ user: users })
    .from(users)
    .innerJoin(
      memberships,
      and(
        eq(memberships.userId, users.id),
        eq(memberships.organizationId, scope.organizationId),
      ),
    )
    .where(and(eq(users.id, id), isNull(users.deletedAt)))
    .limit(1);
  if (!resolved) throw notFound();
  return resolved.user;
}

async function updateOrganizationUser(
  transaction: TrevvDatabase,
  scope: OrganizationScope,
  id: string,
  input: { email?: string; name?: string; locale?: string },
  context: MutationContext,
) {
  return withIdempotency(
    transaction,
    scope,
    context,
    { id, ...input },
    async () => {
      await assertActorMembership(transaction, scope);
      if (id !== scope.userId) throw notFound();
      await getOrganizationUser(transaction, scope, id);
      const now = context.now ?? new Date();
      const [updated] = await transaction
        .update(users)
        .set({ ...input, updatedAt: now })
        .where(and(eq(users.id, id), isNull(users.deletedAt)))
        .returning();
      if (!updated) throw notFound();
      await writeAuditAndOutbox(transaction, scope, {
        action: "application_user.updated",
        aggregateType: "application_user",
        aggregateId: id,
        eventType: "application_user.updated",
        payload: { fields: Object.keys(input).sort() },
        now,
      });
      return updated;
    },
    (value) => restoreRowWithDates(value, userDateFields),
  );
}

async function listMemberships(
  database: TrevvDatabase,
  scope: OrganizationScope,
) {
  return database
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.organizationId, scope.organizationId),
        isNull(memberships.deletedAt),
      ),
    )
    .orderBy(asc(memberships.userId));
}

async function getMembership(
  database: TrevvDatabase,
  scope: OrganizationScope,
  userId: string,
) {
  const [membership] = await database
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.organizationId, scope.organizationId),
        eq(memberships.userId, userId),
        isNull(memberships.deletedAt),
      ),
    )
    .limit(1);
  if (!membership) throw notFound();
  return membership;
}

async function createMembership(
  transaction: TrevvDatabase,
  scope: OrganizationScope,
  input: {
    userId: string;
    role: (typeof memberships.$inferInsert)["role"];
  },
  context: MutationContext,
) {
  return withIdempotency(
    transaction,
    scope,
    context,
    input,
    async () => {
      await assertActorMembership(transaction, scope);
      const [targetUser] = await transaction
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, input.userId), isNull(users.deletedAt)))
        .limit(1);
      if (!targetUser) throw notFound();
      const now = context.now ?? new Date();
      const [created] = await transaction
        .insert(memberships)
        .values({
          organizationId: scope.organizationId,
          userId: input.userId,
          role: input.role,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing({
          target: [memberships.organizationId, memberships.userId],
        })
        .returning();
      if (!created)
        throw new RepositoryError(
          "repository_unavailable",
          "The membership could not be created.",
        );
      await writeAuditAndOutbox(transaction, scope, {
        action: "membership.created",
        aggregateType: "membership",
        aggregateId: `${scope.organizationId}:${input.userId}`,
        eventType: "membership.created",
        payload: { userId: input.userId, role: input.role },
        now,
      });
      return created;
    },
    (value) => restoreRowWithDates(value, membershipDateFields),
  );
}

async function updateMembership(
  transaction: TrevvDatabase,
  scope: OrganizationScope,
  userId: string,
  input: {
    role?: (typeof memberships.$inferInsert)["role"];
    archived?: boolean;
  },
  context: MutationContext,
) {
  return withIdempotency(
    transaction,
    scope,
    context,
    { userId, ...input },
    async () => {
      await assertActorMembership(transaction, scope);
      await lockOrganization(transaction, scope.organizationId);
      const [existing] = await transaction
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.organizationId, scope.organizationId),
            eq(memberships.userId, userId),
            isNull(memberships.deletedAt),
          ),
        )
        .limit(1)
        .for("update");
      if (!existing) throw notFound();
      const removesActiveOwner =
        existing.role === "owner" &&
        existing.archivedAt === null &&
        ((input.role !== undefined && input.role !== "owner") ||
          input.archived === true);
      if (removesActiveOwner) {
        const activeOwners = await transaction
          .select({ userId: memberships.userId })
          .from(memberships)
          .where(
            and(
              eq(memberships.organizationId, scope.organizationId),
              eq(memberships.role, "owner"),
              isNull(memberships.archivedAt),
              isNull(memberships.deletedAt),
            ),
          )
          .for("update");
        if (activeOwners.length === 1)
          throw new RepositoryError(
            "constraint_conflict",
            "An organization must retain at least one active owner.",
          );
      }
      const now = context.now ?? new Date();
      const [updated] = await transaction
        .update(memberships)
        .set({
          ...(input.role !== undefined ? { role: input.role } : {}),
          ...(input.archived !== undefined
            ? { archivedAt: input.archived ? now : null }
            : {}),
          updatedAt: now,
        })
        .where(
          and(
            eq(memberships.organizationId, scope.organizationId),
            eq(memberships.userId, userId),
            isNull(memberships.deletedAt),
          ),
        )
        .returning();
      if (!updated) throw notFound();
      if (input.archived === true) {
        await transaction
          .update(portfolioMembers)
          .set({ archivedAt: now, updatedAt: now })
          .where(
            and(
              eq(portfolioMembers.organizationId, scope.organizationId),
              eq(portfolioMembers.userId, userId),
              isNull(portfolioMembers.deletedAt),
            ),
          );
        await transaction
          .update(workspaceMembers)
          .set({ archivedAt: now, updatedAt: now })
          .where(
            and(
              eq(workspaceMembers.organizationId, scope.organizationId),
              eq(workspaceMembers.userId, userId),
              isNull(workspaceMembers.deletedAt),
            ),
          );
        await transaction
          .delete(appUserOrganizationSelections)
          .where(
            and(
              eq(appUserOrganizationSelections.appUserId, userId),
              eq(
                appUserOrganizationSelections.organizationId,
                scope.organizationId,
              ),
            ),
          );
      }
      await writeAuditAndOutbox(transaction, scope, {
        action:
          input.archived === true
            ? "membership.revoked"
            : input.archived === false
              ? "membership.restored"
              : "membership.updated",
        aggregateType: "membership",
        aggregateId: `${scope.organizationId}:${userId}`,
        eventType:
          input.archived === true
            ? "membership.revoked"
            : input.archived === false
              ? "membership.restored"
              : "membership.updated",
        payload: {
          active: updated.archivedAt === null && updated.deletedAt === null,
          fields: Object.keys(input).sort(),
          userId,
        },
        now,
      });
      return updated;
    },
    (value) => restoreRowWithDates(value, membershipDateFields),
  );
}

async function listInvitations(
  database: TrevvDatabase,
  scope: OrganizationScope,
) {
  const rows = await database
    .select()
    .from(invitations)
    .where(
      and(
        eq(invitations.organizationId, scope.organizationId),
        isNull(invitations.deletedAt),
      ),
    )
    .orderBy(desc(invitations.createdAt));
  return rows.map(projectInvitation);
}

async function getInvitation(
  database: TrevvDatabase,
  scope: OrganizationScope,
  id: string,
) {
  const row = await getInvitationRow(database, scope.organizationId, id);
  return projectInvitation(row);
}

async function getInvitationRow(
  database: TrevvDatabase,
  organizationId: string,
  id: string,
) {
  const [invitation] = await database
    .select()
    .from(invitations)
    .where(
      and(
        eq(invitations.organizationId, organizationId),
        eq(invitations.id, id),
        isNull(invitations.deletedAt),
      ),
    )
    .limit(1);
  if (!invitation) throw notFound();
  return invitation;
}

async function createInvitation(
  transaction: TrevvDatabase,
  scope: OrganizationScope,
  input: CreateInvitationInput,
  context: MutationContext,
) {
  assertInvitationTokenHash(input.tokenHash);
  assertInvitationRole(input.role);
  const email = normalizeInvitationEmail(input.email);
  return withIdempotency(
    transaction,
    scope,
    context,
    { ...input, email, tokenHash: fingerprintRequest(input.tokenHash) },
    async () => {
      await assertActorMembership(transaction, scope);
      const now = context.now ?? new Date();
      assertInvitationExpiry(input.expiresAt, now);
      const [existingMember] = await transaction
        .select({ userId: memberships.userId })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(
          and(
            eq(memberships.organizationId, scope.organizationId),
            sql`lower(${users.email}) = ${email}`,
            isNull(memberships.archivedAt),
            isNull(memberships.deletedAt),
            isNull(users.deletedAt),
          ),
        )
        .limit(1);
      if (existingMember)
        throw new RepositoryError(
          "constraint_conflict",
          "This email address already has an active organization membership.",
        );
      const [created] = await transaction
        .insert(invitations)
        .values({
          id: crypto.randomUUID(),
          organizationId: scope.organizationId,
          email,
          role: input.role,
          tokenHash: input.tokenHash,
          invitedByUserId: scope.userId,
          expiresAt: input.expiresAt,
          deliveryStatus: "pending",
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .returning();
      if (!created)
        throw new RepositoryError(
          "constraint_conflict",
          "An active invitation already exists for this email address or token.",
        );
      await writeAuditAndOutbox(transaction, scope, {
        action: "invitation.created",
        aggregateType: "invitation",
        aggregateId: created.id,
        eventType: "invitation.created",
        payload: { email: created.email, role: created.role },
        now,
      });
      return projectInvitation(created);
    },
    restoreInvitationProjection,
    true,
  );
}

async function resendInvitation(
  transaction: TrevvDatabase,
  scope: OrganizationScope,
  id: string,
  expectedVersion: number,
  input: { tokenHash: string; expiresAt: Date },
  context: MutationContext,
) {
  assertInvitationTokenHash(input.tokenHash);
  return withIdempotency(
    transaction,
    scope,
    context,
    {
      id,
      expectedVersion,
      expiresAt: input.expiresAt,
      tokenHash: fingerprintRequest(input.tokenHash),
    },
    async () => {
      await assertActorMembership(transaction, scope);
      const now = context.now ?? new Date();
      assertInvitationExpiry(input.expiresAt, now);
      const existing = await getInvitationRowForUpdate(
        transaction,
        scope.organizationId,
        id,
      );
      if (existing.version !== expectedVersion)
        throw versionConflict(existing.version);
      if (existing.acceptedAt || existing.revokedAt) throw invalidInvitation();
      const [updated] = await transaction
        .update(invitations)
        .set({
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
          deliveryStatus: "pending",
          deliveryAttemptedAt: null,
          deliveredAt: null,
          deliveryErrorCode: null,
          providerMessageId: null,
          version: sql`${invitations.version} + 1`,
          updatedAt: now,
        })
        .where(
          and(
            eq(invitations.organizationId, scope.organizationId),
            eq(invitations.id, id),
            eq(invitations.version, expectedVersion),
            isNull(invitations.acceptedAt),
            isNull(invitations.revokedAt),
            isNull(invitations.deletedAt),
          ),
        )
        .returning();
      if (!updated) throw notFound();
      await writeAuditAndOutbox(transaction, scope, {
        action: "invitation.resent",
        aggregateType: "invitation",
        aggregateId: id,
        eventType: "invitation.resent",
        payload: { expiresAt: input.expiresAt.toISOString() },
        now,
      });
      return projectInvitation(updated);
    },
    restoreInvitationProjection,
    true,
  );
}

async function revokeInvitation(
  transaction: TrevvDatabase,
  scope: OrganizationScope,
  id: string,
  expectedVersion: number,
  context: MutationContext,
) {
  return withIdempotency(
    transaction,
    scope,
    context,
    { id, expectedVersion },
    async () => {
      await assertActorMembership(transaction, scope);
      const existing = await getInvitationRowForUpdate(
        transaction,
        scope.organizationId,
        id,
      );
      if (existing.version !== expectedVersion)
        throw versionConflict(existing.version);
      if (existing.acceptedAt || existing.revokedAt) throw invalidInvitation();
      const now = context.now ?? new Date();
      const [revoked] = await transaction
        .update(invitations)
        .set({
          revokedAt: now,
          revokedByUserId: scope.userId,
          version: sql`${invitations.version} + 1`,
          updatedAt: now,
        })
        .where(
          and(
            eq(invitations.organizationId, scope.organizationId),
            eq(invitations.id, id),
            eq(invitations.version, expectedVersion),
            isNull(invitations.acceptedAt),
            isNull(invitations.revokedAt),
            isNull(invitations.deletedAt),
          ),
        )
        .returning();
      if (!revoked) throw invalidInvitation();
      await writeAuditAndOutbox(transaction, scope, {
        action: "invitation.revoked",
        aggregateType: "invitation",
        aggregateId: id,
        eventType: "invitation.revoked",
        payload: {},
        now,
      });
      return projectInvitation(revoked);
    },
    restoreInvitationProjection,
  );
}

async function recordInvitationDelivery(
  transaction: TrevvDatabase,
  scope: OrganizationScope,
  id: string,
  expectedVersion: number,
  input:
    | { status: "sent"; providerMessageId?: string }
    | { status: "failed"; errorCode: string },
  context: MutationContext,
  originatingContext?: MutationContext,
) {
  const result = await withIdempotency(
    transaction,
    scope,
    context,
    { id, expectedVersion, ...input },
    async () => {
      await assertActorMembership(transaction, scope);
      const existing = await getInvitationRowForUpdate(
        transaction,
        scope.organizationId,
        id,
      );
      if (existing.version !== expectedVersion)
        throw versionConflict(existing.version);
      if (existing.acceptedAt || existing.revokedAt) throw invalidInvitation();
      const now = context.now ?? new Date();
      const [updated] = await transaction
        .update(invitations)
        .set({
          deliveryStatus: input.status,
          deliveryAttemptedAt: now,
          deliveredAt: input.status === "sent" ? now : null,
          lastSentAt: input.status === "sent" ? now : existing.lastSentAt,
          sendCount: sql`${invitations.sendCount} + 1`,
          deliveryErrorCode:
            input.status === "failed"
              ? normalizeDiagnosticCode(input.errorCode)
              : null,
          providerMessageId:
            input.status === "sent"
              ? optionalDiagnosticValue(input.providerMessageId)
              : null,
          version: sql`${invitations.version} + 1`,
          updatedAt: now,
        })
        .where(
          and(
            eq(invitations.organizationId, scope.organizationId),
            eq(invitations.id, id),
            eq(invitations.version, expectedVersion),
            isNull(invitations.acceptedAt),
            isNull(invitations.revokedAt),
            isNull(invitations.deletedAt),
          ),
        )
        .returning();
      if (!updated) throw invalidInvitation();
      await writeAuditAndOutbox(transaction, scope, {
        action: `invitation.delivery_${input.status}`,
        aggregateType: "invitation",
        aggregateId: id,
        eventType: `invitation.delivery_${input.status}`,
        payload: {},
        now,
      });
      return projectInvitation(updated);
    },
    restoreInvitationProjection,
  );
  if (originatingContext?.idempotencyKey)
    await finalizeIdempotencyResponse(
      transaction,
      scope,
      originatingContext,
      result.value,
    );
  return result;
}

async function getInvitationRowForUpdate(
  database: TrevvDatabase,
  organizationId: string,
  id: string,
) {
  const [invitation] = await database
    .select()
    .from(invitations)
    .where(
      and(
        eq(invitations.organizationId, organizationId),
        eq(invitations.id, id),
        isNull(invitations.deletedAt),
      ),
    )
    .limit(1)
    .for("update");
  if (!invitation) throw notFound();
  return invitation;
}

function projectInvitation(
  invitation: typeof invitations.$inferSelect,
): InvitationProjection {
  const { tokenHash: _tokenHash, ...projection } = invitation;
  return projection;
}

async function lockOrganization(
  transaction: TrevvDatabase,
  organizationId: string,
) {
  const locked = await transaction.execute(sql`
    select ${organizations.id}
    from ${organizations}
    where ${organizations.id} = ${organizationId}
      and ${organizations.deletedAt} is null
    for update
  `);
  if (!locked.length) throw notFound();
}

async function createPortfolio(
  transaction: TrevvDatabase,
  scope: OrganizationScope,
  input: CreatePortfolioInput,
  context: MutationContext,
) {
  return withIdempotency(
    transaction,
    scope,
    context,
    input,
    async () => {
      await assertActorMembership(transaction, scope);
      await lockOrganization(transaction, scope.organizationId);
      const active = await transaction
        .select()
        .from(portfolios)
        .where(
          and(
            eq(portfolios.organizationId, scope.organizationId),
            isNull(portfolios.archivedAt),
            isNull(portfolios.deletedAt),
          ),
        );
      const now = context.now ?? new Date();
      const isDefault = active.length === 0 || input.isDefault === true;
      if (isDefault && active.some((portfolio) => portfolio.isDefault))
        await transaction
          .update(portfolios)
          .set({ isDefault: false, updatedAt: now })
          .where(
            and(
              eq(portfolios.organizationId, scope.organizationId),
              eq(portfolios.isDefault, true),
              isNull(portfolios.archivedAt),
              isNull(portfolios.deletedAt),
            ),
          );
      const id = crypto.randomUUID();
      const [created] = await transaction
        .insert(portfolios)
        .values({
          id,
          organizationId: scope.organizationId,
          name: input.name,
          slug: input.slug,
          description: input.description ?? "",
          isDefault,
          ordering: input.ordering ?? 0,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      if (!created)
        throw new RepositoryError(
          "repository_unavailable",
          "The Portfolio could not be created.",
        );
      const actor = await getMembership(transaction, scope, scope.userId);
      await transaction
        .insert(portfolioMembers)
        .values({
          organizationId: scope.organizationId,
          portfolioId: id,
          userId: scope.userId,
          role: actor.role,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing({
          target: [portfolioMembers.portfolioId, portfolioMembers.userId],
        });
      await writeAuditAndOutbox(transaction, scope, {
        action: "portfolio.created",
        aggregateType: "portfolio",
        aggregateId: id,
        eventType: "portfolio.created",
        payload: { isDefault },
        now,
      });
      return created;
    },
    (value) => restoreRowWithDates(value, standardDateFields),
  );
}

async function updatePortfolio(
  transaction: TrevvDatabase,
  scope: OrganizationScope,
  id: string,
  expectedUpdatedAt: Date,
  input: UpdatePortfolioInput,
  context: MutationContext,
) {
  return withIdempotency(
    transaction,
    scope,
    context,
    { id, expectedUpdatedAt, ...input },
    async () => {
      await assertActorMembership(transaction, scope);
      await lockOrganization(transaction, scope.organizationId);
      const existing = await getActivePortfolioRow(
        transaction,
        scope.organizationId,
        id,
      );
      if (existing.updatedAt.getTime() !== expectedUpdatedAt.getTime())
        throw versionConflict();
      const now = monotonicTimestamp(expectedUpdatedAt, context.now);
      if (input.isDefault === true && !existing.isDefault)
        await transaction
          .update(portfolios)
          .set({ isDefault: false, updatedAt: now })
          .where(
            and(
              eq(portfolios.organizationId, scope.organizationId),
              eq(portfolios.isDefault, true),
              isNull(portfolios.archivedAt),
              isNull(portfolios.deletedAt),
            ),
          );
      let replacementToPromote: { id: string } | undefined;
      if (input.isDefault === false && existing.isDefault) {
        replacementToPromote = await firstReplacementPortfolio(
          transaction,
          scope.organizationId,
          id,
        );
        if (!replacementToPromote)
          throw new RepositoryError(
            "repository_unavailable",
            "The only active Portfolio must remain the default.",
          );
      }
      const [updated] = await transaction
        .update(portfolios)
        .set({ ...input, updatedAt: now })
        .where(
          and(
            eq(portfolios.organizationId, scope.organizationId),
            eq(portfolios.id, id),
            eq(portfolios.updatedAt, expectedUpdatedAt),
            isNull(portfolios.archivedAt),
            isNull(portfolios.deletedAt),
          ),
        )
        .returning();
      if (!updated) throw versionConflict();
      if (replacementToPromote)
        await transaction
          .update(portfolios)
          .set({ isDefault: true, updatedAt: now })
          .where(
            and(
              eq(portfolios.organizationId, scope.organizationId),
              eq(portfolios.id, replacementToPromote.id),
              isNull(portfolios.archivedAt),
              isNull(portfolios.deletedAt),
            ),
          );
      await writeAuditAndOutbox(transaction, scope, {
        action: "portfolio.updated",
        aggregateType: "portfolio",
        aggregateId: id,
        eventType: "portfolio.updated",
        payload: { fields: Object.keys(input).sort() },
        now,
      });
      return updated;
    },
    (value) => restoreRowWithDates(value, standardDateFields),
  );
}

async function archivePortfolio(
  transaction: TrevvDatabase,
  scope: OrganizationScope,
  id: string,
  expectedUpdatedAt: Date,
  context: MutationContext,
) {
  return withIdempotency(
    transaction,
    scope,
    context,
    { id, expectedUpdatedAt },
    async () => {
      await assertActorMembership(transaction, scope);
      await lockOrganization(transaction, scope.organizationId);
      const existing = await getActivePortfolioRow(
        transaction,
        scope.organizationId,
        id,
      );
      if (existing.updatedAt.getTime() !== expectedUpdatedAt.getTime())
        throw versionConflict();
      const [activeWorkspace] = await transaction
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(
          and(
            eq(workspaces.organizationId, scope.organizationId),
            eq(workspaces.portfolioId, id),
            isNull(workspaces.archivedAt),
            isNull(workspaces.deletedAt),
          ),
        )
        .limit(1);
      if (activeWorkspace)
        throw new RepositoryError(
          "repository_unavailable",
          "Archive the Portfolio's active Workspaces first.",
        );
      const replacement = await firstReplacementPortfolio(
        transaction,
        scope.organizationId,
        id,
      );
      if (!replacement)
        throw new RepositoryError(
          "repository_unavailable",
          "The only active Portfolio cannot be archived.",
        );
      const now = monotonicTimestamp(expectedUpdatedAt, context.now);
      const [archived] = await transaction
        .update(portfolios)
        .set({ isDefault: false, archivedAt: now, updatedAt: now })
        .where(
          and(
            eq(portfolios.organizationId, scope.organizationId),
            eq(portfolios.id, id),
            eq(portfolios.updatedAt, expectedUpdatedAt),
            isNull(portfolios.archivedAt),
            isNull(portfolios.deletedAt),
          ),
        )
        .returning();
      if (!archived) throw versionConflict();
      if (existing.isDefault)
        await transaction
          .update(portfolios)
          .set({ isDefault: true, updatedAt: now })
          .where(
            and(
              eq(portfolios.organizationId, scope.organizationId),
              eq(portfolios.id, replacement.id),
              isNull(portfolios.archivedAt),
              isNull(portfolios.deletedAt),
            ),
          );
      await writeAuditAndOutbox(transaction, scope, {
        action: "portfolio.archived",
        aggregateType: "portfolio",
        aggregateId: id,
        eventType: "portfolio.archived",
        payload: {
          replacementDefaultId: existing.isDefault ? replacement.id : null,
        },
        now,
      });
      return archived;
    },
    (value) => restoreRowWithDates(value, standardDateFields),
  );
}

async function getActivePortfolioRow(
  database: TrevvDatabase,
  organizationId: string,
  id: string,
) {
  const [portfolio] = await database
    .select()
    .from(portfolios)
    .where(
      and(
        eq(portfolios.organizationId, organizationId),
        eq(portfolios.id, id),
        isNull(portfolios.archivedAt),
        isNull(portfolios.deletedAt),
      ),
    )
    .limit(1);
  if (!portfolio) throw notFound();
  return portfolio;
}

async function firstReplacementPortfolio(
  database: TrevvDatabase,
  organizationId: string,
  excludedId: string,
) {
  const [portfolio] = await database
    .select({ id: portfolios.id })
    .from(portfolios)
    .where(
      and(
        eq(portfolios.organizationId, organizationId),
        sql`${portfolios.id} <> ${excludedId}`,
        isNull(portfolios.archivedAt),
        isNull(portfolios.deletedAt),
      ),
    )
    .orderBy(asc(portfolios.ordering), asc(portfolios.id))
    .limit(1);
  return portfolio;
}

async function createWorkspace(
  transaction: TrevvDatabase,
  scope: OrganizationScope,
  input: CreateWorkspaceInput,
  context: MutationContext,
) {
  return withIdempotency(transaction, scope, context, input, async () => {
    await assertActorMembership(transaction, scope);
    await assertPortfolio(transaction, scope.organizationId, input.portfolioId);
    if (input.leadUserId)
      await assertOrganizationUsers(transaction, scope.organizationId, [
        input.leadUserId,
      ]);
    const now = context.now ?? new Date();
    const id = crypto.randomUUID();
    const [created] = await transaction
      .insert(workspaces)
      .values({
        id,
        organizationId: scope.organizationId,
        portfolioId: input.portfolioId,
        name: input.name,
        slug: input.slug,
        description: input.description ?? "",
        type: input.type,
        accentColor: input.accentColor,
        icon: input.icon,
        visibility: input.visibility,
        lifecycleStage: input.lifecycleStage,
        health: input.health,
        healthNote: input.healthNote ?? "",
        leadUserId: input.leadUserId,
        currentPriority: input.currentPriority ?? "",
        nextMilestoneSummary: input.nextMilestoneSummary ?? "",
        nextMilestoneDate: input.nextMilestoneDate,
        primaryBlocker: input.primaryBlocker ?? "",
        founderHelpSummary: input.founderHelpSummary ?? "",
        reviewCadence: input.reviewCadence,
        nextReviewDate: input.nextReviewDate,
        ordering: input.ordering ?? 0,
        progressMode: input.progressMode,
        manualProgressValue: input.manualProgressValue,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    if (!created)
      throw new RepositoryError(
        "repository_unavailable",
        "The Workspace could not be created.",
      );
    const memberIds = [
      ...new Set([scope.userId, input.leadUserId].filter(Boolean)),
    ] as string[];
    await transaction.insert(workspaceMembers).values(
      memberIds.map((userId) => ({
        organizationId: scope.organizationId,
        workspaceId: id,
        userId,
        // Lead management is derived from workspaces.lead_user_id. Keeping
        // this flag explicit prevents a former lead from retaining an
        // implicit management grant after replacement.
        canManage: userId === scope.userId,
        createdAt: now,
        updatedAt: now,
      })),
    );
    await writeAuditAndOutbox(transaction, scope, {
      action: "workspace.created",
      aggregateType: "workspace",
      aggregateId: id,
      eventType: "workspace.created",
      payload: {
        portfolioId: input.portfolioId,
        leadUserId: input.leadUserId ?? null,
      },
      now,
    });
    return getWorkspaceProjectionById(transaction, scope.organizationId, id);
  });
}

async function updateWorkspace(
  transaction: TrevvDatabase,
  scope: OrganizationScope,
  id: string,
  expectedUpdatedAt: Date,
  input: UpdateWorkspaceInput,
  context: MutationContext,
) {
  return withIdempotency(
    transaction,
    scope,
    context,
    { id, expectedUpdatedAt, ...input },
    async () => {
      await assertActorMembership(transaction, scope);
      const existing = await assertWorkspace(
        transaction,
        scope.organizationId,
        id,
      );
      if (input.leadUserId)
        await assertOrganizationUsers(transaction, scope.organizationId, [
          input.leadUserId,
        ]);
      const now = monotonicTimestamp(expectedUpdatedAt, context.now);
      const [updated] = await transaction
        .update(workspaces)
        .set({ ...input, updatedAt: now })
        .where(
          and(
            eq(workspaces.organizationId, scope.organizationId),
            eq(workspaces.id, id),
            eq(workspaces.updatedAt, expectedUpdatedAt),
            isNull(workspaces.archivedAt),
            isNull(workspaces.deletedAt),
          ),
        )
        .returning();
      if (!updated) {
        await assertWorkspace(transaction, scope.organizationId, id);
        throw versionConflict();
      }
      if (input.leadUserId)
        await transaction
          .insert(workspaceMembers)
          .values({
            organizationId: scope.organizationId,
            workspaceId: id,
            userId: input.leadUserId,
            canManage: false,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [workspaceMembers.workspaceId, workspaceMembers.userId],
            set: {
              archivedAt: null,
              deletedAt: null,
              updatedAt: now,
            },
          });
      await writeAuditAndOutbox(transaction, scope, {
        action: "workspace.updated",
        aggregateType: "workspace",
        aggregateId: id,
        eventType: "workspace.updated",
        payload: {
          fields: Object.keys(input).sort(),
          previousLeadUserId: existing.leadUserId,
          leadUserId:
            input.leadUserId === undefined
              ? existing.leadUserId
              : input.leadUserId,
        },
        now,
      });
      return getWorkspaceProjectionById(transaction, scope.organizationId, id);
    },
  );
}

async function archiveWorkspace(
  transaction: TrevvDatabase,
  scope: OrganizationScope,
  id: string,
  expectedUpdatedAt: Date,
  context: MutationContext,
) {
  return withIdempotency(
    transaction,
    scope,
    context,
    { id, expectedUpdatedAt },
    async () => {
      await assertActorMembership(transaction, scope);
      const now = monotonicTimestamp(expectedUpdatedAt, context.now);
      const [archived] = await transaction
        .update(workspaces)
        .set({ lifecycleStage: "archived", archivedAt: now, updatedAt: now })
        .where(
          and(
            eq(workspaces.organizationId, scope.organizationId),
            eq(workspaces.id, id),
            eq(workspaces.updatedAt, expectedUpdatedAt),
            isNull(workspaces.archivedAt),
            isNull(workspaces.deletedAt),
          ),
        )
        .returning();
      if (!archived) {
        await assertWorkspace(transaction, scope.organizationId, id);
        throw versionConflict();
      }
      await writeAuditAndOutbox(transaction, scope, {
        action: "workspace.archived",
        aggregateType: "workspace",
        aggregateId: id,
        eventType: "workspace.archived",
        payload: { portfolioId: archived.portfolioId },
        now,
      });
      const [projection] = await hydrateWorkspaces(
        transaction,
        scope.organizationId,
        [archived],
      );
      if (!projection) throw notFound();
      return projection;
    },
  );
}

async function getWorkspaceProjectionById(
  database: TrevvDatabase,
  organizationId: string,
  id: string,
) {
  const workspace = await assertWorkspace(database, organizationId, id);
  const [projection] = await hydrateWorkspaces(database, organizationId, [
    workspace,
  ]);
  if (!projection) throw notFound();
  return projection;
}

async function listBoards(
  database: TrevvDatabase,
  scope: OrganizationScope,
  workspaceId?: string,
) {
  if (workspaceId)
    await assertWorkspace(database, scope.organizationId, workspaceId);
  const rows = await database
    .select({ board: boards })
    .from(boards)
    .innerJoin(
      workspaces,
      and(
        eq(workspaces.organizationId, boards.organizationId),
        eq(workspaces.id, boards.workspaceId),
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
        eq(boards.organizationId, scope.organizationId),
        workspaceId ? eq(boards.workspaceId, workspaceId) : undefined,
        isNull(boards.archivedAt),
        isNull(boards.deletedAt),
        isNull(workspaces.archivedAt),
        isNull(workspaces.deletedAt),
        isNull(portfolios.archivedAt),
        isNull(portfolios.deletedAt),
      ),
    )
    .orderBy(asc(boards.ordering), asc(boards.id));
  return rows.map(({ board }) => board);
}

async function createBoard(
  transaction: TrevvDatabase,
  scope: OrganizationScope,
  input: CreateBoardInput,
  context: MutationContext,
) {
  return withIdempotency(
    transaction,
    scope,
    context,
    input,
    async () => {
      await assertActorMembership(transaction, scope);
      await assertWorkspace(
        transaction,
        scope.organizationId,
        input.workspaceId,
      );
      const now = context.now ?? new Date();
      const [created] = await transaction
        .insert(boards)
        .values({
          id: crypto.randomUUID(),
          organizationId: scope.organizationId,
          workspaceId: input.workspaceId,
          name: input.name,
          description: input.description ?? "",
          templateKey: input.templateKey,
          visibility: input.visibility,
          progressMode: input.progressMode,
          startDate: input.startDate,
          endDate: input.endDate,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      if (!created)
        throw new RepositoryError(
          "repository_unavailable",
          "The board could not be created.",
        );
      await writeAuditAndOutbox(transaction, scope, {
        action: "board.created",
        aggregateType: "board",
        aggregateId: created.id,
        eventType: "board.created",
        payload: { workspaceId: created.workspaceId },
        now,
      });
      return created;
    },
    (value) => restoreRowWithDates(value, standardDateFields),
  );
}

async function updateBoard(
  transaction: TrevvDatabase,
  scope: OrganizationScope,
  id: string,
  input: UpdateBoardInput,
  context: MutationContext,
) {
  return withIdempotency(
    transaction,
    scope,
    context,
    { id, ...input },
    async () => {
      await assertActorMembership(transaction, scope);
      await getActiveBoard(transaction, scope.organizationId, id);
      const now = context.now ?? new Date();
      const [updated] = await transaction
        .update(boards)
        .set({ ...input, updatedAt: now })
        .where(
          and(
            eq(boards.organizationId, scope.organizationId),
            eq(boards.id, id),
            isNull(boards.archivedAt),
            isNull(boards.deletedAt),
          ),
        )
        .returning();
      if (!updated) throw notFound();
      await writeAuditAndOutbox(transaction, scope, {
        action: "board.updated",
        aggregateType: "board",
        aggregateId: id,
        eventType: "board.updated",
        payload: { fields: Object.keys(input).sort() },
        now,
      });
      return updated;
    },
    (value) => restoreRowWithDates(value, standardDateFields),
  );
}

async function listItemAssignees(
  database: TrevvDatabase,
  scope: OrganizationScope,
  itemId: string,
) {
  await requireScopedWorkItem(database, scope.organizationId, itemId);
  return database
    .select({
      id: users.id,
      name: users.name,
      assignedAt: itemAssignees.assignedAt,
    })
    .from(itemAssignees)
    .innerJoin(
      users,
      and(eq(users.id, itemAssignees.userId), isNull(users.deletedAt)),
    )
    .where(
      and(
        eq(itemAssignees.organizationId, scope.organizationId),
        eq(itemAssignees.itemId, itemId),
      ),
    )
    .orderBy(asc(itemAssignees.assignedAt), asc(itemAssignees.userId));
}

async function listItemDependencies(
  database: TrevvDatabase,
  scope: OrganizationScope,
  itemId: string,
) {
  await requireScopedWorkItem(database, scope.organizationId, itemId);
  return database
    .select()
    .from(itemDependencies)
    .where(
      and(
        eq(itemDependencies.organizationId, scope.organizationId),
        eq(itemDependencies.itemId, itemId),
      ),
    )
    .orderBy(asc(itemDependencies.dependsOnItemId));
}

async function addItemDependency(
  transaction: TrevvDatabase,
  scope: OrganizationScope,
  itemId: string,
  expectedVersion: number,
  dependsOnItemId: string,
  relation: string,
  context: MutationContext,
) {
  return withIdempotency(
    transaction,
    scope,
    context,
    { itemId, expectedVersion, dependsOnItemId, relation },
    async () => {
      await assertActorMembership(transaction, scope);
      if (itemId === dependsOnItemId)
        throw new RepositoryError(
          "repository_unavailable",
          "A work item cannot depend on itself.",
        );
      const locked = await lockScopedWorkItems(transaction, scope, [
        itemId,
        dependsOnItemId,
      ]);
      const source = locked.get(itemId);
      if (!source || !locked.has(dependsOnItemId)) throw notFound();
      if (source.version !== expectedVersion)
        throw versionConflict(source.version);
      const [existing] = await transaction
        .select()
        .from(itemDependencies)
        .where(
          and(
            eq(itemDependencies.organizationId, scope.organizationId),
            eq(itemDependencies.itemId, itemId),
            eq(itemDependencies.dependsOnItemId, dependsOnItemId),
          ),
        )
        .limit(1);
      if (existing) {
        if (existing.relation !== relation)
          throw new RepositoryError(
            "repository_unavailable",
            "The dependency already exists with a different relation.",
          );
        return existing;
      }
      const cycle = await transaction.execute(sql`
        with recursive dependency_path(item_id) as (
          select depends_on_item_id
          from ${itemDependencies}
          where organization_id = ${scope.organizationId}
            and item_id = ${dependsOnItemId}
          union
          select dependency.depends_on_item_id
          from ${itemDependencies} dependency
          inner join dependency_path path
            on path.item_id = dependency.item_id
          where dependency.organization_id = ${scope.organizationId}
        )
        select item_id
        from dependency_path
        where item_id = ${itemId}
        limit 1
      `);
      if (cycle.length)
        throw new RepositoryError(
          "repository_unavailable",
          "The dependency would create a cycle.",
        );
      const now = context.now ?? new Date();
      const [created] = await transaction
        .insert(itemDependencies)
        .values({
          organizationId: scope.organizationId,
          itemId,
          dependsOnItemId,
          relation,
        })
        .onConflictDoNothing({
          target: [itemDependencies.itemId, itemDependencies.dependsOnItemId],
        })
        .returning();
      if (!created) throw versionConflict(source.version);
      await bumpLockedWorkItemVersion(
        transaction,
        scope.organizationId,
        itemId,
        expectedVersion,
        now,
      );
      await writeAuditAndOutbox(transaction, scope, {
        action: "work_item.dependency_added",
        aggregateType: "work_item",
        aggregateId: itemId,
        eventType: "item.dependency_added",
        payload: {
          dependsOnItemId,
          relation,
          previousVersion: expectedVersion,
          version: expectedVersion + 1,
        },
        now,
      });
      return created;
    },
  );
}

async function removeItemDependency(
  transaction: TrevvDatabase,
  scope: OrganizationScope,
  itemId: string,
  expectedVersion: number,
  dependsOnItemId: string,
  context: MutationContext,
) {
  return withIdempotency(
    transaction,
    scope,
    context,
    { itemId, expectedVersion, dependsOnItemId },
    async () => {
      await assertActorMembership(transaction, scope);
      const locked = await lockScopedWorkItems(transaction, scope, [
        itemId,
        dependsOnItemId,
      ]);
      const source = locked.get(itemId);
      if (!source || !locked.has(dependsOnItemId)) throw notFound();
      if (source.version !== expectedVersion)
        throw versionConflict(source.version);
      const removed = await transaction
        .delete(itemDependencies)
        .where(
          and(
            eq(itemDependencies.organizationId, scope.organizationId),
            eq(itemDependencies.itemId, itemId),
            eq(itemDependencies.dependsOnItemId, dependsOnItemId),
          ),
        )
        .returning({
          itemId: itemDependencies.itemId,
          dependsOnItemId: itemDependencies.dependsOnItemId,
        });
      if (!removed[0]) throw notFound();
      const now = context.now ?? new Date();
      await bumpLockedWorkItemVersion(
        transaction,
        scope.organizationId,
        itemId,
        expectedVersion,
        now,
      );
      await writeAuditAndOutbox(transaction, scope, {
        action: "work_item.dependency_removed",
        aggregateType: "work_item",
        aggregateId: itemId,
        eventType: "item.dependency_removed",
        payload: {
          dependsOnItemId,
          previousVersion: expectedVersion,
          version: expectedVersion + 1,
        },
        now,
      });
      return removed[0];
    },
  );
}

async function listComments(
  database: TrevvDatabase,
  scope: OrganizationScope,
  itemId: string,
) {
  await requireScopedWorkItem(database, scope.organizationId, itemId);
  return database
    .select()
    .from(comments)
    .where(
      and(
        eq(comments.organizationId, scope.organizationId),
        eq(comments.itemId, itemId),
        isNull(comments.deletedAt),
      ),
    )
    .orderBy(asc(comments.createdAt), asc(comments.id));
}

async function getComment(
  database: TrevvDatabase,
  scope: OrganizationScope,
  id: string,
) {
  const [row] = await database
    .select({ comment: comments })
    .from(comments)
    .innerJoin(
      workItems,
      and(
        eq(workItems.organizationId, comments.organizationId),
        eq(workItems.id, comments.itemId),
      ),
    )
    .where(
      and(
        eq(comments.organizationId, scope.organizationId),
        eq(comments.id, id),
        isNull(comments.deletedAt),
        workItemPredicate(scope.organizationId),
      ),
    )
    .limit(1);
  const comment = row?.comment;
  if (!comment) throw notFound();
  return comment;
}

async function createComment(
  transaction: TrevvDatabase,
  scope: OrganizationScope,
  input: { itemId: string; expectedItemVersion: number; body: string },
  context: MutationContext,
) {
  return withIdempotency(
    transaction,
    scope,
    context,
    input,
    async () => {
      await assertActorMembership(transaction, scope);
      const locked = await lockScopedWorkItems(transaction, scope, [
        input.itemId,
      ]);
      const item = locked.get(input.itemId);
      if (!item) throw notFound();
      if (item.version !== input.expectedItemVersion)
        throw versionConflict(item.version);
      const now = context.now ?? new Date();
      const [created] = await transaction
        .insert(comments)
        .values({
          id: crypto.randomUUID(),
          organizationId: scope.organizationId,
          itemId: input.itemId,
          authorId: scope.userId,
          body: input.body,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      if (!created)
        throw new RepositoryError(
          "repository_unavailable",
          "The comment could not be created.",
        );
      await bumpLockedWorkItemVersion(
        transaction,
        scope.organizationId,
        input.itemId,
        input.expectedItemVersion,
        now,
      );
      await writeAuditAndOutbox(transaction, scope, {
        action: "comment.created",
        aggregateType: "work_item",
        aggregateId: input.itemId,
        eventType: "comment.created",
        payload: {
          commentId: created.id,
          previousVersion: input.expectedItemVersion,
          version: input.expectedItemVersion + 1,
        },
        now,
      });
      return created;
    },
    (value) => restoreRowWithDates(value, standardDateFields),
  );
}

async function updateComment(
  transaction: TrevvDatabase,
  scope: OrganizationScope,
  id: string,
  expectedUpdatedAt: Date,
  expectedItemVersion: number,
  input: { body: string },
  context: MutationContext,
) {
  return withIdempotency(
    transaction,
    scope,
    context,
    { id, expectedUpdatedAt, expectedItemVersion, ...input },
    async () => {
      await assertActorMembership(transaction, scope);
      const existing = await getComment(transaction, scope, id);
      const locked = await lockScopedWorkItems(transaction, scope, [
        existing.itemId,
      ]);
      const item = locked.get(existing.itemId);
      if (!item) throw notFound();
      if (item.version !== expectedItemVersion)
        throw versionConflict(item.version);
      const now = context.now ?? new Date();
      const [updated] = await transaction
        .update(comments)
        .set({ body: input.body, editedAt: now, updatedAt: now })
        .where(
          and(
            eq(comments.organizationId, scope.organizationId),
            eq(comments.id, id),
            eq(comments.updatedAt, expectedUpdatedAt),
            isNull(comments.deletedAt),
          ),
        )
        .returning();
      if (!updated) {
        await getComment(transaction, scope, id);
        throw versionConflict();
      }
      await bumpLockedWorkItemVersion(
        transaction,
        scope.organizationId,
        updated.itemId,
        expectedItemVersion,
        now,
      );
      await writeAuditAndOutbox(transaction, scope, {
        action: "comment.updated",
        aggregateType: "work_item",
        aggregateId: updated.itemId,
        eventType: "comment.updated",
        payload: {
          commentId: id,
          previousVersion: expectedItemVersion,
          version: expectedItemVersion + 1,
        },
        now,
      });
      return updated;
    },
    (value) => restoreRowWithDates(value, commentDateFields),
  );
}

async function listWorkspaceUpdates(
  database: TrevvDatabase,
  scope: OrganizationScope,
  workspaceId?: string,
) {
  if (workspaceId)
    await assertWorkspace(database, scope.organizationId, workspaceId);
  return database
    .select()
    .from(workspaceUpdates)
    .where(
      and(
        eq(workspaceUpdates.organizationId, scope.organizationId),
        workspaceId ? eq(workspaceUpdates.workspaceId, workspaceId) : undefined,
        isNull(workspaceUpdates.deletedAt),
      ),
    )
    .orderBy(desc(workspaceUpdates.publishedAt), desc(workspaceUpdates.id));
}

async function getWorkspaceUpdate(
  database: TrevvDatabase,
  scope: OrganizationScope,
  id: string,
) {
  const [update] = await database
    .select()
    .from(workspaceUpdates)
    .where(
      and(
        eq(workspaceUpdates.organizationId, scope.organizationId),
        eq(workspaceUpdates.id, id),
        isNull(workspaceUpdates.deletedAt),
      ),
    )
    .limit(1);
  if (!update) throw notFound();
  return update;
}

async function createWorkspaceUpdate(
  transaction: TrevvDatabase,
  scope: OrganizationScope,
  input: CreateWorkspaceUpdateInput,
  context: MutationContext,
) {
  return withIdempotency(
    transaction,
    scope,
    context,
    input,
    async () => {
      await assertActorMembership(transaction, scope);
      await assertWorkspace(
        transaction,
        scope.organizationId,
        input.workspaceId,
      );
      const now = context.now ?? new Date();
      const [created] = await transaction
        .insert(workspaceUpdates)
        .values({
          id: crypto.randomUUID(),
          organizationId: scope.organizationId,
          workspaceId: input.workspaceId,
          authorId: scope.userId,
          wins: input.wins,
          currentPriority: input.currentPriority,
          blocker: input.blocker,
          nextMilestone: input.nextMilestone,
          helpNeeded: input.helpNeeded,
          note: input.note,
          publishedAt: input.publishedAt ?? now,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      if (!created)
        throw new RepositoryError(
          "repository_unavailable",
          "The Workspace update could not be created.",
        );
      await writeAuditAndOutbox(transaction, scope, {
        action: "workspace_update.created",
        aggregateType: "workspace",
        aggregateId: input.workspaceId,
        eventType: "workspace_update.created",
        payload: { updateId: created.id },
        now,
      });
      return created;
    },
    (value) => restoreRowWithDates(value, workspaceUpdateDateFields),
  );
}

async function updateWorkspaceUpdate(
  transaction: TrevvDatabase,
  scope: OrganizationScope,
  id: string,
  expectedUpdatedAt: Date,
  input: Partial<Omit<CreateWorkspaceUpdateInput, "workspaceId">>,
  context: MutationContext,
) {
  return withIdempotency(
    transaction,
    scope,
    context,
    { id, expectedUpdatedAt, ...input },
    async () => {
      await assertActorMembership(transaction, scope);
      const now = context.now ?? new Date();
      const [updated] = await transaction
        .update(workspaceUpdates)
        .set({ ...input, updatedAt: now })
        .where(
          and(
            eq(workspaceUpdates.organizationId, scope.organizationId),
            eq(workspaceUpdates.id, id),
            eq(workspaceUpdates.updatedAt, expectedUpdatedAt),
            isNull(workspaceUpdates.deletedAt),
          ),
        )
        .returning();
      if (!updated) {
        await getWorkspaceUpdate(transaction, scope, id);
        throw versionConflict();
      }
      await writeAuditAndOutbox(transaction, scope, {
        action: "workspace_update.updated",
        aggregateType: "workspace",
        aggregateId: updated.workspaceId,
        eventType: "workspace_update.updated",
        payload: { fields: Object.keys(input).sort(), updateId: id },
        now,
      });
      return updated;
    },
    (value) => restoreRowWithDates(value, workspaceUpdateDateFields),
  );
}

async function listTypedWorkItems(
  database: TrevvDatabase,
  scope: OrganizationScope,
  itemType: "decision" | "approval",
  portfolioId?: string,
) {
  if (portfolioId)
    await assertPortfolio(database, scope.organizationId, portfolioId);
  const rows = await database
    .select({ item: workItems })
    .from(workItems)
    .innerJoin(
      workspaces,
      and(
        eq(workspaces.organizationId, workItems.organizationId),
        eq(workspaces.id, workItems.workspaceId),
        isNull(workspaces.deletedAt),
      ),
    )
    .where(
      and(
        workItemPredicate(scope.organizationId),
        eq(workItems.itemType, itemType),
        portfolioId ? eq(workspaces.portfolioId, portfolioId) : undefined,
      ),
    )
    .orderBy(desc(workItems.updatedAt), asc(workItems.id));
  return hydrateWorkItems(
    database,
    scope.organizationId,
    rows.map(({ item }) => item),
  );
}

async function updateTypedWorkItemState(
  transaction: TrevvDatabase,
  scope: OrganizationScope,
  itemType: "decision" | "approval",
  itemId: string,
  expectedVersion: number,
  input: Pick<UpdateWorkItemInput, "decisionState" | "approvalState">,
  context: MutationContext,
) {
  const item = await requireScopedWorkItem(
    transaction,
    scope.organizationId,
    itemId,
  );
  if (item.itemType !== itemType) throw notFound();
  return updateWorkItem(
    transaction,
    scope,
    itemId,
    expectedVersion,
    input,
    context,
  );
}

async function listDecisionOutcomes(
  database: TrevvDatabase,
  scope: OrganizationScope,
  portfolioId?: string,
) {
  if (portfolioId)
    await assertPortfolio(database, scope.organizationId, portfolioId);
  return database
    .select()
    .from(decisionOutcomes)
    .where(
      and(
        eq(decisionOutcomes.organizationId, scope.organizationId),
        portfolioId ? eq(decisionOutcomes.portfolioId, portfolioId) : undefined,
      ),
    )
    .orderBy(desc(decisionOutcomes.recordedAt), desc(decisionOutcomes.id));
}

async function getDecisionOutcome(
  database: TrevvDatabase,
  scope: OrganizationScope,
  id: string,
) {
  const [outcome] = await database
    .select()
    .from(decisionOutcomes)
    .where(
      and(
        eq(decisionOutcomes.organizationId, scope.organizationId),
        eq(decisionOutcomes.id, id),
      ),
    )
    .limit(1);
  if (!outcome) throw notFound();
  return outcome;
}

async function recordDecisionOutcome(
  transaction: TrevvDatabase,
  scope: OrganizationScope,
  input: CreateDecisionOutcomeInput,
  context: MutationContext,
) {
  return withIdempotency(
    transaction,
    scope,
    context,
    input,
    async () => {
      await assertActorMembership(transaction, scope);
      const item = await requireScopedWorkItem(
        transaction,
        scope.organizationId,
        input.decisionItemId,
      );
      if (item.itemType !== "decision") throw notFound();
      await assertPortfolioWorkspace(
        transaction,
        scope.organizationId,
        input.portfolioId,
        item.workspaceId,
      );
      const now = context.now ?? new Date();
      const [created] = await transaction
        .insert(decisionOutcomes)
        .values({
          id: crypto.randomUUID(),
          organizationId: scope.organizationId,
          portfolioId: input.portfolioId,
          workspaceId: item.workspaceId,
          decisionItemId: input.decisionItemId,
          outcome: input.outcome,
          learning: input.learning,
          wouldRepeat: input.wouldRepeat,
          recordedBy: scope.userId,
          recordedAt: input.recordedAt ?? now,
          createdAt: now,
        })
        .returning();
      if (!created)
        throw new RepositoryError(
          "repository_unavailable",
          "The decision outcome could not be recorded.",
        );
      await writeAuditAndOutbox(transaction, scope, {
        action: "decision.outcome_recorded",
        aggregateType: "work_item",
        aggregateId: input.decisionItemId,
        eventType: "decision.outcome_recorded",
        payload: {
          outcomeId: created.id,
          portfolioId: input.portfolioId,
          workspaceId: item.workspaceId,
        },
        now,
      });
      return created;
    },
    (value) => restoreRowWithDates(value, decisionOutcomeDateFields),
  );
}

async function listReviewRituals(
  database: TrevvDatabase,
  scope: OrganizationScope,
  portfolioId?: string,
) {
  if (portfolioId)
    await assertPortfolio(database, scope.organizationId, portfolioId);
  return database
    .select()
    .from(reviewRituals)
    .where(
      and(
        eq(reviewRituals.organizationId, scope.organizationId),
        portfolioId ? eq(reviewRituals.portfolioId, portfolioId) : undefined,
        isNull(reviewRituals.deletedAt),
      ),
    )
    .orderBy(asc(reviewRituals.nextDueAt), asc(reviewRituals.id));
}

async function getReviewRitual(
  database: TrevvDatabase,
  scope: OrganizationScope,
  id: string,
) {
  const [ritual] = await database
    .select()
    .from(reviewRituals)
    .where(
      and(
        eq(reviewRituals.organizationId, scope.organizationId),
        eq(reviewRituals.id, id),
        isNull(reviewRituals.deletedAt),
      ),
    )
    .limit(1);
  if (!ritual) throw notFound();
  return ritual;
}

async function createReviewRitual(
  transaction: TrevvDatabase,
  scope: OrganizationScope,
  input: CreateReviewRitualInput,
  context: MutationContext,
) {
  return withIdempotency(
    transaction,
    scope,
    context,
    input,
    async () => {
      await assertActorMembership(transaction, scope);
      if (input.workspaceId)
        await assertPortfolioWorkspace(
          transaction,
          scope.organizationId,
          input.portfolioId,
          input.workspaceId,
        );
      else
        await assertPortfolio(
          transaction,
          scope.organizationId,
          input.portfolioId,
        );
      const now = context.now ?? new Date();
      const [created] = await transaction
        .insert(reviewRituals)
        .values({
          id: crypto.randomUUID(),
          organizationId: scope.organizationId,
          portfolioId: input.portfolioId,
          workspaceId: input.workspaceId,
          type: input.type,
          cadence: input.cadence,
          enabled: input.enabled,
          nextDueAt: input.nextDueAt,
          reminderEnabled: input.reminderEnabled,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      if (!created)
        throw new RepositoryError(
          "repository_unavailable",
          "The review ritual could not be created.",
        );
      await writeAuditAndOutbox(transaction, scope, {
        action: "review_ritual.created",
        aggregateType: "review_ritual",
        aggregateId: created.id,
        eventType: "review_ritual.created",
        payload: {
          portfolioId: input.portfolioId,
          workspaceId: input.workspaceId ?? null,
        },
        now,
      });
      return created;
    },
    (value) => restoreRowWithDates(value, reviewRitualDateFields),
  );
}

async function updateReviewRitual(
  transaction: TrevvDatabase,
  scope: OrganizationScope,
  id: string,
  expectedUpdatedAt: Date,
  input: UpdateReviewRitualInput,
  context: MutationContext,
) {
  return withIdempotency(
    transaction,
    scope,
    context,
    { id, expectedUpdatedAt, ...input },
    async () => {
      await assertActorMembership(transaction, scope);
      const now = context.now ?? new Date();
      const [updated] = await transaction
        .update(reviewRituals)
        .set({ ...input, updatedAt: now })
        .where(
          and(
            eq(reviewRituals.organizationId, scope.organizationId),
            eq(reviewRituals.id, id),
            eq(reviewRituals.updatedAt, expectedUpdatedAt),
            isNull(reviewRituals.deletedAt),
          ),
        )
        .returning();
      if (!updated) {
        await getReviewRitual(transaction, scope, id);
        throw versionConflict();
      }
      await writeAuditAndOutbox(transaction, scope, {
        action: "review_ritual.updated",
        aggregateType: "review_ritual",
        aggregateId: id,
        eventType: "review_ritual.updated",
        payload: { fields: Object.keys(input).sort() },
        now,
      });
      return updated;
    },
    (value) => restoreRowWithDates(value, reviewRitualDateFields),
  );
}

async function listSnapshots(
  database: TrevvDatabase,
  scope: OrganizationScope,
  filters?: { portfolioId?: string; workspaceId?: string },
) {
  if (filters?.workspaceId && filters.portfolioId)
    await assertPortfolioWorkspace(
      database,
      scope.organizationId,
      filters.portfolioId,
      filters.workspaceId,
    );
  else if (filters?.workspaceId)
    await assertWorkspace(database, scope.organizationId, filters.workspaceId);
  else if (filters?.portfolioId)
    await assertPortfolio(database, scope.organizationId, filters.portfolioId);
  return database
    .select()
    .from(workspaceSnapshots)
    .where(
      and(
        eq(workspaceSnapshots.organizationId, scope.organizationId),
        filters?.portfolioId
          ? eq(workspaceSnapshots.portfolioId, filters.portfolioId)
          : undefined,
        filters?.workspaceId
          ? eq(workspaceSnapshots.workspaceId, filters.workspaceId)
          : undefined,
      ),
    )
    .orderBy(desc(workspaceSnapshots.capturedAt), desc(workspaceSnapshots.id));
}

async function getSnapshot(
  database: TrevvDatabase,
  scope: OrganizationScope,
  id: string,
) {
  const [snapshot] = await database
    .select()
    .from(workspaceSnapshots)
    .where(
      and(
        eq(workspaceSnapshots.organizationId, scope.organizationId),
        eq(workspaceSnapshots.id, id),
      ),
    )
    .limit(1);
  if (!snapshot) throw notFound();
  return snapshot;
}

async function createSnapshot(
  transaction: TrevvDatabase,
  scope: OrganizationScope,
  input: CreateWorkspaceSnapshotInput,
  context: MutationContext,
) {
  return withIdempotency(
    transaction,
    scope,
    context,
    input,
    async () => {
      await assertActorMembership(transaction, scope);
      await assertPortfolioWorkspace(
        transaction,
        scope.organizationId,
        input.portfolioId,
        input.workspaceId,
      );
      if (input.nextMilestoneId) {
        const milestone = await requireScopedWorkItem(
          transaction,
          scope.organizationId,
          input.nextMilestoneId,
        );
        if (milestone.workspaceId !== input.workspaceId) throw notFound();
      }
      const now = context.now ?? new Date();
      const [created] = await transaction
        .insert(workspaceSnapshots)
        .values({
          id: crypto.randomUUID(),
          organizationId: scope.organizationId,
          portfolioId: input.portfolioId,
          workspaceId: input.workspaceId,
          capturedAt: input.capturedAt ?? now,
          health: input.health,
          progress: input.progress,
          openCount: input.openCount,
          overdueCount: input.overdueCount,
          blockedCount: input.blockedCount,
          decisionCount: input.decisionCount,
          attentionCount: input.attentionCount,
          nextMilestoneId: input.nextMilestoneId,
          nextMilestoneStatus: input.nextMilestoneStatus,
          latestUpdateAt: input.latestUpdateAt,
          source: input.source,
          createdAt: now,
        })
        .returning();
      if (!created)
        throw new RepositoryError(
          "repository_unavailable",
          "The Workspace snapshot could not be created.",
        );
      await writeAuditAndOutbox(transaction, scope, {
        action: "workspace_snapshot.created",
        aggregateType: "workspace",
        aggregateId: input.workspaceId,
        eventType: "workspace_snapshot.created",
        payload: { snapshotId: created.id, source: input.source },
        now,
      });
      return created;
    },
    (value) => restoreRowWithDates(value, workspaceSnapshotDateFields),
  );
}

async function resolveSession(
  database: TrevvDatabase,
  scope: OrganizationScope,
) {
  const [resolved] = await database
    .select({
      organization: organizations,
      user: users,
      membership: memberships,
    })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        eq(memberships.organizationId, scope.organizationId),
        eq(memberships.userId, scope.userId),
        isNull(memberships.archivedAt),
        isNull(memberships.deletedAt),
        isNull(organizations.archivedAt),
        isNull(organizations.deletedAt),
        isNull(users.deletedAt),
      ),
    )
    .limit(1);
  if (!resolved) throw notFound();

  const [allPortfolios, allWorkspaces] = await Promise.all([
    database
      .select({ id: portfolios.id })
      .from(portfolios)
      .where(
        and(
          eq(portfolios.organizationId, scope.organizationId),
          isNull(portfolios.archivedAt),
          isNull(portfolios.deletedAt),
        ),
      )
      .orderBy(desc(portfolios.isDefault), asc(portfolios.ordering)),
    database
      .select({
        id: workspaces.id,
        portfolioId: workspaces.portfolioId,
        leadUserId: workspaces.leadUserId,
      })
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
          eq(workspaces.organizationId, scope.organizationId),
          isNull(workspaces.archivedAt),
          isNull(workspaces.deletedAt),
          isNull(portfolios.archivedAt),
          isNull(portfolios.deletedAt),
        ),
      )
      .orderBy(asc(workspaces.ordering), asc(workspaces.id)),
  ]);
  if (["owner", "admin"].includes(resolved.membership.role))
    return {
      ...resolved,
      portfolioIds: allPortfolios.map(({ id }) => id),
      managedPortfolioIds: allPortfolios.map(({ id }) => id),
      workspaceIds: allWorkspaces.map(({ id }) => id),
      managedWorkspaceIds: allWorkspaces.map(({ id }) => id),
    };

  const [portfolioAccess, workspaceAccess] = await Promise.all([
    database
      .select({
        portfolioId: databaseSchema.portfolioMembers.portfolioId,
        role: databaseSchema.portfolioMembers.role,
      })
      .from(databaseSchema.portfolioMembers)
      .where(
        and(
          eq(
            databaseSchema.portfolioMembers.organizationId,
            scope.organizationId,
          ),
          eq(databaseSchema.portfolioMembers.userId, scope.userId),
          isNull(databaseSchema.portfolioMembers.archivedAt),
          isNull(databaseSchema.portfolioMembers.deletedAt),
        ),
      ),
    database
      .select({
        workspaceId: databaseSchema.workspaceMembers.workspaceId,
        canManage: databaseSchema.workspaceMembers.canManage,
      })
      .from(databaseSchema.workspaceMembers)
      .where(
        and(
          eq(
            databaseSchema.workspaceMembers.organizationId,
            scope.organizationId,
          ),
          eq(databaseSchema.workspaceMembers.userId, scope.userId),
          isNull(databaseSchema.workspaceMembers.archivedAt),
          isNull(databaseSchema.workspaceMembers.deletedAt),
        ),
      ),
  ]);
  const portfolioIds = new Set(
    portfolioAccess.map(({ portfolioId }) => portfolioId),
  );
  const directWorkspaceIds = new Set(
    workspaceAccess.map(({ workspaceId }) => workspaceId),
  );
  const activeWorkspaceIds = new Set(allWorkspaces.map(({ id }) => id));
  const leadWorkspaceIds = new Set(
    allWorkspaces
      .filter(({ leadUserId }) => leadUserId === scope.userId)
      .map(({ id }) => id),
  );
  const workspaceIds = allWorkspaces
    .filter(
      ({ id, portfolioId }) =>
        directWorkspaceIds.has(id) ||
        portfolioIds.has(portfolioId) ||
        leadWorkspaceIds.has(id),
    )
    .map(({ id }) => id);
  const accessibleWorkspaceIds = new Set(workspaceIds);
  const managedPortfolioIds = new Set(
    portfolioAccess
      .filter(({ role }) => ["owner", "admin", "workspace_lead"].includes(role))
      .map(({ portfolioId }) => portfolioId),
  );
  return {
    ...resolved,
    portfolioIds: allPortfolios
      .filter(
        ({ id }) =>
          portfolioIds.has(id) ||
          allWorkspaces.some(
            ({ id: workspaceId, portfolioId }) =>
              portfolioId === id && accessibleWorkspaceIds.has(workspaceId),
          ),
      )
      .map(({ id }) => id),
    managedPortfolioIds: allPortfolios
      .filter(({ id }) => managedPortfolioIds.has(id))
      .map(({ id }) => id),
    workspaceIds,
    managedWorkspaceIds: [
      ...new Set([
        ...workspaceAccess
          .filter(
            ({ canManage, workspaceId }) =>
              canManage && activeWorkspaceIds.has(workspaceId),
          )
          .map(({ workspaceId }) => workspaceId),
        ...allWorkspaces
          .filter(({ portfolioId }) => managedPortfolioIds.has(portfolioId))
          .map(({ id }) => id),
        ...leadWorkspaceIds,
      ]),
    ],
  };
}

async function hydrateWorkspaces(
  database: TrevvDatabase,
  organizationId: string,
  rows: Array<typeof workspaces.$inferSelect>,
): Promise<WorkspaceProjection[]> {
  if (!rows.length) return [];
  const workspaceIds = rows.map(({ id }) => id);
  const leadIds = [
    ...new Set(
      rows
        .map(({ leadUserId }) => leadUserId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const [leadRows, metricRows, updateRows] = await Promise.all([
    leadIds.length
      ? database
          .select({ id: users.id, name: users.name })
          .from(users)
          .innerJoin(
            memberships,
            and(
              eq(memberships.userId, users.id),
              eq(memberships.organizationId, organizationId),
              isNull(memberships.deletedAt),
            ),
          )
          .where(and(inArray(users.id, leadIds), isNull(users.deletedAt)))
      : Promise.resolve([]),
    database
      .select()
      .from(databaseSchema.workspaceMetrics)
      .where(
        and(
          eq(databaseSchema.workspaceMetrics.organizationId, organizationId),
          inArray(databaseSchema.workspaceMetrics.workspaceId, workspaceIds),
          isNull(databaseSchema.workspaceMetrics.deletedAt),
        ),
      )
      .orderBy(
        asc(databaseSchema.workspaceMetrics.workspaceId),
        asc(databaseSchema.workspaceMetrics.name),
      ),
    database
      .select()
      .from(workspaceUpdates)
      .where(
        and(
          eq(workspaceUpdates.organizationId, organizationId),
          inArray(workspaceUpdates.workspaceId, workspaceIds),
          isNull(workspaceUpdates.deletedAt),
        ),
      )
      .orderBy(desc(workspaceUpdates.publishedAt), desc(workspaceUpdates.id)),
  ]);
  const leads = new Map(leadRows.map((lead) => [lead.id, lead]));
  const metricsByWorkspace = new Map<
    string,
    Array<(typeof metricRows)[number]>
  >();
  for (const metric of metricRows) {
    const current = metricsByWorkspace.get(metric.workspaceId) ?? [];
    current.push(metric);
    metricsByWorkspace.set(metric.workspaceId, current);
  }
  const latestByWorkspace = new Map<string, (typeof updateRows)[number]>();
  for (const update of updateRows)
    if (!latestByWorkspace.has(update.workspaceId))
      latestByWorkspace.set(update.workspaceId, update);

  return rows.map((workspace) => {
    const lead = workspace.leadUserId
      ? leads.get(workspace.leadUserId)
      : undefined;
    const latest = latestByWorkspace.get(workspace.id);
    return {
      id: workspace.id,
      organizationId: workspace.organizationId,
      portfolioId: workspace.portfolioId,
      slug: workspace.slug,
      name: workspace.name,
      description: workspace.description,
      icon: workspace.icon,
      accent: workspace.accentColor,
      type: workspace.type,
      stage: workspace.lifecycleStage,
      health: workspace.health,
      healthNote: workspace.healthNote,
      priority: workspace.currentPriority,
      lead: lead
        ? { id: lead.id, name: lead.name, initials: initials(lead.name) }
        : null,
      nextMilestone: {
        title: workspace.nextMilestoneSummary,
        date: workspace.nextMilestoneDate,
      },
      latestUpdate: latest
        ? {
            id: latest.id,
            text: latest.note || latest.wins,
            date: latest.publishedAt.toISOString(),
          }
        : null,
      metrics: (metricsByWorkspace.get(workspace.id) ?? []).map((metric) => ({
        id: metric.id,
        label: metric.name,
        unit: metric.unit,
        value: metric.currentValue,
        target: metric.targetValue,
      })),
      versionTag: workspace.updatedAt.toISOString(),
    };
  });
}

function workItemPredicate(
  organizationId: string,
  workspaceId?: string,
  boardId?: string,
) {
  return and(
    eq(workItems.organizationId, organizationId),
    isNull(workItems.archivedAt),
    isNull(workItems.deletedAt),
    workspaceId ? eq(workItems.workspaceId, workspaceId) : undefined,
    boardId ? eq(workItems.boardId, boardId) : undefined,
    sql`exists (
      select 1
      from ${boards}
      inner join ${workspaces}
        on ${workspaces.organizationId} = ${boards.organizationId}
        and ${workspaces.id} = ${boards.workspaceId}
      inner join ${portfolios}
        on ${portfolios.organizationId} = ${workspaces.organizationId}
        and ${portfolios.id} = ${workspaces.portfolioId}
      where ${boards.organizationId} = ${workItems.organizationId}
        and ${boards.id} = ${workItems.boardId}
        and ${boards.workspaceId} = ${workItems.workspaceId}
        and ${boards.archivedAt} is null
        and ${boards.deletedAt} is null
        and ${workspaces.archivedAt} is null
        and ${workspaces.deletedAt} is null
        and ${portfolios.archivedAt} is null
        and ${portfolios.deletedAt} is null
    )`,
  );
}

async function hydrateWorkItems(
  database: TrevvDatabase,
  organizationId: string,
  items: Array<typeof workItems.$inferSelect>,
): Promise<WorkItemProjection[]> {
  if (!items.length) return [];
  const itemIds = items.map(({ id }) => id);
  const assignees = await database
    .select({
      itemId: itemAssignees.itemId,
      userId: itemAssignees.userId,
      name: users.name,
    })
    .from(itemAssignees)
    .innerJoin(users, eq(users.id, itemAssignees.userId))
    .where(
      and(
        eq(itemAssignees.organizationId, organizationId),
        inArray(itemAssignees.itemId, itemIds),
        isNull(users.deletedAt),
      ),
    )
    .orderBy(asc(itemAssignees.assignedAt), asc(itemAssignees.userId));
  const byItem = new Map<string, Array<{ userId: string; name: string }>>();
  for (const assignee of assignees) {
    const current = byItem.get(assignee.itemId) ?? [];
    current.push({ userId: assignee.userId, name: assignee.name });
    byItem.set(assignee.itemId, current);
  }

  return items.map((item) => {
    const assigned = byItem.get(item.id) ?? [];
    const typeData = isRecord(item.typeData) ? item.typeData : {};
    const approvalState = approvalStateValue(typeData.approvalState);
    const decisionState = decisionStateValue(typeData.decisionState);
    assertLifecycleStatesForType(item.itemType, approvalState, decisionState);
    return {
      id: item.id,
      workspaceId: item.workspaceId,
      boardId: item.boardId,
      title: item.title,
      description: item.description,
      type: item.itemType,
      priority: item.priority,
      status: item.status,
      ...(item.dueDate ? { dueDate: item.dueDate } : {}),
      ...(assigned[0]?.name ? { assignee: assigned[0].name } : {}),
      assigneeIds: assigned.map(({ userId }) => userId),
      assignees: assigned.map(({ userId, name }) => ({ id: userId, name })),
      ...(approvalState ? { approvalState } : {}),
      ...(decisionState ? { decisionState } : {}),
      version: item.version,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  });
}

async function createWorkItem(
  transaction: TrevvDatabase,
  scope: OrganizationScope,
  input: CreateWorkItemInput,
  context: MutationContext,
): Promise<MutationResult<WorkItemProjection>> {
  return withIdempotency(transaction, scope, context, input, async () => {
    await assertActorMembership(transaction, scope);
    assertLifecycleStatesForType(
      input.type,
      input.approvalState,
      input.decisionState,
    );
    await assertBoardInWorkspace(
      transaction,
      scope.organizationId,
      input.workspaceId,
      input.boardId,
    );
    await assertOrganizationUsers(
      transaction,
      scope.organizationId,
      input.assigneeIds ?? [],
    );
    const now = context.now ?? new Date();
    const id = input.id ?? crypto.randomUUID();
    const typeData = {
      ...(input.approvalState ? { approvalState: input.approvalState } : {}),
      ...(input.decisionState ? { decisionState: input.decisionState } : {}),
    };
    await transaction.insert(workItems).values({
      id,
      organizationId: scope.organizationId,
      workspaceId: input.workspaceId,
      boardId: input.boardId,
      title: input.title,
      description: input.description ?? "",
      itemType: input.type,
      priority: input.priority,
      status: input.status,
      dueDate: input.dueDate,
      creatorId: scope.userId,
      typeData,
      createdAt: now,
      updatedAt: now,
    });
    if (input.assigneeIds?.length)
      await transaction.insert(itemAssignees).values(
        input.assigneeIds.map((userId) => ({
          organizationId: scope.organizationId,
          itemId: id,
          userId,
          assignedAt: now,
        })),
      );
    await writeAuditAndOutbox(transaction, scope, {
      action: "work_item.created",
      aggregateType: "work_item",
      aggregateId: id,
      eventType: "item.created",
      payload: {
        workspaceId: input.workspaceId,
        boardId: input.boardId,
        version: 0,
      },
      now,
    });
    return getScopedWorkItem(transaction, scope.organizationId, id);
  });
}

async function updateWorkItem(
  transaction: TrevvDatabase,
  scope: OrganizationScope,
  id: string,
  expectedVersion: number,
  input: UpdateWorkItemInput,
  context: MutationContext,
): Promise<MutationResult<WorkItemProjection>> {
  return withIdempotency(
    transaction,
    scope,
    context,
    { id, expectedVersion, ...input },
    async () => {
      await assertActorMembership(transaction, scope);
      const existing = await findScopedWorkItemRow(
        transaction,
        scope.organizationId,
        id,
      );
      if (!existing) throw notFound();
      assertLifecycleStatesForType(
        existing.itemType,
        input.approvalState ?? undefined,
        input.decisionState ?? undefined,
      );
      const now = context.now ?? new Date();
      const existingTypeData = isRecord(existing.typeData)
        ? existing.typeData
        : {};
      const typeData = { ...existingTypeData };
      if (input.approvalState !== undefined) {
        if (input.approvalState === null) delete typeData.approvalState;
        else typeData.approvalState = input.approvalState;
      }
      if (input.decisionState !== undefined) {
        if (input.decisionState === null) delete typeData.decisionState;
        else typeData.decisionState = input.decisionState;
      }
      const update: Partial<typeof workItems.$inferInsert> = {
        updatedAt: now,
      };
      if (input.title !== undefined) update.title = input.title;
      if (input.description !== undefined)
        update.description = input.description;
      if (input.status !== undefined) update.status = input.status;
      if (input.priority !== undefined) update.priority = input.priority;
      if (input.dueDate !== undefined) update.dueDate = input.dueDate ?? null;
      if (
        input.approvalState !== undefined ||
        input.decisionState !== undefined
      )
        update.typeData = typeData;
      const changed = await transaction
        .update(workItems)
        .set({ ...update, version: sql`${workItems.version} + 1` })
        .where(
          and(
            workItemPredicate(scope.organizationId),
            eq(workItems.id, id),
            eq(workItems.version, expectedVersion),
          ),
        )
        .returning({ id: workItems.id });
      if (!changed.length) {
        const current = await findScopedWorkItemRow(
          transaction,
          scope.organizationId,
          id,
        );
        if (!current) throw notFound();
        throw versionConflict(current.version);
      }
      if (input.assigneeIds !== undefined) {
        await assertOrganizationUsers(
          transaction,
          scope.organizationId,
          input.assigneeIds,
        );
        await transaction
          .delete(itemAssignees)
          .where(
            and(
              eq(itemAssignees.organizationId, scope.organizationId),
              eq(itemAssignees.itemId, id),
            ),
          );
        if (input.assigneeIds.length)
          await transaction.insert(itemAssignees).values(
            input.assigneeIds.map((userId) => ({
              organizationId: scope.organizationId,
              itemId: id,
              userId,
              assignedAt: now,
            })),
          );
      }
      await writeAuditAndOutbox(transaction, scope, {
        action: "work_item.updated",
        aggregateType: "work_item",
        aggregateId: id,
        eventType: "item.updated",
        payload: {
          previousVersion: expectedVersion,
          version: expectedVersion + 1,
          fields: Object.keys(input).sort(),
        },
        now,
      });
      return getScopedWorkItem(transaction, scope.organizationId, id);
    },
  );
}

async function listActiveAttention(
  database: TrevvDatabase,
  scope: OrganizationScope,
  filters?: { portfolioId?: string; workspaceId?: string; now?: Date },
) {
  const now = filters?.now ?? new Date();
  return database
    .select()
    .from(attentionSignals)
    .where(
      and(
        eq(attentionSignals.organizationId, scope.organizationId),
        isNull(attentionSignals.resolvedAt),
        isNull(attentionSignals.dismissedAt),
        or(
          isNull(attentionSignals.snoozedUntil),
          lte(attentionSignals.snoozedUntil, now),
        ),
        filters?.portfolioId
          ? eq(attentionSignals.portfolioId, filters.portfolioId)
          : undefined,
        filters?.workspaceId
          ? eq(attentionSignals.workspaceId, filters.workspaceId)
          : undefined,
      ),
    )
    .orderBy(desc(attentionSignals.impact), desc(attentionSignals.urgency));
}

async function getAttention(
  database: TrevvDatabase,
  scope: OrganizationScope,
  id: string,
) {
  const [signal] = await database
    .select()
    .from(attentionSignals)
    .where(
      and(
        eq(attentionSignals.organizationId, scope.organizationId),
        eq(attentionSignals.id, id),
      ),
    )
    .limit(1);
  if (!signal) throw notFound();
  return signal;
}

async function actOnAttention(
  transaction: TrevvDatabase,
  scope: OrganizationScope,
  id: string,
  expectedVersion: number,
  input: AttentionActionInput,
  context: MutationContext,
) {
  return withIdempotency(
    transaction,
    scope,
    context,
    { id, expectedVersion, ...input },
    async () => {
      await assertActorMembership(transaction, scope);
      const [existing] = await transaction
        .select()
        .from(attentionSignals)
        .where(
          and(
            eq(attentionSignals.organizationId, scope.organizationId),
            eq(attentionSignals.id, id),
            isNull(attentionSignals.resolvedAt),
            isNull(attentionSignals.dismissedAt),
          ),
        )
        .limit(1);
      if (!existing) throw notFound();
      const now = context.now ?? new Date();
      const changed = await transaction
        .update(attentionSignals)
        .set({
          ...(input.action === "resolve" ? { resolvedAt: now } : {}),
          ...(input.action === "dismiss" ? { dismissedAt: now } : {}),
          ...(input.action === "snooze"
            ? { snoozedUntil: input.snoozedUntil }
            : {}),
          ...(input.reason ? { actionReason: input.reason } : {}),
          updatedAt: now,
          version: sql`${attentionSignals.version} + 1`,
        })
        .where(
          and(
            eq(attentionSignals.organizationId, scope.organizationId),
            eq(attentionSignals.id, id),
            eq(attentionSignals.version, expectedVersion),
            isNull(attentionSignals.resolvedAt),
            isNull(attentionSignals.dismissedAt),
          ),
        )
        .returning();
      const [updated] = changed;
      if (!updated) {
        const current = await getAttention(transaction, scope, id);
        throw new RepositoryError(
          "version_conflict",
          "The attention signal changed before this action was committed.",
          { currentVersion: current.version },
        );
      }
      await writeAuditAndOutbox(transaction, scope, {
        action: `attention.${input.action}`,
        aggregateType: "attention_signal",
        aggregateId: id,
        eventType: "attention.actioned",
        payload: {
          action: input.action,
          previousVersion: expectedVersion,
          version: expectedVersion + 1,
        },
        now,
      });
      return updated;
    },
    restoreAttention,
  );
}

async function listActiveWaiting(
  database: TrevvDatabase,
  scope: OrganizationScope,
  workspaceId?: string,
) {
  const rows = await database
    .select()
    .from(waitingStates)
    .where(
      and(
        eq(waitingStates.organizationId, scope.organizationId),
        isNull(waitingStates.resolvedAt),
        isNull(waitingStates.deletedAt),
        workspaceId ? eq(waitingStates.workspaceId, workspaceId) : undefined,
      ),
    )
    .orderBy(asc(waitingStates.nextFollowUp), asc(waitingStates.id));
  return hydrateWaiting(database, scope.organizationId, rows);
}

async function getWaiting(
  database: TrevvDatabase,
  scope: OrganizationScope,
  id: string,
) {
  const [waiting] = await database
    .select()
    .from(waitingStates)
    .where(
      and(
        eq(waitingStates.organizationId, scope.organizationId),
        eq(waitingStates.id, id),
        isNull(waitingStates.deletedAt),
      ),
    )
    .limit(1);
  if (!waiting) throw notFound();
  return getWaitingProjection(database, scope.organizationId, waiting);
}

async function actOnWaiting(
  transaction: TrevvDatabase,
  scope: OrganizationScope,
  id: string,
  expectedVersion: number,
  input: WaitingActionInput,
  context: MutationContext,
) {
  if (
    input.action === "reschedule" &&
    (!input.nextFollowUp || !input.nextFollowUp.trim())
  )
    throw new RepositoryError(
      "repository_unavailable",
      "Rescheduling requires the next follow-up date.",
    );
  return withIdempotency(
    transaction,
    scope,
    context,
    { id, expectedVersion, ...input },
    async () => {
      await assertActorMembership(transaction, scope);
      const [existing] = await transaction
        .select()
        .from(waitingStates)
        .where(
          and(
            eq(waitingStates.organizationId, scope.organizationId),
            eq(waitingStates.id, id),
            isNull(waitingStates.resolvedAt),
            isNull(waitingStates.deletedAt),
          ),
        )
        .limit(1);
      if (!existing) throw notFound();
      const now = context.now ?? new Date();
      const changed = await transaction
        .update(waitingStates)
        .set({
          ...(input.action === "resolve" ? { resolvedAt: now } : {}),
          ...(input.nextFollowUp ? { nextFollowUp: input.nextFollowUp } : {}),
          ...(input.note ? { waitingNote: input.note } : {}),
          updatedAt: now,
          version: sql`${waitingStates.version} + 1`,
        })
        .where(
          and(
            eq(waitingStates.organizationId, scope.organizationId),
            eq(waitingStates.id, id),
            eq(waitingStates.version, expectedVersion),
            isNull(waitingStates.resolvedAt),
            isNull(waitingStates.deletedAt),
          ),
        )
        .returning();
      const [updated] = changed;
      if (!updated) {
        const [current] = await transaction
          .select({ version: waitingStates.version })
          .from(waitingStates)
          .where(
            and(
              eq(waitingStates.organizationId, scope.organizationId),
              eq(waitingStates.id, id),
              isNull(waitingStates.deletedAt),
            ),
          )
          .limit(1);
        if (!current) throw notFound();
        throw new RepositoryError(
          "version_conflict",
          "The waiting state changed before this action was committed.",
          { currentVersion: current.version },
        );
      }
      await writeAuditAndOutbox(transaction, scope, {
        action: `waiting.${input.action}`,
        aggregateType: "waiting_state",
        aggregateId: id,
        eventType: "waiting.actioned",
        payload: {
          action: input.action,
          previousVersion: expectedVersion,
          version: expectedVersion + 1,
        },
        now,
      });
      return getWaitingProjection(transaction, scope.organizationId, updated);
    },
  );
}

async function getWaitingProjection(
  database: TrevvDatabase,
  organizationId: string,
  row: typeof waitingStates.$inferSelect,
) {
  const [projection] = await hydrateWaiting(database, organizationId, [row]);
  if (!projection) throw notFound();
  return projection;
}

async function hydrateWaiting(
  database: TrevvDatabase,
  organizationId: string,
  rows: Array<typeof waitingStates.$inferSelect>,
): Promise<WaitingProjection[]> {
  if (!rows.length) return [];
  const ownerIds = [
    ...new Set(rows.map(({ followUpOwnerId }) => followUpOwnerId)),
  ];
  const entityIds = [...new Set(rows.map(({ entityId }) => entityId))];
  const [owners, entities] = await Promise.all([
    database
      .select({ id: users.id, name: users.name })
      .from(users)
      .innerJoin(
        memberships,
        and(
          eq(memberships.organizationId, organizationId),
          eq(memberships.userId, users.id),
        ),
      )
      .where(and(inArray(users.id, ownerIds), isNull(users.deletedAt))),
    database
      .select({ id: workItems.id, title: workItems.title })
      .from(workItems)
      .where(
        and(
          workItemPredicate(organizationId),
          inArray(workItems.id, entityIds),
        ),
      ),
  ]);
  const ownerNames = new Map(owners.map(({ id, name }) => [id, name]));
  const entityTitles = new Map(entities.map(({ id, title }) => [id, title]));
  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organizationId,
    portfolioId: row.portfolioId,
    workspaceId: row.workspaceId,
    entityType: row.entityType,
    entityId: row.entityId,
    title: entityTitles.get(row.entityId) ?? row.waitingLabel ?? row.entityId,
    waitingType: row.waitingType,
    ...(row.waitingReferenceId
      ? { waitingReferenceId: row.waitingReferenceId }
      : {}),
    ...(row.waitingLabel ? { waitingLabel: row.waitingLabel } : {}),
    waitingSince: row.waitingSince.toISOString().slice(0, 10),
    ...(row.expectedBy ? { expectedBy: row.expectedBy } : {}),
    followUpOwnerId: row.followUpOwnerId,
    followUpOwnerName:
      ownerNames.get(row.followUpOwnerId) ?? row.followUpOwnerId,
    ...(row.nextFollowUp ? { nextFollowUp: row.nextFollowUp } : {}),
    ...(row.waitingNote ? { waitingNote: row.waitingNote } : {}),
    ...(row.resolvedAt ? { resolvedAt: row.resolvedAt.toISOString() } : {}),
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

async function listInbox(
  database: TrevvDatabase,
  scope: OrganizationScope,
): Promise<InboxItemProjection[]> {
  const rows = await database
    .select()
    .from(inboxItems)
    .where(
      and(
        eq(inboxItems.organizationId, scope.organizationId),
        eq(inboxItems.userId, scope.userId),
      ),
    )
    .orderBy(desc(inboxItems.createdAt), desc(inboxItems.id));
  return rows.map(projectInboxItem);
}

async function captureInboxItem(
  transaction: TrevvDatabase,
  scope: OrganizationScope,
  input: {
    id?: string;
    category: string;
    title: string;
    body?: string;
    resource?: Record<string, unknown>;
  },
  context: MutationContext,
) {
  return withIdempotency(transaction, scope, context, input, async () => {
    await assertActorMembership(transaction, scope);
    const now = context.now ?? new Date();
    const id = input.id ?? crypto.randomUUID();
    const [created] = await transaction
      .insert(inboxItems)
      .values({
        id,
        organizationId: scope.organizationId,
        userId: scope.userId,
        category: input.category,
        title: input.title,
        body: input.body ?? "",
        resource: input.resource ?? {},
        createdAt: now,
      })
      .returning();
    if (!created)
      throw new RepositoryError(
        "repository_unavailable",
        "The captured work could not be persisted.",
      );
    await writeAuditAndOutbox(transaction, scope, {
      action: "inbox_item.captured",
      aggregateType: "inbox_item",
      aggregateId: id,
      eventType: "inbox_item.captured",
      payload: { category: input.category, version: 0 },
      now,
    });
    return projectInboxItem(created);
  });
}

async function updateInboxItem(
  transaction: TrevvDatabase,
  scope: OrganizationScope,
  id: string,
  expectedVersion: number,
  input: { done?: boolean; snoozedUntil?: Date | null },
  context: MutationContext,
) {
  return withIdempotency(
    transaction,
    scope,
    context,
    { id, expectedVersion, ...input },
    async () => {
      await assertActorMembership(transaction, scope);
      const [existing] = await transaction
        .select({ id: inboxItems.id })
        .from(inboxItems)
        .where(
          and(
            eq(inboxItems.organizationId, scope.organizationId),
            eq(inboxItems.userId, scope.userId),
            eq(inboxItems.id, id),
          ),
        )
        .limit(1);
      if (!existing) throw notFound();
      const now = context.now ?? new Date();
      const [updated] = await transaction
        .update(inboxItems)
        .set({
          ...(input.done !== undefined
            ? { doneAt: input.done ? now : null }
            : {}),
          ...(input.snoozedUntil !== undefined
            ? { snoozedUntil: input.snoozedUntil }
            : {}),
          version: sql`${inboxItems.version} + 1`,
        })
        .where(
          and(
            eq(inboxItems.organizationId, scope.organizationId),
            eq(inboxItems.userId, scope.userId),
            eq(inboxItems.id, id),
            eq(inboxItems.version, expectedVersion),
          ),
        )
        .returning();
      if (!updated)
        throw new RepositoryError(
          "version_conflict",
          "The captured work changed before this update was committed.",
        );
      await writeAuditAndOutbox(transaction, scope, {
        action: "inbox_item.updated",
        aggregateType: "inbox_item",
        aggregateId: id,
        eventType: "inbox_item.updated",
        payload: {
          previousVersion: expectedVersion,
          version: expectedVersion + 1,
        },
        now,
      });
      return projectInboxItem(updated);
    },
  );
}

async function convertInboxToWorkItem(
  transaction: TrevvDatabase,
  scope: OrganizationScope,
  id: string,
  expectedVersion: number,
  input: ConvertInboxToWorkItemInput,
  context: MutationContext,
) {
  return withIdempotency(
    transaction,
    scope,
    context,
    { id, expectedVersion, ...input },
    async () => {
      await assertActorMembership(transaction, scope);
      const [captured] = await transaction
        .select()
        .from(inboxItems)
        .where(
          and(
            eq(inboxItems.organizationId, scope.organizationId),
            eq(inboxItems.userId, scope.userId),
            eq(inboxItems.id, id),
          ),
        )
        .limit(1)
        .for("update");
      if (!captured) throw notFound();
      if (
        captured.version !== expectedVersion ||
        captured.convertedItemId !== null
      )
        throw versionConflict(captured.version);
      await assertBoardInWorkspace(
        transaction,
        scope.organizationId,
        input.workspaceId,
        input.boardId,
      );
      const {
        idempotencyKey: _idempotencyKey,
        requestFingerprint: _requestFingerprint,
        ...nestedContext
      } = context;
      const created = await createWorkItem(
        transaction,
        scope,
        {
          workspaceId: input.workspaceId,
          boardId: input.boardId,
          title: input.title ?? captured.title,
          description: input.description ?? captured.body,
          type: input.type ?? "task",
          priority: input.priority ?? "normal",
          status: input.status ?? "not_started",
          ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
          ...(input.assigneeIds !== undefined
            ? { assigneeIds: input.assigneeIds }
            : {}),
          ...(input.approvalState !== undefined
            ? { approvalState: input.approvalState }
            : {}),
          ...(input.decisionState !== undefined
            ? { decisionState: input.decisionState }
            : {}),
        },
        nestedContext,
      );
      const now = context.now ?? new Date();
      const [converted] = await transaction
        .update(inboxItems)
        .set({
          convertedItemId: created.value.id,
          convertedAt: now,
          doneAt: now,
          snoozedUntil: null,
          version: sql`${inboxItems.version} + 1`,
        })
        .where(
          and(
            eq(inboxItems.organizationId, scope.organizationId),
            eq(inboxItems.userId, scope.userId),
            eq(inboxItems.id, id),
            eq(inboxItems.version, expectedVersion),
            isNull(inboxItems.convertedItemId),
          ),
        )
        .returning();
      if (!converted) throw versionConflict();
      await writeAuditAndOutbox(transaction, scope, {
        action: "inbox_item.converted",
        aggregateType: "inbox_item",
        aggregateId: id,
        eventType: "inbox_item.converted",
        payload: {
          workItemId: created.value.id,
          workspaceId: input.workspaceId,
          boardId: input.boardId,
          previousVersion: expectedVersion,
          version: expectedVersion + 1,
        },
        now,
      });
      return {
        inboxItem: projectInboxItem(converted),
        workItem: created.value,
      };
    },
  );
}

function projectInboxItem(
  row: typeof inboxItems.$inferSelect,
): InboxItemProjection {
  return {
    id: row.id,
    organizationId: row.organizationId,
    userId: row.userId,
    category: row.category,
    title: row.title,
    body: row.body,
    resource: row.resource,
    doneAt: row.doneAt?.toISOString() ?? null,
    snoozedUntil: row.snoozedUntil?.toISOString() ?? null,
    convertedItemId: row.convertedItemId,
    convertedAt: row.convertedAt?.toISOString() ?? null,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
  };
}

async function getChangeRadar(
  database: TrevvDatabase,
  scope: OrganizationScope,
  requestedPortfolioId?: string,
): Promise<ChangeRadarProjection> {
  const { portfolio, workspaceIds } = await resolveAccessibleRadarPortfolio(
    database,
    scope,
    requestedPortfolioId,
  );
  const [storedCheckpoint] = await database
    .select({ lastSeenAt: userSeenCheckpoints.lastSeenAt })
    .from(userSeenCheckpoints)
    .where(
      and(
        eq(userSeenCheckpoints.organizationId, scope.organizationId),
        eq(userSeenCheckpoints.portfolioId, portfolio.id),
        eq(userSeenCheckpoints.userId, scope.userId),
      ),
    )
    .limit(1);
  const lastSeenAt = storedCheckpoint?.lastSeenAt ?? new Date(0);
  const events = workspaceIds.length
    ? await database
        .select()
        .from(activityEvents)
        .where(
          and(
            eq(activityEvents.organizationId, scope.organizationId),
            gt(activityEvents.occurredAt, lastSeenAt),
            sql`${activityEvents.payload}->>'portfolioId' = ${portfolio.id}`,
            inArray(
              sql<string>`${activityEvents.payload}->>'workspaceId'`,
              workspaceIds,
            ),
          ),
        )
        .orderBy(desc(activityEvents.occurredAt), desc(activityEvents.id))
    : [];
  return {
    checkpoint: {
      userId: scope.userId,
      portfolioId: portfolio.id,
      lastSeenAt: lastSeenAt.toISOString(),
    },
    changes: events
      .map((event) => projectMeaningfulChange(event, portfolio.id))
      .filter((change): change is MeaningfulChange => change !== null),
  };
}

async function resolveAccessibleRadarPortfolio(
  database: TrevvDatabase,
  scope: OrganizationScope,
  requestedPortfolioId?: string,
) {
  const session = await resolveSession(database, scope);
  const candidates = await database
    .select()
    .from(portfolios)
    .where(
      and(
        eq(portfolios.organizationId, scope.organizationId),
        isNull(portfolios.archivedAt),
        isNull(portfolios.deletedAt),
      ),
    )
    .orderBy(
      desc(portfolios.isDefault),
      asc(portfolios.ordering),
      asc(portfolios.id),
    );
  const accessibleIds = new Set(session.portfolioIds);
  const selected = candidates.find(
    ({ id }) =>
      accessibleIds.has(id) &&
      (!requestedPortfolioId || id === requestedPortfolioId),
  );
  if (!selected) throw notFound();
  return {
    portfolio: selected,
    workspaceIds: session.workspaceIds,
  };
}

const meaningfulChangeTypes = new Set<MeaningfulChange["type"]>([
  "health_changed",
  "milestone_changed",
  "priority_changed",
  "decision_requested",
  "decision_resolved",
  "blocker_added",
  "blocker_resolved",
  "update_published",
  "update_became_stale",
  "major_work_completed",
  "due_date_materially_changed",
  "ownership_changed",
]);

function projectMeaningfulChange(
  event: typeof activityEvents.$inferSelect,
  portfolioId: string,
): MeaningfulChange | null {
  if (!isRecord(event.payload)) return null;
  const workspaceId = stringValue(event.payload.workspaceId);
  const typeValue = stringValue(event.payload.type) ?? event.eventType;
  const summary = stringValue(event.payload.summary);
  const importance = event.payload.importance;
  if (
    !workspaceId ||
    !summary ||
    typeof importance !== "number" ||
    !Number.isFinite(importance) ||
    !meaningfulChangeTypes.has(typeValue as MeaningfulChange["type"])
  )
    return null;
  if (importance < 2) return null;
  return {
    id: event.id,
    organizationId: event.organizationId,
    portfolioId,
    workspaceId,
    entityType: event.aggregateType,
    entityId: event.aggregateId,
    type: typeValue as MeaningfulChange["type"],
    summary,
    occurredAt: event.occurredAt.toISOString(),
    importance,
    metadata: isRecord(event.payload.metadata) ? event.payload.metadata : {},
  };
}

async function getManagementMemory(
  database: TrevvDatabase,
  scope: OrganizationScope,
  portfolioId?: string,
) {
  const [snapshots, rituals, outcomes] = await Promise.all([
    database
      .select()
      .from(workspaceSnapshots)
      .where(
        and(
          eq(workspaceSnapshots.organizationId, scope.organizationId),
          portfolioId
            ? eq(workspaceSnapshots.portfolioId, portfolioId)
            : undefined,
        ),
      )
      .orderBy(desc(workspaceSnapshots.capturedAt)),
    database
      .select()
      .from(reviewRituals)
      .where(
        and(
          eq(reviewRituals.organizationId, scope.organizationId),
          isNull(reviewRituals.deletedAt),
          portfolioId ? eq(reviewRituals.portfolioId, portfolioId) : undefined,
        ),
      )
      .orderBy(asc(reviewRituals.nextDueAt)),
    database
      .select()
      .from(decisionOutcomes)
      .where(
        and(
          eq(decisionOutcomes.organizationId, scope.organizationId),
          portfolioId
            ? eq(decisionOutcomes.portfolioId, portfolioId)
            : undefined,
        ),
      )
      .orderBy(desc(decisionOutcomes.recordedAt)),
  ]);
  return {
    workspaceSnapshots: snapshots,
    reviewRituals: rituals,
    decisionOutcomes: outcomes,
  };
}

async function submitWeeklyReview(
  transaction: TrevvDatabase,
  scope: OrganizationScope,
  input: WeeklyReviewInput,
  context: MutationContext,
) {
  return withIdempotency(
    transaction,
    scope,
    context,
    input,
    async () => {
      await assertActorMembership(transaction, scope);
      const workspace = await assertWorkspace(
        transaction,
        scope.organizationId,
        input.workspaceId,
      );
      const currentItems = await transaction
        .select()
        .from(workItems)
        .where(
          and(
            workItemPredicate(scope.organizationId),
            eq(workItems.workspaceId, input.workspaceId),
          ),
        );
      const now = context.now ?? new Date();
      const updateId = crypto.randomUUID();
      const snapshotId = crypto.randomUUID();
      const [update] = await transaction
        .insert(workspaceUpdates)
        .values({
          id: updateId,
          organizationId: scope.organizationId,
          workspaceId: workspace.id,
          authorId: scope.userId,
          wins: input.progressSummary,
          currentPriority: input.priorityNextWeek,
          blocker: input.blocker,
          nextMilestone: input.nextMilestone,
          helpNeeded: input.decisionNeeded ?? "",
          publishedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      const [snapshot] = await transaction
        .insert(workspaceSnapshots)
        .values({
          id: snapshotId,
          organizationId: scope.organizationId,
          portfolioId: workspace.portfolioId,
          workspaceId: workspace.id,
          capturedAt: now,
          health: input.health,
          progress: input.progress,
          openCount: currentItems.filter(({ status }) => status !== "done")
            .length,
          overdueCount: currentItems.filter(
            ({ dueDate, status }) =>
              status !== "done" &&
              Boolean(dueDate) &&
              dueDate! < now.toISOString().slice(0, 10),
          ).length,
          blockedCount: currentItems.filter(
            ({ status }) => status === "blocked",
          ).length,
          decisionCount: currentItems.filter(
            ({ itemType, status }) =>
              itemType === "decision" && status !== "done",
          ).length,
          attentionCount: 0,
          latestUpdateAt: now,
          source: "weekly_review",
          createdAt: now,
        })
        .returning();
      if (!update || !snapshot)
        throw new RepositoryError(
          "repository_unavailable",
          "The weekly review could not be persisted.",
        );
      await writeAuditAndOutbox(transaction, scope, {
        action: "weekly_review.submitted",
        aggregateType: "workspace",
        aggregateId: workspace.id,
        eventType: "weekly_review.submitted",
        payload: { updateId, snapshotId },
        now,
      });
      return { update, snapshot };
    },
    restoreWeeklyReview,
  );
}

async function search(
  database: TrevvDatabase,
  scope: OrganizationScope,
  query: string,
  requestedLimit = 50,
) {
  const term = query.trim();
  if (term.length < 2) return { workspaces: [], items: [] };
  const limit = Math.max(1, Math.min(requestedLimit, 100));
  const pattern = `%${term.replace(/[\\%_]/g, "\\$&")}%`;
  const [workspaceRows, matchedItems] = await Promise.all([
    database
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
          eq(workspaces.organizationId, scope.organizationId),
          isNull(workspaces.archivedAt),
          isNull(workspaces.deletedAt),
          isNull(portfolios.archivedAt),
          isNull(portfolios.deletedAt),
          or(
            ilike(workspaces.name, pattern),
            ilike(workspaces.currentPriority, pattern),
            ilike(workspaces.healthNote, pattern),
          ),
        ),
      )
      .orderBy(asc(workspaces.name))
      .limit(limit),
    database
      .select()
      .from(workItems)
      .where(
        and(
          workItemPredicate(scope.organizationId),
          or(
            ilike(workItems.title, pattern),
            ilike(workItems.description, pattern),
          ),
        ),
      )
      .orderBy(asc(workItems.title))
      .limit(limit),
  ]);
  const matchedWorkspaces = workspaceRows.map(({ workspace }) => workspace);
  return {
    workspaces: await hydrateWorkspaces(
      database,
      scope.organizationId,
      matchedWorkspaces,
    ),
    items: await hydrateWorkItems(database, scope.organizationId, matchedItems),
  };
}

async function exportOrganization(
  database: TrevvDatabase,
  scope: OrganizationScope,
): Promise<Record<string, unknown>> {
  const [organization] = await database
    .select()
    .from(organizations)
    .where(
      and(
        eq(organizations.id, scope.organizationId),
        isNull(organizations.deletedAt),
      ),
    )
    .limit(1);
  if (!organization) throw notFound();
  const [
    scopedPortfolios,
    scopedWorkspaces,
    scopedBoards,
    scopedItemRows,
    scopedAttention,
    scopedWaiting,
    scopedUpdates,
    memory,
  ] = await Promise.all([
    database
      .select()
      .from(portfolios)
      .where(eq(portfolios.organizationId, scope.organizationId)),
    database
      .select()
      .from(workspaces)
      .where(eq(workspaces.organizationId, scope.organizationId)),
    database
      .select()
      .from(boards)
      .where(eq(boards.organizationId, scope.organizationId)),
    database
      .select()
      .from(workItems)
      .where(eq(workItems.organizationId, scope.organizationId)),
    database
      .select()
      .from(attentionSignals)
      .where(eq(attentionSignals.organizationId, scope.organizationId)),
    database
      .select()
      .from(waitingStates)
      .where(eq(waitingStates.organizationId, scope.organizationId)),
    database
      .select()
      .from(workspaceUpdates)
      .where(eq(workspaceUpdates.organizationId, scope.organizationId)),
    getManagementMemory(database, scope),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    organization,
    portfolios: scopedPortfolios,
    workspaces: scopedWorkspaces,
    boards: scopedBoards,
    items: await hydrateWorkItems(
      database,
      scope.organizationId,
      scopedItemRows,
    ),
    attention: scopedAttention,
    waiting: scopedWaiting,
    updates: scopedUpdates,
    ...memory,
  };
}

async function assertActorMembership(
  database: TrevvDatabase,
  scope: OrganizationScope,
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

async function getActiveBoard(
  database: TrevvDatabase,
  organizationId: string,
  boardId: string,
) {
  const [row] = await database
    .select({ board: boards })
    .from(boards)
    .innerJoin(
      workspaces,
      and(
        eq(workspaces.organizationId, boards.organizationId),
        eq(workspaces.id, boards.workspaceId),
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
        eq(boards.organizationId, organizationId),
        eq(boards.id, boardId),
        isNull(boards.archivedAt),
        isNull(boards.deletedAt),
        isNull(workspaces.archivedAt),
        isNull(workspaces.deletedAt),
        isNull(portfolios.archivedAt),
        isNull(portfolios.deletedAt),
      ),
    )
    .limit(1);
  if (!row) throw notFound();
  return row.board;
}

async function assertBoardInWorkspace(
  database: TrevvDatabase,
  organizationId: string,
  workspaceId: string,
  boardId: string,
) {
  const [board] = await database
    .select({ id: boards.id })
    .from(boards)
    .innerJoin(
      workspaces,
      and(
        eq(workspaces.organizationId, boards.organizationId),
        eq(workspaces.id, boards.workspaceId),
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
        eq(boards.organizationId, organizationId),
        eq(boards.workspaceId, workspaceId),
        eq(boards.id, boardId),
        isNull(boards.archivedAt),
        isNull(boards.deletedAt),
        isNull(workspaces.archivedAt),
        isNull(workspaces.deletedAt),
        isNull(portfolios.archivedAt),
        isNull(portfolios.deletedAt),
      ),
    )
    .limit(1);
  if (!board) throw notFound();
}

async function assertOrganizationUsers(
  database: TrevvDatabase,
  organizationId: string,
  userIds: string[],
) {
  const uniqueUserIds = [...new Set(userIds)];
  if (!uniqueUserIds.length) return;
  const scopedUsers = await database
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(
      and(
        eq(memberships.organizationId, organizationId),
        inArray(memberships.userId, uniqueUserIds),
        isNull(memberships.archivedAt),
        isNull(memberships.deletedAt),
      ),
    );
  if (
    new Set(scopedUsers.map(({ userId }) => userId)).size !==
    uniqueUserIds.length
  )
    throw notFound();
}

async function findScopedWorkItemRow(
  database: TrevvDatabase,
  organizationId: string,
  id: string,
) {
  const [item] = await database
    .select()
    .from(workItems)
    .where(and(workItemPredicate(organizationId), eq(workItems.id, id)))
    .limit(1);
  return item;
}

async function getScopedWorkItem(
  database: TrevvDatabase,
  organizationId: string,
  id: string,
) {
  const item = await findScopedWorkItemRow(database, organizationId, id);
  if (!item) throw notFound();
  const [projection] = await hydrateWorkItems(database, organizationId, [item]);
  if (!projection) throw notFound();
  return projection;
}

interface AuditOutboxInput {
  action: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  now: Date;
}

async function writeAuditAndOutbox(
  database: TrevvDatabase,
  scope: OrganizationScope,
  input: AuditOutboxInput,
) {
  const payload = { requestId: scope.requestId, ...input.payload };
  const dedupKey = fingerprintRequest({
    requestId: scope.requestId,
    eventType: input.eventType,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
  });
  await database.insert(auditLogs).values({
    id: crypto.randomUUID(),
    organizationId: scope.organizationId,
    actorId: scope.userId,
    action: input.action,
    targetType: input.aggregateType,
    targetId: input.aggregateId,
    payload,
    createdAt: input.now,
  });
  await database.insert(outboxEvents).values({
    id: crypto.randomUUID(),
    organizationId: scope.organizationId,
    eventType: input.eventType,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
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

async function withIdempotency<T>(
  database: TrevvDatabase,
  scope: OrganizationScope,
  context: MutationContext,
  request: unknown,
  operation: () => Promise<T>,
  restore: (value: unknown) => T = (value) => value as T,
  deferCompletion = false,
): Promise<MutationResult<T>> {
  const key = context.idempotencyKey;
  if (!key) return { value: await operation(), replayed: false };
  const now = context.now ?? new Date();
  const method = context.method.trim().toUpperCase();
  const route = normalizeRoute(context.route);
  const fingerprint =
    context.requestFingerprint ??
    fingerprintRequest({ method, route, request });
  const inserted = await database
    .insert(idempotencyRecords)
    .values({
      id: crypto.randomUUID(),
      organizationId: scope.organizationId,
      userId: scope.userId,
      method,
      route,
      key,
      requestFingerprint: fingerprint,
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1_000),
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({
      target: [
        idempotencyRecords.organizationId,
        idempotencyRecords.userId,
        idempotencyRecords.key,
      ],
    })
    .returning({ id: idempotencyRecords.id });
  if (!inserted.length) {
    const [existing] = await database
      .select()
      .from(idempotencyRecords)
      .where(
        and(
          eq(idempotencyRecords.organizationId, scope.organizationId),
          eq(idempotencyRecords.userId, scope.userId),
          eq(idempotencyRecords.key, key),
        ),
      )
      .limit(1);
    if (!existing)
      throw new RepositoryError(
        "repository_unavailable",
        "The idempotency record could not be resolved.",
      );
    if (
      existing.method !== method ||
      existing.route !== route ||
      existing.requestFingerprint !== fingerprint
    )
      throw new RepositoryError(
        "idempotency_key_reused",
        "The idempotency key was already used for a different request.",
      );
    if (existing.state !== "completed" || existing.responseBody === null)
      throw new RepositoryError(
        "repository_unavailable",
        "The original idempotent request has not completed.",
      );
    return { value: restore(existing.responseBody), replayed: true };
  }
  const value = await operation();
  if (deferCompletion) return { value, replayed: false };
  await database
    .update(idempotencyRecords)
    .set({
      state: "completed",
      responseStatus: context.responseStatus ?? 200,
      responseBody: value,
      resultType: resultReference(value)?.type,
      resultId: resultReference(value)?.id,
      updatedAt: now,
    })
    .where(
      and(
        eq(idempotencyRecords.organizationId, scope.organizationId),
        eq(idempotencyRecords.userId, scope.userId),
        eq(idempotencyRecords.key, key),
      ),
    );
  return { value, replayed: false };
}

async function finalizeIdempotencyResponse(
  database: TrevvDatabase,
  scope: OrganizationScope,
  context: MutationContext,
  value: unknown,
) {
  const key = context.idempotencyKey;
  if (!key)
    throw new RepositoryError(
      "repository_unavailable",
      "The originating idempotency key is required.",
    );
  const method = context.method.trim().toUpperCase();
  const route = normalizeRoute(context.route);
  const [existing] = await database
    .select()
    .from(idempotencyRecords)
    .where(
      and(
        eq(idempotencyRecords.organizationId, scope.organizationId),
        eq(idempotencyRecords.userId, scope.userId),
        eq(idempotencyRecords.key, key),
      ),
    )
    .limit(1)
    .for("update");
  if (
    !existing ||
    existing.state !== "pending" ||
    existing.method !== method ||
    existing.route !== route ||
    context.requestFingerprint === undefined ||
    existing.requestFingerprint !== context.requestFingerprint
  )
    throw new RepositoryError(
      "repository_unavailable",
      "The originating idempotency result could not be finalized.",
    );
  const now = context.now ?? new Date();
  const reference = resultReference(value);
  const [updated] = await database
    .update(idempotencyRecords)
    .set({
      state: "completed",
      responseStatus: context.responseStatus ?? existing.responseStatus ?? 200,
      responseBody: value,
      resultType: reference?.type,
      resultId: reference?.id,
      updatedAt: now,
    })
    .where(
      and(
        eq(idempotencyRecords.organizationId, scope.organizationId),
        eq(idempotencyRecords.userId, scope.userId),
        eq(idempotencyRecords.key, key),
        eq(idempotencyRecords.state, "pending"),
      ),
    )
    .returning({ id: idempotencyRecords.id });
  if (!updated)
    throw new RepositoryError(
      "repository_unavailable",
      "The originating idempotency result could not be finalized.",
    );
}

function restoreAttention(
  value: unknown,
): typeof attentionSignals.$inferSelect {
  if (!isRecord(value)) throw invalidStoredIdempotency();
  return {
    ...(value as unknown as typeof attentionSignals.$inferSelect),
    createdAt: requiredDate(value.createdAt),
    updatedAt: requiredDate(value.updatedAt),
    resolvedAt: optionalDate(value.resolvedAt),
    dismissedAt: optionalDate(value.dismissedAt),
    snoozedUntil: optionalDate(value.snoozedUntil),
  };
}

function restoreWeeklyReview(value: unknown): {
  update: typeof workspaceUpdates.$inferSelect;
  snapshot: typeof workspaceSnapshots.$inferSelect;
} {
  if (!isRecord(value) || !isRecord(value.update) || !isRecord(value.snapshot))
    throw invalidStoredIdempotency();
  return {
    update: {
      ...(value.update as unknown as typeof workspaceUpdates.$inferSelect),
      publishedAt: requiredDate(value.update.publishedAt),
      createdAt: requiredDate(value.update.createdAt),
      updatedAt: requiredDate(value.update.updatedAt),
      archivedAt: optionalDate(value.update.archivedAt),
      deletedAt: optionalDate(value.update.deletedAt),
    },
    snapshot: {
      ...(value.snapshot as unknown as typeof workspaceSnapshots.$inferSelect),
      capturedAt: requiredDate(value.snapshot.capturedAt),
      latestUpdateAt: optionalDate(value.snapshot.latestUpdateAt),
      createdAt: requiredDate(value.snapshot.createdAt),
    },
  };
}

const standardDateFields = [
  "createdAt",
  "updatedAt",
  "archivedAt",
  "deletedAt",
] as const;
const organizationDateFields = standardDateFields;
const userDateFields = standardDateFields;
const membershipDateFields = standardDateFields;
const commentDateFields = [...standardDateFields, "editedAt"] as const;
const workspaceUpdateDateFields = [
  ...standardDateFields,
  "publishedAt",
] as const;
const decisionOutcomeDateFields = ["recordedAt", "createdAt"] as const;
const reviewRitualDateFields = [...standardDateFields, "nextDueAt"] as const;
const workspaceSnapshotDateFields = [
  "capturedAt",
  "latestUpdateAt",
  "createdAt",
] as const;

function restoreRowWithDates<T>(
  value: unknown,
  dateFields: readonly string[],
): T {
  if (!isRecord(value)) throw invalidStoredIdempotency();
  const restored: Record<string, unknown> = { ...value };
  for (const field of dateFields) {
    if (restored[field] === null || restored[field] === undefined) continue;
    restored[field] = requiredDate(restored[field]);
  }
  return restored as T;
}

function restoreInvitationProjection(value: unknown): InvitationProjection {
  return restoreRowWithDates<InvitationProjection>(value, [
    ...standardDateFields,
    "expiresAt",
    "acceptedAt",
    "revokedAt",
    "lastSentAt",
    "deliveryAttemptedAt",
    "deliveredAt",
  ]);
}

async function assertPortfolio(
  database: TrevvDatabase,
  organizationId: string,
  portfolioId: string,
) {
  const [portfolio] = await database
    .select({ id: portfolios.id })
    .from(portfolios)
    .where(
      and(
        eq(portfolios.organizationId, organizationId),
        eq(portfolios.id, portfolioId),
        isNull(portfolios.archivedAt),
        isNull(portfolios.deletedAt),
      ),
    )
    .limit(1);
  if (!portfolio) throw notFound();
  return portfolio;
}

async function assertWorkspace(
  database: TrevvDatabase,
  organizationId: string,
  workspaceId: string,
) {
  const [row] = await database
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
        eq(workspaces.id, workspaceId),
        isNull(workspaces.archivedAt),
        isNull(workspaces.deletedAt),
        isNull(portfolios.archivedAt),
        isNull(portfolios.deletedAt),
      ),
    )
    .limit(1);
  const workspace = row?.workspace;
  if (!workspace) throw notFound();
  return workspace;
}

async function assertPortfolioWorkspace(
  database: TrevvDatabase,
  organizationId: string,
  portfolioId: string,
  workspaceId: string,
) {
  const [row] = await database
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
        eq(workspaces.portfolioId, portfolioId),
        eq(workspaces.id, workspaceId),
        isNull(workspaces.archivedAt),
        isNull(workspaces.deletedAt),
        isNull(portfolios.archivedAt),
        isNull(portfolios.deletedAt),
      ),
    )
    .limit(1);
  const workspace = row?.workspace;
  if (!workspace) throw notFound();
  return workspace;
}

async function requireScopedWorkItem(
  database: TrevvDatabase,
  organizationId: string,
  itemId: string,
) {
  const item = await findScopedWorkItemRow(database, organizationId, itemId);
  if (!item) throw notFound();
  return item;
}

async function lockScopedWorkItems(
  transaction: TrevvDatabase,
  scope: OrganizationScope,
  itemIds: string[],
) {
  const uniqueItemIds = [...new Set(itemIds)].sort();
  const rows = await transaction
    .select()
    .from(workItems)
    .where(
      and(
        workItemPredicate(scope.organizationId),
        inArray(workItems.id, uniqueItemIds),
      ),
    )
    .orderBy(asc(workItems.id))
    .for("update");
  if (rows.length !== uniqueItemIds.length) throw notFound();
  return new Map(rows.map((item) => [item.id, item]));
}

async function bumpLockedWorkItemVersion(
  transaction: TrevvDatabase,
  organizationId: string,
  itemId: string,
  expectedVersion: number,
  now: Date,
) {
  const [updated] = await transaction
    .update(workItems)
    .set({
      version: sql`${workItems.version} + 1`,
      updatedAt: now,
    })
    .where(
      and(
        workItemPredicate(organizationId),
        eq(workItems.id, itemId),
        eq(workItems.version, expectedVersion),
      ),
    )
    .returning({ version: workItems.version });
  if (!updated) throw versionConflict();
  return updated.version;
}

function versionConflict(currentVersion?: number) {
  return new RepositoryError(
    "version_conflict",
    "The resource changed before this update was committed.",
    currentVersion === undefined ? undefined : { currentVersion },
  );
}

function assertInvitationTokenHash(value: string) {
  if (!/^[a-f0-9]{64}$/u.test(value))
    throw new RepositoryError(
      "repository_unavailable",
      "A SHA-256 invitation token hash is required.",
    );
}

function assertInvitationRole(value: string): asserts value is InvitationRole {
  if (
    value !== "admin" &&
    value !== "workspace_lead" &&
    value !== "member" &&
    value !== "guest" &&
    value !== "viewer"
  )
    throw new RepositoryError(
      "repository_unavailable",
      "Invitation role is invalid.",
    );
}

function assertInvitationExpiry(expiresAt: Date, now: Date) {
  const duration = expiresAt.getTime() - now.getTime();
  if (duration <= 0 || duration > 30 * 24 * 60 * 60 * 1_000)
    throw new RepositoryError(
      "constraint_conflict",
      "Invitation expiry must be within the next 30 days.",
    );
}

function normalizeInvitationEmail(value: string) {
  const normalized = value.trim().toLocaleLowerCase("en-US");
  if (
    normalized.length > 320 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized)
  )
    throw new RepositoryError(
      "repository_unavailable",
      "A valid invitation email address is required.",
    );
  return normalized;
}

function invalidInvitation() {
  return new RepositoryError(
    "invitation_invalid",
    "This invitation is invalid, expired, revoked, or already used.",
  );
}

function normalizeDiagnosticCode(value: string) {
  const normalized = value.trim().toLocaleLowerCase("en-US");
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/u.test(normalized))
    return "delivery_failed";
  return normalized;
}

function optionalDiagnosticValue(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, 255) : null;
}

function approvalStateValue(
  value: unknown,
): NonNullable<CoreWorkItem["approvalState"]> | undefined {
  if (value === undefined || value === null) return undefined;
  if (
    value === "pending" ||
    value === "changes_requested" ||
    value === "approved" ||
    value === "rejected"
  )
    return value;
  throw new RepositoryError(
    "repository_unavailable",
    "A persisted approval state is invalid.",
  );
}

function decisionStateValue(
  value: unknown,
): NonNullable<CoreWorkItem["decisionState"]> | undefined {
  if (value === undefined || value === null) return undefined;
  if (
    value === "needed" ||
    value === "analyzing" ||
    value === "delegated" ||
    value === "deferred" ||
    value === "decided"
  )
    return value;
  throw new RepositoryError(
    "repository_unavailable",
    "A persisted decision state is invalid.",
  );
}

function assertLifecycleStatesForType(
  itemType: (typeof workItems.$inferSelect)["itemType"],
  approvalState?: NonNullable<CoreWorkItem["approvalState"]>,
  decisionState?: NonNullable<CoreWorkItem["decisionState"]>,
) {
  if (approvalState !== undefined && itemType !== "approval")
    throw new RepositoryError(
      "repository_unavailable",
      "Approval state is only valid for approval work items.",
    );
  if (decisionState !== undefined && itemType !== "decision")
    throw new RepositoryError(
      "repository_unavailable",
      "Decision state is only valid for decision work items.",
    );
}

function requiredDate(value: unknown): Date {
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) throw invalidStoredIdempotency();
  return date;
}

function optionalDate(value: unknown): Date | null {
  return value === null || value === undefined ? null : requiredDate(value);
}

function monotonicTimestamp(expected: Date, requested?: Date): Date {
  const candidate = requested ?? new Date();
  return candidate.getTime() > expected.getTime()
    ? candidate
    : new Date(expected.getTime() + 1);
}

function invalidStoredIdempotency() {
  return new RepositoryError(
    "repository_unavailable",
    "The stored idempotency result is invalid.",
  );
}

function resultReference(value: unknown) {
  if (!isRecord(value)) return undefined;
  if (typeof value.id === "string") return { type: "resource", id: value.id };
  if (isRecord(value.update) && typeof value.update.id === "string")
    return { type: "weekly_review", id: value.update.id };
  return undefined;
}

function assertScope(scope: OrganizationScope) {
  if (
    !scope.organizationId.trim() ||
    !scope.userId.trim() ||
    !scope.requestId.trim()
  )
    throw new RepositoryError(
      "repository_unavailable",
      "Organization, user, and request scope are required.",
    );
}

function notFound() {
  return new RepositoryError(
    "resource_not_found",
    "The requested resource is unavailable.",
  );
}

function normalizeRoute(route: string) {
  const normalized = route.trim().replace(/\?.*$/, "");
  if (!normalized.startsWith("/"))
    throw new RepositoryError(
      "repository_unavailable",
      "A normalized route is required for durable idempotency.",
    );
  return normalized.replace(/\/+$/, "") || "/";
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function canonicalValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalValue(entry)]),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.slice(0, 1).toLocaleUpperCase())
    .join("");
}
