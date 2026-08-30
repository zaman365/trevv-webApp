import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const roleEnum = pgEnum("membership_role", [
  "owner",
  "admin",
  "workspace_lead",
  "member",
  "guest",
  "viewer",
]);
export const workspaceTypeEnum = pgEnum("workspace_type", [
  "business",
  "brand",
  "client",
  "product",
  "department",
  "venture",
  "initiative",
  "investment",
  "campaign",
  "program",
  "project",
  "shared_function",
  // Kept as a compatibility value for existing pre-TREVV records.
  "client_program",
  "journey",
  "other",
]);
export const workspaceHealthEnum = pgEnum("workspace_health", [
  "on_track",
  "watch",
  "critical",
  "parked",
]);
export const lifecycleEnum = pgEnum("lifecycle_stage", [
  "idea",
  "validate",
  "build",
  "launch",
  "grow",
  "operate",
  "paused",
  "archived",
]);
export const itemTypeEnum = pgEnum("item_type", [
  "task",
  "decision",
  "approval",
  "milestone",
  "idea",
  "request",
]);
export const priorityEnum = pgEnum("item_priority", [
  "urgent",
  "high",
  "normal",
  "low",
  "none",
]);
export const itemStatusEnum = pgEnum("item_status", [
  "not_started",
  "working",
  "blocked",
  "review",
  "done",
]);
export const visibilityEnum = pgEnum("visibility", ["private", "organization"]);
export const progressModeEnum = pgEnum("progress_mode", [
  "none",
  "task_completion",
  "weighted_work_items",
  "milestone_completion",
  // Kept as a compatibility value for existing boards.
  "weighted_milestones",
  "manual",
]);
export const attentionSeverityEnum = pgEnum("attention_severity", [
  "info",
  "low",
  "medium",
  "high",
  "critical",
]);
export const conversationKindEnum = pgEnum("conversation_kind", [
  "workspace",
  "team",
  "direct",
  "external",
]);
export const conversationVisibilityEnum = pgEnum("conversation_visibility", [
  "organization",
  "private",
  "guest_scoped",
]);
export const teamMemberRoleEnum = pgEnum("team_member_role", [
  "lead",
  "member",
]);
export const teamFeatureSourceEnum = pgEnum("team_feature_source", [
  "preset",
  "override",
]);
export const conversationParticipantSourceEnum = pgEnum(
  "conversation_participant_source",
  ["workspace", "team", "manual", "direct", "invitation"],
);
export const messageIntentEnum = pgEnum("message_intent", [
  "message",
  "request",
  "decision",
  "update",
]);
export const messageResponseStateEnum = pgEnum("message_response_state", [
  "open",
  "resolved",
  "cancelled",
]);
export const invitationDeliveryStatusEnum = pgEnum(
  "invitation_delivery_status",
  ["pending", "sent", "failed"],
);
export const onboardingStatusEnum = pgEnum("onboarding_status", [
  "draft",
  "completed",
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
};

export const organizations = pgTable(
  "organizations",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    locale: text("locale").notNull().default("en"),
    timezone: text("timezone").notNull().default("Europe/Berlin"),
    attentionComputedAt: timestamp("attention_computed_at", {
      withTimezone: true,
    }),
    ...timestamps,
  },
  (table) => [uniqueIndex("organizations_slug_unique").on(table.slug)],
);

export const users = pgTable(
  "app_users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    locale: text("locale").notNull().default("en"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("app_users_email_unique").on(table.email),
    uniqueIndex("app_users_active_email_normalized_unique")
      .on(sql`lower(${table.email})`)
      .where(sql`${table.deletedAt} is null`),
  ],
);

export const portfolios = pgTable(
  "portfolios",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description").notNull().default(""),
    isDefault: boolean("is_default").notNull().default(false),
    ordering: real("ordering").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("portfolios_org_id_unique").on(table.organizationId, table.id),
    uniqueIndex("portfolios_org_slug_unique").on(
      table.organizationId,
      table.slug,
    ),
    uniqueIndex("portfolios_org_single_default_unique")
      .on(table.organizationId)
      .where(
        sql`${table.isDefault} = true and ${table.archivedAt} is null and ${table.deletedAt} is null`,
      ),
    index("portfolios_org_default_idx").on(
      table.organizationId,
      table.isDefault,
    ),
  ],
);

export const memberships = pgTable(
  "memberships",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.userId] }),
    index("memberships_user_idx").on(table.userId),
  ],
);

export const portfolioMembers = pgTable(
  "portfolio_members",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    portfolioId: text("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.portfolioId, table.userId] }),
    foreignKey({
      columns: [table.organizationId, table.portfolioId],
      foreignColumns: [portfolios.organizationId, portfolios.id],
      name: "portfolio_members_org_portfolio_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.userId],
      foreignColumns: [memberships.organizationId, memberships.userId],
      name: "portfolio_members_org_membership_fk",
    }),
    index("portfolio_members_user_idx").on(table.organizationId, table.userId),
  ],
);

export const invitations = pgTable(
  "invitations",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: roleEnum("role").notNull(),
    tokenHash: text("token_hash").notNull(),
    invitedByUserId: text("invited_by_user_id").references(() => users.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedByUserId: text("accepted_by_user_id").references(() => users.id),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedByUserId: text("revoked_by_user_id").references(() => users.id),
    lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
    sendCount: integer("send_count").notNull().default(0),
    deliveryStatus: invitationDeliveryStatusEnum("delivery_status")
      .notNull()
      .default("pending"),
    deliveryAttemptedAt: timestamp("delivery_attempted_at", {
      withTimezone: true,
    }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    deliveryErrorCode: text("delivery_error_code"),
    providerMessageId: text("provider_message_id"),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("invitations_org_id_unique").on(table.organizationId, table.id),
    uniqueIndex("invitations_token_hash_unique").on(table.tokenHash),
    uniqueIndex("invitations_org_active_email_unique")
      .on(table.organizationId, sql`lower(${table.email})`)
      .where(
        sql`${table.acceptedAt} is null and ${table.revokedAt} is null and ${table.deletedAt} is null`,
      ),
    foreignKey({
      columns: [table.organizationId, table.invitedByUserId],
      foreignColumns: [memberships.organizationId, memberships.userId],
      name: "invitations_org_inviter_membership_fk",
    }),
    foreignKey({
      columns: [table.organizationId, table.acceptedByUserId],
      foreignColumns: [memberships.organizationId, memberships.userId],
      name: "invitations_org_acceptor_membership_fk",
    }),
    foreignKey({
      columns: [table.organizationId, table.revokedByUserId],
      foreignColumns: [memberships.organizationId, memberships.userId],
      name: "invitations_org_revoker_membership_fk",
    }),
    check(
      "invitations_token_hash_format_check",
      sql`${table.tokenHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "invitations_terminal_state_check",
      sql`(${table.acceptedByUserId} is null or ${table.acceptedAt} is not null)
        and (${table.revokedByUserId} is null or ${table.revokedAt} is not null)
        and not (${table.acceptedAt} is not null and ${table.revokedAt} is not null)`,
    ),
    index("invitations_org_email_idx").on(table.organizationId, table.email),
  ],
);

export const workspaces = pgTable(
  "workspaces",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    portfolioId: text("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description").notNull().default(""),
    type: workspaceTypeEnum("type").notNull(),
    accentColor: text("accent_color").notNull(),
    icon: text("icon").notNull(),
    visibility: visibilityEnum("visibility").notNull().default("private"),
    lifecycleStage: lifecycleEnum("lifecycle_stage").notNull(),
    health: workspaceHealthEnum("health").notNull(),
    healthNote: text("health_note").notNull().default(""),
    leadUserId: text("lead_user_id").references(() => users.id),
    currentPriority: text("current_priority").notNull().default(""),
    nextMilestoneSummary: text("next_milestone_summary").notNull().default(""),
    nextMilestoneDate: date("next_milestone_date"),
    primaryBlocker: text("primary_blocker").notNull().default(""),
    founderHelpSummary: text("founder_help_summary").notNull().default(""),
    reviewCadence: text("review_cadence").notNull().default("weekly"),
    nextReviewDate: date("next_review_date"),
    lastUpdateAt: timestamp("last_update_at", { withTimezone: true }),
    ordering: real("ordering").notNull().default(0),
    progressMode: progressModeEnum("progress_mode").notNull().default("none"),
    manualProgressValue: integer("manual_progress_value"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("workspaces_org_id_unique").on(table.organizationId, table.id),
    uniqueIndex("workspaces_org_portfolio_id_unique").on(
      table.organizationId,
      table.portfolioId,
      table.id,
    ),
    foreignKey({
      columns: [table.organizationId, table.portfolioId],
      foreignColumns: [portfolios.organizationId, portfolios.id],
      name: "workspaces_org_portfolio_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.leadUserId],
      foreignColumns: [memberships.organizationId, memberships.userId],
      name: "workspaces_org_lead_membership_fk",
    }),
    uniqueIndex("workspaces_portfolio_slug_unique").on(
      table.portfolioId,
      table.slug,
    ),
    index("workspaces_org_portfolio_idx").on(
      table.organizationId,
      table.portfolioId,
    ),
    index("workspaces_org_health_idx").on(table.organizationId, table.health),
    index("workspaces_org_lead_idx").on(table.organizationId, table.leadUserId),
  ],
);

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    canManage: boolean("can_manage").notNull().default(false),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.userId] }),
    uniqueIndex("workspace_members_org_workspace_user_unique").on(
      table.organizationId,
      table.workspaceId,
      table.userId,
    ),
    foreignKey({
      columns: [table.organizationId, table.workspaceId],
      foreignColumns: [workspaces.organizationId, workspaces.id],
      name: "workspace_members_org_workspace_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.userId],
      foreignColumns: [memberships.organizationId, memberships.userId],
      name: "workspace_members_org_membership_fk",
    }),
    index("workspace_members_user_idx").on(table.organizationId, table.userId),
  ],
);

export const boards = pgTable(
  "boards",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    templateKey: text("template_key"),
    visibility: visibilityEnum("visibility").notNull().default("private"),
    progressMode: progressModeEnum("progress_mode")
      .notNull()
      .default("task_completion"),
    manualProgressValue: integer("manual_progress_value"),
    manualProgressNote: text("manual_progress_note"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    ordering: real("ordering").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("boards_org_id_unique").on(table.organizationId, table.id),
    uniqueIndex("boards_org_workspace_id_unique").on(
      table.organizationId,
      table.workspaceId,
      table.id,
    ),
    foreignKey({
      columns: [table.organizationId, table.workspaceId],
      foreignColumns: [workspaces.organizationId, workspaces.id],
      name: "boards_org_workspace_fk",
    }).onDelete("cascade"),
    index("boards_org_workspace_idx").on(
      table.organizationId,
      table.workspaceId,
    ),
  ],
);

export const boardGroups = pgTable(
  "board_groups",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull(),
    ordering: real("ordering").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("board_groups_org_board_id_unique").on(
      table.organizationId,
      table.boardId,
      table.id,
    ),
    foreignKey({
      columns: [table.organizationId, table.boardId],
      foreignColumns: [boards.organizationId, boards.id],
      name: "board_groups_org_board_fk",
    }).onDelete("cascade"),
    index("board_groups_board_idx").on(table.organizationId, table.boardId),
  ],
);

export const statuses = pgTable(
  "statuses",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    boardId: text("board_id").references(() => boards.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    color: text("color").notNull(),
    category: itemStatusEnum("category").notNull(),
    ordering: real("ordering").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("statuses_org_board_id_unique").on(
      table.organizationId,
      table.boardId,
      table.id,
    ),
    foreignKey({
      columns: [table.organizationId, table.boardId],
      foreignColumns: [boards.organizationId, boards.id],
      name: "statuses_org_board_fk",
    }).onDelete("cascade"),
    index("statuses_org_board_idx").on(table.organizationId, table.boardId),
  ],
);

export const workItems = pgTable(
  "work_items",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    groupId: text("group_id").references(() => boardGroups.id),
    parentItemId: text("parent_item_id"),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    itemType: itemTypeEnum("item_type").notNull(),
    status: itemStatusEnum("status").notNull(),
    statusId: text("status_id").references(() => statuses.id),
    priority: priorityEnum("priority").notNull().default("normal"),
    startDate: date("start_date"),
    dueDate: date("due_date"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    creatorId: text("creator_id")
      .notNull()
      .references(() => users.id),
    ordering: real("ordering").notNull().default(0),
    estimateWeight: real("estimate_weight"),
    version: integer("version").notNull().default(0),
    typeData: jsonb("type_data").notNull().default({}),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("work_items_org_id_unique").on(table.organizationId, table.id),
    uniqueIndex("work_items_org_workspace_id_unique").on(
      table.organizationId,
      table.workspaceId,
      table.id,
    ),
    foreignKey({
      columns: [table.organizationId, table.workspaceId],
      foreignColumns: [workspaces.organizationId, workspaces.id],
      name: "work_items_org_workspace_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.workspaceId, table.boardId],
      foreignColumns: [boards.organizationId, boards.workspaceId, boards.id],
      name: "work_items_org_workspace_board_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.boardId, table.groupId],
      foreignColumns: [
        boardGroups.organizationId,
        boardGroups.boardId,
        boardGroups.id,
      ],
      name: "work_items_org_board_group_fk",
    }),
    foreignKey({
      columns: [table.organizationId, table.boardId, table.statusId],
      foreignColumns: [statuses.organizationId, statuses.boardId, statuses.id],
      name: "work_items_org_board_status_fk",
    }),
    foreignKey({
      columns: [table.organizationId, table.creatorId],
      foreignColumns: [memberships.organizationId, memberships.userId],
      name: "work_items_org_creator_membership_fk",
    }),
    foreignKey({
      columns: [table.organizationId, table.workspaceId, table.parentItemId],
      foreignColumns: [table.organizationId, table.workspaceId, table.id],
      name: "work_items_org_workspace_parent_fk",
    }),
    index("items_org_workspace_idx").on(
      table.organizationId,
      table.workspaceId,
    ),
    index("items_org_board_status_idx").on(
      table.organizationId,
      table.boardId,
      table.status,
    ),
    index("items_org_due_idx").on(table.organizationId, table.dueDate),
    index("items_parent_idx").on(table.parentItemId),
  ],
);

export const itemAssignees = pgTable(
  "item_assignees",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    itemId: text("item_id")
      .notNull()
      .references(() => workItems.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    assignedAt: timestamp("assigned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.itemId, table.userId] }),
    foreignKey({
      columns: [table.organizationId, table.itemId],
      foreignColumns: [workItems.organizationId, workItems.id],
      name: "item_assignees_org_item_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.userId],
      foreignColumns: [memberships.organizationId, memberships.userId],
      name: "item_assignees_org_membership_fk",
    }),
    index("assignees_org_user_idx").on(table.organizationId, table.userId),
  ],
);

export const itemDependencies = pgTable(
  "item_dependencies",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    itemId: text("item_id")
      .notNull()
      .references(() => workItems.id, { onDelete: "cascade" }),
    dependsOnItemId: text("depends_on_item_id")
      .notNull()
      .references(() => workItems.id, { onDelete: "cascade" }),
    relation: text("relation").notNull().default("depends_on"),
  },
  (table) => [
    primaryKey({ columns: [table.itemId, table.dependsOnItemId] }),
    foreignKey({
      columns: [table.organizationId, table.itemId],
      foreignColumns: [workItems.organizationId, workItems.id],
      name: "item_dependencies_scoped_item_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.dependsOnItemId],
      foreignColumns: [workItems.organizationId, workItems.id],
      name: "item_dependencies_scoped_dependency_fk",
    }).onDelete("cascade"),
  ],
);

// Immutable founder-loop history. Each entry retains the canonical WorkItem
// identity and the item snapshot/version that was acknowledged by PostgreSQL.
// `sourceType`/`sourceId` let comments, Waiting, decisions, approvals, and
// worker-derived outcomes cite the durable record that caused the change.
export const workItemEvents = pgTable(
  "work_item_events",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    itemId: text("item_id")
      .notNull()
      .references(() => workItems.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => users.id),
    eventType: text("event_type").notNull(),
    summary: text("summary").notNull(),
    reasonCode: text("reason_code").notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    sourceOccurredAt: timestamp("source_occurred_at", {
      withTimezone: true,
    }).notNull(),
    itemVersion: integer("item_version").notNull(),
    snapshot: jsonb("snapshot").notNull().default({}),
    evidence: jsonb("evidence").notNull().default({}),
    metadata: jsonb("metadata").notNull().default({}),
    requestId: text("request_id").notNull(),
    dedupKey: text("dedup_key").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.workspaceId, table.itemId],
      foreignColumns: [
        workItems.organizationId,
        workItems.workspaceId,
        workItems.id,
      ],
      name: "work_item_events_org_workspace_item_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.actorId],
      foreignColumns: [memberships.organizationId, memberships.userId],
      name: "work_item_events_org_actor_membership_fk",
    }),
    uniqueIndex("work_item_events_org_dedup_unique").on(
      table.organizationId,
      table.dedupKey,
    ),
    index("work_item_events_org_item_time_idx").on(
      table.organizationId,
      table.itemId,
      table.occurredAt,
    ),
  ],
);

export const customFields = pgTable(
  "custom_fields",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    boardId: text("board_id").references(() => boards.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    fieldType: text("field_type").notNull(),
    settings: jsonb("settings").notNull().default({}),
    ...timestamps,
  },
  (table) => [
    index("custom_fields_board_idx").on(table.organizationId, table.boardId),
  ],
);
export const customFieldOptions = pgTable("custom_field_options", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  fieldId: text("field_id")
    .notNull()
    .references(() => customFields.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  color: text("color"),
  ordering: real("ordering").notNull().default(0),
});
export const itemFieldValues = pgTable(
  "item_field_values",
  {
    organizationId: text("organization_id").notNull(),
    itemId: text("item_id")
      .notNull()
      .references(() => workItems.id, { onDelete: "cascade" }),
    fieldId: text("field_id")
      .notNull()
      .references(() => customFields.id, { onDelete: "cascade" }),
    value: jsonb("value").notNull(),
  },
  (table) => [primaryKey({ columns: [table.itemId, table.fieldId] })],
);

export const comments = pgTable(
  "comments",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    itemId: text("item_id")
      .notNull()
      .references(() => workItems.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.itemId],
      foreignColumns: [workItems.organizationId, workItems.id],
      name: "comments_org_item_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.authorId],
      foreignColumns: [memberships.organizationId, memberships.userId],
      name: "comments_org_author_membership_fk",
    }),
    index("comments_item_idx").on(table.organizationId, table.itemId),
  ],
);
export const mentions = pgTable("mentions", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  commentId: text("comment_id")
    .notNull()
    .references(() => comments.id, { onDelete: "cascade" }),
  mentionedUserId: text("mentioned_user_id")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const reactions = pgTable(
  "reactions",
  {
    organizationId: text("organization_id").notNull(),
    commentId: text("comment_id")
      .notNull()
      .references(() => comments.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    emoji: text("emoji").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.commentId, table.userId, table.emoji] }),
  ],
);
export const attachments = pgTable("attachments", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  itemId: text("item_id").references(() => workItems.id, {
    onDelete: "cascade",
  }),
  storageKey: text("storage_key").notNull(),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  uploadedBy: text("uploaded_by")
    .notNull()
    .references(() => users.id),
  ...timestamps,
});
export const externalResourceLinks = pgTable("external_resource_links", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  workspaceId: text("workspace_id").references(() => workspaces.id, {
    onDelete: "cascade",
  }),
  itemId: text("item_id").references(() => workItems.id, {
    onDelete: "cascade",
  }),
  provider: text("provider").notNull(),
  providerId: text("provider_id"),
  name: text("name").notNull(),
  url: text("url").notNull(),
  metadata: jsonb("metadata").notNull().default({}),
  ...timestamps,
});

export const workspaceUpdates = pgTable(
  "workspace_updates",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id),
    wins: text("wins").notNull(),
    currentPriority: text("current_priority").notNull(),
    blocker: text("blocker").notNull(),
    nextMilestone: text("next_milestone").notNull(),
    helpNeeded: text("help_needed").notNull(),
    note: text("note"),
    publishedAt: timestamp("published_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.workspaceId],
      foreignColumns: [workspaces.organizationId, workspaces.id],
      name: "workspace_updates_org_workspace_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.authorId],
      foreignColumns: [memberships.organizationId, memberships.userId],
      name: "workspace_updates_org_author_membership_fk",
    }),
    index("workspace_updates_workspace_date_idx").on(
      table.organizationId,
      table.workspaceId,
      table.publishedAt,
    ),
  ],
);
export const workspaceMetrics = pgTable("workspace_metrics", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  unit: text("unit").notNull(),
  currentValue: real("current_value"),
  targetValue: real("target_value"),
  cadence: text("cadence").notNull(),
  ...timestamps,
});
export const metricSnapshots = pgTable("metric_snapshots", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  metricId: text("metric_id")
    .notNull()
    .references(() => workspaceMetrics.id, { onDelete: "cascade" }),
  value: real("value").notNull(),
  capturedAt: timestamp("captured_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const notifications = pgTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    resource: jsonb("resource").notNull().default({}),
    dedupKey: text("dedup_key"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.userId],
      foreignColumns: [memberships.organizationId, memberships.userId],
      name: "notifications_org_membership_fk",
    }).onDelete("cascade"),
    index("notifications_user_unread_idx").on(
      table.organizationId,
      table.userId,
      table.readAt,
    ),
    uniqueIndex("notifications_org_user_dedup_unique")
      .on(table.organizationId, table.userId, table.dedupKey)
      .where(sql`${table.dedupKey} is not null`),
  ],
);
export const activityEvents = pgTable(
  "activity_events",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    actorId: text("actor_id").references(() => users.id),
    eventType: text("event_type").notNull(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: text("aggregate_id").notNull(),
    payload: jsonb("payload").notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.actorId],
      foreignColumns: [memberships.organizationId, memberships.userId],
      name: "activity_events_org_actor_membership_fk",
    }),
    index("activity_org_aggregate_idx").on(
      table.organizationId,
      table.aggregateType,
      table.aggregateId,
    ),
  ],
);
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => users.id),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    ipHash: text("ip_hash"),
    payload: jsonb("payload").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.actorId],
      foreignColumns: [memberships.organizationId, memberships.userId],
      name: "audit_logs_org_actor_membership_fk",
    }),
    index("audit_org_date_idx").on(table.organizationId, table.createdAt),
  ],
);

/**
 * Durable privacy requests are deliberately workflow records rather than a
 * boolean "delete me" flag. A request may need identity verification, legal
 * review, export generation, retention holds, and provider revocation before
 * it is safe to complete. Keeping those states explicit prevents the product
 * from claiming that a destructive or external effect happened synchronously.
 */
export const dataLifecycleRequests = pgTable(
  "data_lifecycle_requests",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    requestedBy: text("requested_by")
      .notNull()
      .references(() => users.id),
    subjectUserId: text("subject_user_id").references(() => users.id),
    kind: text("kind").notNull(),
    requestScope: text("request_scope").notNull(),
    status: text("status").notNull().default("submitted"),
    idempotencyKey: text("idempotency_key").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    processingStartedAt: timestamp("processing_started_at", {
      withTimezone: true,
    }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    retentionUntil: timestamp("retention_until", { withTimezone: true }),
    resultManifest: jsonb("result_manifest").notNull().default({}),
    failureCode: text("failure_code"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.requestedBy],
      foreignColumns: [memberships.organizationId, memberships.userId],
      name: "data_lifecycle_requests_org_requester_membership_fk",
    }),
    foreignKey({
      columns: [table.organizationId, table.subjectUserId],
      foreignColumns: [memberships.organizationId, memberships.userId],
      name: "data_lifecycle_requests_org_subject_membership_fk",
    }),
    uniqueIndex("data_lifecycle_requests_org_id_unique").on(
      table.organizationId,
      table.id,
    ),
    index("data_lifecycle_requests_org_requester_created_idx").on(
      table.organizationId,
      table.requestedBy,
      table.createdAt,
    ),
    index("data_lifecycle_requests_work_queue_idx").on(
      table.status,
      table.dueAt,
    ),
    check(
      "data_lifecycle_requests_kind_check",
      sql`${table.kind} in ('access', 'portability', 'erasure', 'rectification', 'restriction', 'objection')`,
    ),
    check(
      "data_lifecycle_requests_scope_check",
      sql`${table.requestScope} in ('user', 'organization')`,
    ),
    check(
      "data_lifecycle_requests_kind_scope_check",
      sql`${table.requestScope} = 'user' or ${table.kind} in ('access', 'portability', 'erasure', 'restriction')`,
    ),
    check(
      "data_lifecycle_requests_status_check",
      sql`${table.status} in ('submitted', 'under_review', 'approved', 'processing', 'completed', 'rejected', 'cancelled', 'failed')`,
    ),
    check(
      "data_lifecycle_requests_org_scope_subject_check",
      sql`(${table.requestScope} = 'user' and ${table.subjectUserId} is not null) or (${table.requestScope} = 'organization' and ${table.subjectUserId} is null)`,
    ),
    check("data_lifecycle_requests_version_check", sql`${table.version} >= 1`),
  ],
);

/**
 * Organization overrides for the versioned default retention catalogue.
 * Legal holds always win over a requested disposition; processing workers
 * must check this row again in the same transaction as any destructive step.
 */
export const dataRetentionPolicies = pgTable(
  "data_retention_policies",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    retentionDays: integer("retention_days").notNull(),
    disposition: text("disposition").notNull(),
    legalHold: boolean("legal_hold").notNull().default(false),
    policyVersion: integer("policy_version").notNull().default(1),
    updatedBy: text("updated_by")
      .notNull()
      .references(() => users.id),
    effectiveAt: timestamp("effective_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.category] }),
    foreignKey({
      columns: [table.organizationId, table.updatedBy],
      foreignColumns: [memberships.organizationId, memberships.userId],
      name: "data_retention_policies_org_updater_membership_fk",
    }),
    check(
      "data_retention_policies_category_check",
      sql`${table.category} in ('identity', 'organization', 'work', 'collaboration', 'audit', 'operations', 'integrations', 'billing')`,
    ),
    check(
      "data_retention_policies_days_check",
      sql`${table.retentionDays} between 1 and 3650`,
    ),
    check(
      "data_retention_policies_disposition_check",
      sql`${table.disposition} in ('delete', 'anonymize', 'archive', 'manual_review')`,
    ),
    check(
      "data_retention_policies_version_check",
      sql`${table.policyVersion} >= 1`,
    ),
  ],
);

// Request-protection state is operational and deliberately stores a one-way
// client-key digest rather than an IP address or session identifier. A shared
// PostgreSQL row makes enforcement coherent across API replicas.
export const apiRateLimitWindows = pgTable(
  "api_rate_limit_windows",
  {
    bucket: text("bucket").notNull(),
    clientKeyHash: text("client_key_hash").notNull(),
    windowStartedAt: timestamp("window_started_at", {
      withTimezone: true,
    }).notNull(),
    windowMs: integer("window_ms").notNull(),
    requestCount: integer("request_count").notNull().default(1),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "api_rate_limit_windows_pk",
      columns: [table.bucket, table.clientKeyHash, table.windowStartedAt],
    }),
    index("api_rate_limit_windows_expiry_idx").on(table.expiresAt),
    check(
      "api_rate_limit_windows_bucket_check",
      sql`${table.bucket} ~ '^[a-z0-9][a-z0-9._-]{0,63}$'`,
    ),
    check(
      "api_rate_limit_windows_client_hash_check",
      sql`${table.clientKeyHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "api_rate_limit_windows_window_check",
      sql`${table.windowMs} between 1000 and 86400000`,
    ),
    check(
      "api_rate_limit_windows_count_check",
      sql`${table.requestCount} >= 1`,
    ),
    check(
      "api_rate_limit_windows_expiry_check",
      sql`${table.expiresAt} > ${table.windowStartedAt}`,
    ),
  ],
);
export const savedViews = pgTable("saved_views", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  boardId: text("board_id")
    .notNull()
    .references(() => boards.id, { onDelete: "cascade" }),
  ownerId: text("owner_id").references(() => users.id),
  name: text("name").notNull(),
  shared: boolean("shared").notNull().default(false),
  config: jsonb("config").notNull().default({}),
  ...timestamps,
});
export const integrationConnections = pgTable(
  "integration_connections",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    provider: text("provider").notNull(),
    encryptedCredentials: text("encrypted_credentials").notNull(),
    scopes: text("scopes").array().notNull(),
    connectedBy: text("connected_by")
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("connections_org_provider_unique").on(
      table.organizationId,
      table.provider,
    ),
  ],
);
export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id"),
    provider: text("provider").notNull(),
    deliveryId: text("delivery_id").notNull(),
    signatureValid: boolean("signature_valid").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    payloadHash: text("payload_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("webhook_provider_delivery_unique").on(
      table.provider,
      table.deliveryId,
    ),
  ],
);
export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: text("aggregate_id").notNull(),
    schemaVersion: integer("schema_version").notNull().default(1),
    actorId: text("actor_id").references(() => users.id),
    requestId: text("request_id").notNull(),
    correlationId: text("correlation_id"),
    dedupKey: text("dedup_key").notNull(),
    payload: jsonb("payload").notNull(),
    attempts: integer("attempts").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: text("locked_by"),
    leaseToken: text("lease_token"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    lastErrorCode: text("last_error_code"),
    lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
    deadLetteredAt: timestamp("dead_lettered_at", { withTimezone: true }),
    processedBy: text("processed_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.actorId],
      foreignColumns: [memberships.organizationId, memberships.userId],
      name: "outbox_events_org_actor_membership_fk",
    }),
    uniqueIndex("outbox_events_org_dedup_unique").on(
      table.organizationId,
      table.dedupKey,
    ),
    uniqueIndex("outbox_events_org_id_unique").on(
      table.organizationId,
      table.id,
    ),
    index("outbox_pending_idx").on(table.processedAt, table.availableAt),
    index("outbox_lease_expiry_idx").on(
      table.processedAt,
      table.deadLetteredAt,
      table.leaseExpiresAt,
    ),
  ],
);

export const outboxAttempts = pgTable(
  "outbox_attempts",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    eventId: text("event_id")
      .notNull()
      .references(() => outboxEvents.id, { onDelete: "cascade" }),
    attempt: integer("attempt").notNull(),
    workerId: text("worker_id").notNull(),
    leaseToken: text("lease_token").notNull(),
    status: text("status").notNull(),
    errorCode: text("error_code"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.eventId],
      foreignColumns: [outboxEvents.organizationId, outboxEvents.id],
      name: "outbox_attempts_org_event_fk",
    }).onDelete("cascade"),
    uniqueIndex("outbox_attempts_event_attempt_unique").on(
      table.eventId,
      table.attempt,
    ),
    index("outbox_attempts_org_status_idx").on(
      table.organizationId,
      table.status,
      table.startedAt,
    ),
    check(
      "outbox_attempts_status_check",
      sql`${table.status} in ('leased', 'succeeded', 'failed', 'dead_lettered')`,
    ),
  ],
);

// Commercial services are kept pricing-agnostic. Product code evaluates
// entitlement keys centrally and billing providers write through an adapter.
export const plans = pgTable(
  "plans",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    active: boolean("active").notNull().default(true),
    metadata: jsonb("metadata").notNull().default({}),
    ...timestamps,
  },
  (table) => [uniqueIndex("plans_key_unique").on(table.key)],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id),
    status: text("status").notNull(),
    provider: text("provider"),
    providerCustomerId: text("provider_customer_id"),
    providerSubscriptionId: text("provider_subscription_id"),
    currentPeriodStart: timestamp("current_period_start", {
      withTimezone: true,
    }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    ...timestamps,
  },
  (table) => [
    index("subscriptions_org_status_idx").on(
      table.organizationId,
      table.status,
    ),
  ],
);

export const entitlements = pgTable(
  "entitlements",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    subscriptionId: text("subscription_id").references(() => subscriptions.id, {
      onDelete: "cascade",
    }),
    key: text("key").notNull(),
    value: jsonb("value").notNull(),
    source: text("source").notNull().default("plan"),
    effectiveFrom: timestamp("effective_from", { withTimezone: true })
      .notNull()
      .defaultNow(),
    effectiveUntil: timestamp("effective_until", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("entitlements_org_key_source_unique").on(
      table.organizationId,
      table.key,
      table.source,
    ),
    index("entitlements_org_effective_idx").on(
      table.organizationId,
      table.effectiveUntil,
    ),
  ],
);

export const usageCounters = pgTable(
  "usage_counters",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: real("value").notNull().default(0),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("usage_counters_org_key_period_unique").on(
      table.organizationId,
      table.key,
      table.periodStart,
    ),
  ],
);

export const billingEvents = pgTable(
  "billing_events",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    provider: text("provider").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull().default({}),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("billing_events_provider_event_unique").on(
      table.provider,
      table.providerEventId,
    ),
  ],
);

export const attentionSignals = pgTable(
  "attention_signals",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    portfolioId: text("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").references(() => workspaces.id, {
      onDelete: "cascade",
    }),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    signalType: text("signal_type").notNull(),
    severity: attentionSeverityEnum("severity").notNull(),
    impact: integer("impact").notNull(),
    urgency: integer("urgency").notNull(),
    responsibility: real("responsibility").notNull().default(1),
    reason: text("reason").notNull(),
    reasonCode: text("reason_code").notNull(),
    recommendedAction: text("recommended_action"),
    evidence: jsonb("evidence").notNull().default({}),
    sourceFingerprint: text("source_fingerprint").notNull(),
    sourceOccurredAt: timestamp("source_occurred_at", {
      withTimezone: true,
    }).notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
    actionReason: text("action_reason"),
    version: integer("version").notNull().default(0),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.portfolioId],
      foreignColumns: [portfolios.organizationId, portfolios.id],
      name: "attention_signals_org_portfolio_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.portfolioId, table.workspaceId],
      foreignColumns: [
        workspaces.organizationId,
        workspaces.portfolioId,
        workspaces.id,
      ],
      name: "attention_signals_org_portfolio_workspace_fk",
    }).onDelete("cascade"),
    index("attention_org_portfolio_active_idx").on(
      table.organizationId,
      table.portfolioId,
      table.resolvedAt,
      table.dismissedAt,
    ),
    index("attention_entity_idx").on(
      table.organizationId,
      table.entityType,
      table.entityId,
    ),
    uniqueIndex("attention_active_reason_unique")
      .on(
        table.organizationId,
        table.entityType,
        table.entityId,
        table.reasonCode,
      )
      .where(
        sql`${table.reasonCode} is not null and ${table.resolvedAt} is null and ${table.dismissedAt} is null`,
      ),
  ],
);

export const waitingStates = pgTable(
  "waiting_states",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    portfolioId: text("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    waitingType: text("waiting_type").notNull(),
    waitingReferenceId: text("waiting_reference_id"),
    waitingLabel: text("waiting_label"),
    waitingSince: timestamp("waiting_since", { withTimezone: true }).notNull(),
    expectedBy: date("expected_by"),
    followUpOwnerId: text("follow_up_owner_id")
      .notNull()
      .references(() => users.id),
    nextFollowUp: date("next_follow_up"),
    waitingNote: text("waiting_note"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    version: integer("version").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.portfolioId, table.workspaceId],
      foreignColumns: [
        workspaces.organizationId,
        workspaces.portfolioId,
        workspaces.id,
      ],
      name: "waiting_states_org_portfolio_workspace_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.followUpOwnerId],
      foreignColumns: [memberships.organizationId, memberships.userId],
      name: "waiting_states_org_owner_membership_fk",
    }),
    foreignKey({
      columns: [table.organizationId, table.workspaceId, table.entityId],
      foreignColumns: [
        workItems.organizationId,
        workItems.workspaceId,
        workItems.id,
      ],
      name: "waiting_states_org_workspace_item_fk",
    }).onDelete("cascade"),
    index("waiting_org_portfolio_follow_up_idx").on(
      table.organizationId,
      table.portfolioId,
      table.nextFollowUp,
      table.resolvedAt,
    ),
    uniqueIndex("waiting_active_entity_unique")
      .on(table.organizationId, table.entityType, table.entityId)
      .where(sql`${table.resolvedAt} is null and ${table.deletedAt} is null`),
  ],
);

export const idempotencyRecords = pgTable(
  "idempotency_records",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    method: text("method").notNull(),
    route: text("route").notNull(),
    key: text("idempotency_key").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    state: text("state").notNull().default("pending"),
    responseStatus: integer("response_status"),
    responseBody: jsonb("response_body"),
    resultType: text("result_type"),
    resultId: text("result_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.userId],
      foreignColumns: [memberships.organizationId, memberships.userId],
      name: "idempotency_records_org_membership_fk",
    }),
    uniqueIndex("idempotency_scope_key_unique").on(
      table.organizationId,
      table.userId,
      table.key,
    ),
    index("idempotency_expiry_idx").on(table.expiresAt),
    index("idempotency_result_idx").on(
      table.organizationId,
      table.resultType,
      table.resultId,
    ),
  ],
);

export const userSeenCheckpoints = pgTable(
  "user_seen_checkpoints",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    portfolioId: text("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.portfolioId, table.userId] }),
    index("seen_checkpoints_user_idx").on(table.organizationId, table.userId),
  ],
);

export const workspaceSnapshots = pgTable(
  "workspace_snapshots",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    portfolioId: text("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    capturedAt: timestamp("captured_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    health: workspaceHealthEnum("health").notNull(),
    progress: real("progress"),
    openCount: integer("open_count").notNull(),
    overdueCount: integer("overdue_count").notNull(),
    blockedCount: integer("blocked_count").notNull(),
    decisionCount: integer("decision_count").notNull(),
    attentionCount: integer("attention_count").notNull(),
    nextMilestoneId: text("next_milestone_id").references(() => workItems.id),
    nextMilestoneStatus: text("next_milestone_status"),
    latestUpdateAt: timestamp("latest_update_at", { withTimezone: true }),
    source: text("source").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.portfolioId, table.workspaceId],
      foreignColumns: [
        workspaces.organizationId,
        workspaces.portfolioId,
        workspaces.id,
      ],
      name: "workspace_snapshots_org_portfolio_workspace_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.workspaceId, table.nextMilestoneId],
      foreignColumns: [
        workItems.organizationId,
        workItems.workspaceId,
        workItems.id,
      ],
      name: "workspace_snapshots_org_workspace_milestone_fk",
    }),
    uniqueIndex("workspace_snapshots_workspace_captured_unique").on(
      table.workspaceId,
      table.capturedAt,
    ),
    index("workspace_snapshots_portfolio_captured_idx").on(
      table.organizationId,
      table.portfolioId,
      table.capturedAt,
    ),
  ],
);

export const reviewRituals = pgTable(
  "review_rituals",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    portfolioId: text("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").references(() => workspaces.id, {
      onDelete: "cascade",
    }),
    type: text("type").notNull(),
    cadence: text("cadence").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    nextDueAt: timestamp("next_due_at", { withTimezone: true }),
    reminderEnabled: boolean("reminder_enabled").notNull().default(false),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.portfolioId],
      foreignColumns: [portfolios.organizationId, portfolios.id],
      name: "review_rituals_org_portfolio_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.portfolioId, table.workspaceId],
      foreignColumns: [
        workspaces.organizationId,
        workspaces.portfolioId,
        workspaces.id,
      ],
      name: "review_rituals_org_portfolio_workspace_fk",
    }).onDelete("cascade"),
    index("review_rituals_due_idx").on(
      table.organizationId,
      table.enabled,
      table.nextDueAt,
    ),
  ],
);

export const decisionOutcomes = pgTable(
  "decision_outcomes",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    portfolioId: text("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    decisionItemId: text("decision_item_id")
      .notNull()
      .references(() => workItems.id, { onDelete: "cascade" }),
    outcome: text("outcome").notNull(),
    learning: text("learning").notNull(),
    wouldRepeat: boolean("would_repeat"),
    recordedBy: text("recorded_by")
      .notNull()
      .references(() => users.id),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.portfolioId, table.workspaceId],
      foreignColumns: [
        workspaces.organizationId,
        workspaces.portfolioId,
        workspaces.id,
      ],
      name: "decision_outcomes_org_portfolio_workspace_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.workspaceId, table.decisionItemId],
      foreignColumns: [
        workItems.organizationId,
        workItems.workspaceId,
        workItems.id,
      ],
      name: "decision_outcomes_org_workspace_item_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.recordedBy],
      foreignColumns: [memberships.organizationId, memberships.userId],
      name: "decision_outcomes_org_recorder_membership_fk",
    }),
    index("decision_outcomes_decision_idx").on(
      table.organizationId,
      table.decisionItemId,
      table.recordedAt,
    ),
  ],
);

export const insights = pgTable(
  "insights",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    portfolioId: text("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").references(() => workspaces.id, {
      onDelete: "cascade",
    }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    sourceType: text("source_type").notNull(),
    sourceUrl: text("source_url"),
    impact: text("impact"),
    labels: text("labels").array().notNull().default([]),
    capturedBy: text("captured_by")
      .notNull()
      .references(() => users.id),
    capturedAt: timestamp("captured_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ...timestamps,
  },
  (table) => [
    index("insights_portfolio_captured_idx").on(
      table.organizationId,
      table.portfolioId,
      table.capturedAt,
    ),
  ],
);

export const insightLinks = pgTable(
  "insight_links",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    insightId: text("insight_id")
      .notNull()
      .references(() => insights.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("insight_links_target_unique").on(
      table.insightId,
      table.entityType,
      table.entityId,
    ),
    index("insight_links_entity_idx").on(
      table.organizationId,
      table.entityType,
      table.entityId,
    ),
  ],
);

export const blueprints = pgTable(
  "blueprints",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    currentVersionId: text("current_version_id"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("blueprints_org_id_unique").on(table.organizationId, table.id),
    index("blueprints_org_idx").on(table.organizationId),
  ],
);

export const blueprintVersions = pgTable(
  "blueprint_versions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    blueprintId: text("blueprint_id")
      .notNull()
      .references(() => blueprints.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    summary: text("summary").notNull(),
    definition: jsonb("definition").notNull(),
    createdBy: text("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("blueprint_versions_org_blueprint_id_unique").on(
      table.organizationId,
      table.blueprintId,
      table.id,
    ),
    uniqueIndex("blueprint_versions_number_unique").on(
      table.blueprintId,
      table.version,
    ),
    foreignKey({
      columns: [table.organizationId, table.blueprintId],
      foreignColumns: [blueprints.organizationId, blueprints.id],
      name: "blueprint_versions_org_blueprint_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.createdBy],
      foreignColumns: [memberships.organizationId, memberships.userId],
      name: "blueprint_versions_org_creator_membership_fk",
    }),
  ],
);

export const blueprintInstances = pgTable(
  "blueprint_instances",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    blueprintId: text("blueprint_id")
      .notNull()
      .references(() => blueprints.id, { onDelete: "cascade" }),
    blueprintVersionId: text("blueprint_version_id")
      .notNull()
      .references(() => blueprintVersions.id),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    localOverrides: jsonb("local_overrides").notNull().default([]),
    detachedAt: timestamp("detached_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("blueprint_instances_org_id_unique").on(
      table.organizationId,
      table.id,
    ),
    uniqueIndex("blueprint_instances_board_unique").on(table.boardId),
    foreignKey({
      columns: [table.organizationId, table.blueprintId],
      foreignColumns: [blueprints.organizationId, blueprints.id],
      name: "blueprint_instances_org_blueprint_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [
        table.organizationId,
        table.blueprintId,
        table.blueprintVersionId,
      ],
      foreignColumns: [
        blueprintVersions.organizationId,
        blueprintVersions.blueprintId,
        blueprintVersions.id,
      ],
      name: "blueprint_instances_org_blueprint_version_fk",
    }),
    foreignKey({
      columns: [table.organizationId, table.workspaceId, table.boardId],
      foreignColumns: [boards.organizationId, boards.workspaceId, boards.id],
      name: "blueprint_instances_org_workspace_board_fk",
    }).onDelete("cascade"),
    index("blueprint_instances_update_idx").on(
      table.organizationId,
      table.blueprintId,
      table.detachedAt,
    ),
  ],
);

export const stakeholderExposures = pgTable(
  "stakeholder_exposures",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    principalId: text("principal_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    showHealth: boolean("show_health").notNull().default(false),
    showLatestUpdate: boolean("show_latest_update").notNull().default(false),
    showMilestones: boolean("show_milestones").notNull().default(false),
    selectedWorkItemIds: text("selected_work_item_ids")
      .array()
      .notNull()
      .default([]),
    selectedResourceIds: text("selected_resource_ids")
      .array()
      .notNull()
      .default([]),
    approvalItemIds: text("approval_item_ids").array().notNull().default([]),
    decisionItemIds: text("decision_item_ids").array().notNull().default([]),
    showInternalComments: boolean("show_internal_comments")
      .notNull()
      .default(false),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("stakeholder_exposures_principal_workspace_unique").on(
      table.workspaceId,
      table.principalId,
    ),
  ],
);

export const importRuns = pgTable(
  "import_runs",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    portfolioId: text("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").references(() => workspaces.id, {
      onDelete: "cascade",
    }),
    preset: text("preset").notNull(),
    status: text("status").notNull(),
    dryRun: boolean("dry_run").notNull().default(true),
    fieldMapping: jsonb("field_mapping").notNull().default({}),
    statusMapping: jsonb("status_mapping").notNull().default({}),
    ownerMapping: jsonb("owner_mapping").notNull().default({}),
    report: jsonb("report").notNull().default({}),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("import_runs_org_created_idx").on(
      table.organizationId,
      table.createdAt,
    ),
  ],
);

export const inboxItems = pgTable(
  "inbox_items",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    resource: jsonb("resource").notNull().default({}),
    doneAt: timestamp("done_at", { withTimezone: true }),
    snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
    convertedItemId: text("converted_item_id").references(() => workItems.id),
    convertedAt: timestamp("converted_at", { withTimezone: true }),
    version: integer("version").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.userId],
      foreignColumns: [memberships.organizationId, memberships.userId],
      name: "inbox_items_org_membership_fk",
    }),
    foreignKey({
      columns: [table.organizationId, table.convertedItemId],
      foreignColumns: [workItems.organizationId, workItems.id],
      name: "inbox_items_org_converted_item_fk",
    }),
    index("inbox_items_user_actionable_idx").on(
      table.organizationId,
      table.userId,
      table.doneAt,
      table.snoozedUntil,
    ),
  ],
);

/**
 * Teams are workspace-scoped collaboration groups. Feature policy rows affect
 * product presentation only; authorization continues to derive from server
 * memberships and conversation participation.
 */
export const teams = pgTable(
  "teams",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    purpose: text("purpose").notNull().default(""),
    presetKey: text("preset_key").notNull().default("custom"),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("teams_org_id_unique").on(table.organizationId, table.id),
    uniqueIndex("teams_org_workspace_id_unique").on(
      table.organizationId,
      table.workspaceId,
      table.id,
    ),
    uniqueIndex("teams_workspace_active_slug_unique")
      .on(table.organizationId, table.workspaceId, table.slug)
      .where(sql`${table.archivedAt} is null and ${table.deletedAt} is null`),
    foreignKey({
      columns: [table.organizationId, table.workspaceId],
      foreignColumns: [workspaces.organizationId, workspaces.id],
      name: "teams_org_workspace_fk",
    }).onDelete("cascade"),
    check("teams_version_positive_check", sql`${table.version} > 0`),
    check(
      "teams_preset_key_check",
      sql`${table.presetKey} in ('leadership', 'marketing', 'technology', 'operations', 'sales', 'custom')`,
    ),
    index("teams_workspace_name_idx").on(
      table.organizationId,
      table.workspaceId,
      table.name,
    ),
  ],
);

export const teamMembers = pgTable(
  "team_members",
  {
    organizationId: text("organization_id").notNull(),
    workspaceId: text("workspace_id").notNull(),
    teamId: text("team_id").notNull(),
    userId: text("user_id").notNull(),
    role: teamMemberRoleEnum("role").notNull().default("member"),
    version: integer("version").notNull().default(1),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.teamId, table.userId] }),
    uniqueIndex("team_members_org_workspace_team_user_unique").on(
      table.organizationId,
      table.workspaceId,
      table.teamId,
      table.userId,
    ),
    uniqueIndex("team_members_one_active_lead_unique")
      .on(table.organizationId, table.teamId)
      .where(sql`${table.role} = 'lead' and ${table.removedAt} is null`),
    foreignKey({
      columns: [table.organizationId, table.workspaceId, table.teamId],
      foreignColumns: [teams.organizationId, teams.workspaceId, teams.id],
      name: "team_members_org_workspace_team_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.workspaceId, table.userId],
      foreignColumns: [
        workspaceMembers.organizationId,
        workspaceMembers.workspaceId,
        workspaceMembers.userId,
      ],
      name: "team_members_org_workspace_member_fk",
    }).onDelete("cascade"),
    check("team_members_version_positive_check", sql`${table.version} > 0`),
    index("team_members_user_active_idx").on(
      table.organizationId,
      table.userId,
      table.removedAt,
    ),
  ],
);

export const teamFeaturePolicies = pgTable(
  "team_feature_policies",
  {
    organizationId: text("organization_id").notNull(),
    workspaceId: text("workspace_id").notNull(),
    teamId: text("team_id").notNull(),
    featureKey: text("feature_key").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    source: teamFeatureSourceEnum("source").notNull().default("preset"),
    updatedBy: text("updated_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.teamId, table.featureKey] }),
    foreignKey({
      columns: [table.organizationId, table.workspaceId, table.teamId],
      foreignColumns: [teams.organizationId, teams.workspaceId, teams.id],
      name: "team_feature_policies_org_workspace_team_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.updatedBy],
      foreignColumns: [memberships.organizationId, memberships.userId],
      name: "team_feature_policies_org_updater_fk",
    }),
    check(
      "team_feature_policies_feature_key_check",
      sql`${table.featureKey} in ('work', 'messages', 'decisions', 'approvals', 'resources', 'reporting')`,
    ),
  ],
);

export const invitationWorkspaceAssignments = pgTable(
  "invitation_workspace_assignments",
  {
    organizationId: text("organization_id").notNull(),
    invitationId: text("invitation_id").notNull(),
    workspaceId: text("workspace_id").notNull(),
    canManage: boolean("can_manage").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.invitationId, table.workspaceId] }),
    uniqueIndex("invitation_workspace_assignments_scope_unique").on(
      table.organizationId,
      table.invitationId,
      table.workspaceId,
    ),
    foreignKey({
      columns: [table.organizationId, table.invitationId],
      foreignColumns: [invitations.organizationId, invitations.id],
      name: "invitation_workspace_assignments_org_invitation_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.workspaceId],
      foreignColumns: [workspaces.organizationId, workspaces.id],
      name: "invitation_workspace_assignments_org_workspace_fk",
    }).onDelete("cascade"),
  ],
);

export const invitationTeamAssignments = pgTable(
  "invitation_team_assignments",
  {
    organizationId: text("organization_id").notNull(),
    invitationId: text("invitation_id").notNull(),
    workspaceId: text("workspace_id").notNull(),
    teamId: text("team_id").notNull(),
    role: teamMemberRoleEnum("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.invitationId, table.teamId] }),
    foreignKey({
      columns: [table.organizationId, table.invitationId, table.workspaceId],
      foreignColumns: [
        invitationWorkspaceAssignments.organizationId,
        invitationWorkspaceAssignments.invitationId,
        invitationWorkspaceAssignments.workspaceId,
      ],
      name: "invitation_team_assignments_workspace_assignment_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.workspaceId, table.teamId],
      foreignColumns: [teams.organizationId, teams.workspaceId, teams.id],
      name: "invitation_team_assignments_org_workspace_team_fk",
    }).onDelete("cascade"),
  ],
);

// Messaging is deliberately separate from Inbox. Inbox remains the user's
// action queue; conversations keep durable communication and work context.
export const conversations = pgTable(
  "conversations",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    portfolioId: text("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    purpose: text("purpose").notNull().default(""),
    kind: conversationKindEnum("kind").notNull(),
    visibility: conversationVisibilityEnum("visibility").notNull(),
    directKey: text("direct_key"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    retentionDays: integer("retention_days").notNull().default(365),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("conversations_org_id_unique").on(
      table.organizationId,
      table.id,
    ),
    uniqueIndex("conversations_org_workspace_id_unique").on(
      table.organizationId,
      table.workspaceId,
      table.id,
    ),
    uniqueIndex("conversations_workspace_active_direct_unique")
      .on(table.organizationId, table.workspaceId, table.directKey)
      .where(
        sql`${table.kind} = 'direct' and ${table.deletedAt} is null and ${table.archivedAt} is null`,
      ),
    foreignKey({
      columns: [table.organizationId, table.portfolioId, table.workspaceId],
      foreignColumns: [
        workspaces.organizationId,
        workspaces.portfolioId,
        workspaces.id,
      ],
      name: "conversations_org_portfolio_workspace_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.createdBy],
      foreignColumns: [memberships.organizationId, memberships.userId],
      name: "conversations_org_creator_membership_fk",
    }),
    check(
      "conversations_kind_visibility_check",
      sql`(${table.kind} = 'workspace' and ${table.visibility} in ('organization', 'private'))
        or (${table.kind} in ('team', 'direct') and ${table.visibility} = 'private')
        or (${table.kind} = 'external' and ${table.visibility} = 'guest_scoped')`,
    ),
    check(
      "conversations_retention_days_check",
      sql`${table.retentionDays} between 1 and 3650`,
    ),
    check(
      "conversations_direct_key_check",
      sql`(${table.kind} = 'direct') = (${table.directKey} is not null)`,
    ),
    check("conversations_version_positive_check", sql`${table.version} > 0`),
    index("conversations_org_activity_idx").on(
      table.organizationId,
      table.lastMessageAt,
    ),
    index("conversations_workspace_activity_idx").on(
      table.organizationId,
      table.workspaceId,
      table.lastMessageAt,
    ),
  ],
);

export const teamRooms = pgTable(
  "team_rooms",
  {
    organizationId: text("organization_id").notNull(),
    workspaceId: text("workspace_id").notNull(),
    teamId: text("team_id").notNull(),
    conversationId: text("conversation_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.teamId] }),
    uniqueIndex("team_rooms_conversation_unique").on(table.conversationId),
    uniqueIndex("team_rooms_org_workspace_team_unique").on(
      table.organizationId,
      table.workspaceId,
      table.teamId,
    ),
    foreignKey({
      columns: [table.organizationId, table.workspaceId, table.teamId],
      foreignColumns: [teams.organizationId, teams.workspaceId, teams.id],
      name: "team_rooms_org_workspace_team_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.workspaceId, table.conversationId],
      foreignColumns: [
        conversations.organizationId,
        conversations.workspaceId,
        conversations.id,
      ],
      name: "team_rooms_org_workspace_conversation_fk",
    }).onDelete("cascade"),
  ],
);

export const conversationParticipants = pgTable(
  "conversation_participants",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    participantRole: text("participant_role").notNull().default("member"),
    source: conversationParticipantSourceEnum("source")
      .notNull()
      .default("manual"),
    notificationLevel: text("notification_level").notNull().default("all"),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }),
    mutedUntil: timestamp("muted_until", { withTimezone: true }),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.conversationId, table.userId] }),
    uniqueIndex("conversation_participants_org_conversation_user_unique").on(
      table.organizationId,
      table.conversationId,
      table.userId,
    ),
    uniqueIndex(
      "conversation_participants_org_workspace_conversation_user_unique",
    ).on(
      table.organizationId,
      table.workspaceId,
      table.conversationId,
      table.userId,
    ),
    foreignKey({
      columns: [table.organizationId, table.workspaceId, table.conversationId],
      foreignColumns: [
        conversations.organizationId,
        conversations.workspaceId,
        conversations.id,
      ],
      name: "conversation_participants_org_workspace_conversation_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.userId],
      foreignColumns: [memberships.organizationId, memberships.userId],
      name: "conversation_participants_org_membership_fk",
    }),
    check(
      "conversation_participants_version_positive_check",
      sql`${table.version} > 0`,
    ),
    check(
      "conversation_participants_role_check",
      sql`${table.participantRole} in ('owner', 'member', 'guest')`,
    ),
    check(
      "conversation_participants_notification_check",
      sql`${table.notificationLevel} in ('all', 'mentions', 'none')`,
    ),
    index("conversation_participants_user_idx").on(
      table.organizationId,
      table.userId,
      table.removedAt,
    ),
  ],
);

export const conversationMessages = pgTable(
  "conversation_messages",
  {
    id: text("id").primaryKey(),
    sequence: serial("sequence").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").notNull(),
    senderId: text("sender_id")
      .notNull()
      .references(() => users.id),
    parentMessageId: text("parent_message_id"),
    clientMessageId: text("client_message_id").notNull(),
    body: text("body").notNull(),
    intent: messageIntentEnum("intent").notNull().default("message"),
    responseOwnerId: text("response_owner_id").references(() => users.id),
    responseDueAt: timestamp("response_due_at", { withTimezone: true }),
    responseState: messageResponseStateEnum("response_state"),
    linkedEntityType: text("linked_entity_type"),
    linkedEntityId: text("linked_entity_id"),
    metadata: jsonb("metadata").notNull().default({}),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    redactedAt: timestamp("redacted_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("conversation_messages_org_conversation_id_unique").on(
      table.organizationId,
      table.conversationId,
      table.id,
    ),
    uniqueIndex(
      "conversation_messages_org_workspace_conversation_id_unique",
    ).on(
      table.organizationId,
      table.workspaceId,
      table.conversationId,
      table.id,
    ),
    uniqueIndex("conversation_messages_org_conversation_sequence_unique").on(
      table.organizationId,
      table.conversationId,
      table.sequence,
    ),
    uniqueIndex("conversation_messages_client_id_unique").on(
      table.organizationId,
      table.conversationId,
      table.senderId,
      table.clientMessageId,
    ),
    foreignKey({
      columns: [table.organizationId, table.workspaceId, table.conversationId],
      foreignColumns: [
        conversations.organizationId,
        conversations.workspaceId,
        conversations.id,
      ],
      name: "conversation_messages_org_workspace_conversation_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.conversationId, table.senderId],
      foreignColumns: [
        conversationParticipants.organizationId,
        conversationParticipants.conversationId,
        conversationParticipants.userId,
      ],
      name: "conversation_messages_org_sender_participant_fk",
    }),
    foreignKey({
      columns: [
        table.organizationId,
        table.conversationId,
        table.responseOwnerId,
      ],
      foreignColumns: [
        conversationParticipants.organizationId,
        conversationParticipants.conversationId,
        conversationParticipants.userId,
      ],
      name: "conversation_messages_org_response_owner_participant_fk",
    }),
    foreignKey({
      columns: [
        table.organizationId,
        table.conversationId,
        table.parentMessageId,
      ],
      foreignColumns: [table.organizationId, table.conversationId, table.id],
      name: "conversation_messages_scoped_parent_fk",
    }).onDelete("cascade"),
    check(
      "conversation_messages_version_positive_check",
      sql`${table.version} > 0`,
    ),
    check(
      "conversation_messages_body_check",
      sql`length(trim(${table.body})) between 1 and 20000`,
    ),
    check(
      "conversation_messages_link_check",
      sql`(${table.linkedEntityType} is null) = (${table.linkedEntityId} is null)`,
    ),
    check(
      "conversation_messages_response_check",
      sql`${table.responseState} is null or ${table.responseState}::text = 'cancelled' or ${table.responseOwnerId} is not null`,
    ),
    check(
      "conversation_messages_expiry_check",
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
    index("conversation_messages_timeline_idx").on(
      table.organizationId,
      table.conversationId,
      table.createdAt,
    ),
    index("conversation_messages_thread_idx").on(
      table.organizationId,
      table.parentMessageId,
      table.createdAt,
    ),
    index("conversation_messages_response_idx").on(
      table.organizationId,
      table.responseOwnerId,
      table.responseState,
      table.responseDueAt,
    ),
  ],
);

// Raw pre-Phase-4 metadata is retained here only when it cannot satisfy the
// bounded public Message contract. Application repositories deliberately do
// not read this operator-only quarantine.
export const conversationMessageMetadataQuarantine = pgTable(
  "conversation_message_metadata_quarantine",
  {
    messageId: text("message_id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    workspaceId: text("workspace_id").notNull(),
    conversationId: text("conversation_id").notNull(),
    originalMetadata: jsonb("original_metadata").notNull(),
    originalOctetLength: integer("original_octet_length").notNull(),
    quarantineReason: text("quarantine_reason").notNull(),
    quarantinedAt: timestamp("quarantined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [
        table.organizationId,
        table.workspaceId,
        table.conversationId,
        table.messageId,
      ],
      foreignColumns: [
        conversationMessages.organizationId,
        conversationMessages.workspaceId,
        conversationMessages.conversationId,
        conversationMessages.id,
      ],
      name: "conversation_message_metadata_quarantine_scoped_message_fk",
    }).onDelete("cascade"),
    index("conversation_message_metadata_quarantine_scope_idx").on(
      table.organizationId,
      table.workspaceId,
      table.conversationId,
    ),
  ],
);

export const conversationReactions = pgTable(
  "conversation_reactions",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    messageId: text("message_id")
      .notNull()
      .references(() => conversationMessages.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").notNull(),
    conversationId: text("conversation_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.messageId, table.userId, table.emoji] }),
    foreignKey({
      columns: [
        table.organizationId,
        table.workspaceId,
        table.conversationId,
        table.messageId,
      ],
      foreignColumns: [
        conversationMessages.organizationId,
        conversationMessages.workspaceId,
        conversationMessages.conversationId,
        conversationMessages.id,
      ],
      name: "conversation_reactions_scoped_message_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [
        table.organizationId,
        table.workspaceId,
        table.conversationId,
        table.userId,
      ],
      foreignColumns: [
        conversationParticipants.organizationId,
        conversationParticipants.workspaceId,
        conversationParticipants.conversationId,
        conversationParticipants.userId,
      ],
      name: "conversation_reactions_participant_fk",
    }).onDelete("cascade"),
    check(
      "conversation_reactions_emoji_check",
      sql`length(trim(${table.emoji})) between 1 and 32`,
    ),
  ],
);

export const conversationReadCheckpoints = pgTable(
  "conversation_read_checkpoints",
  {
    organizationId: text("organization_id").notNull(),
    workspaceId: text("workspace_id").notNull(),
    conversationId: text("conversation_id").notNull(),
    userId: text("user_id").notNull(),
    lastReadMessageId: text("last_read_message_id"),
    lastReadAt: timestamp("last_read_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    version: integer("version").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.conversationId, table.userId] }),
    foreignKey({
      columns: [
        table.organizationId,
        table.workspaceId,
        table.conversationId,
        table.userId,
      ],
      foreignColumns: [
        conversationParticipants.organizationId,
        conversationParticipants.workspaceId,
        conversationParticipants.conversationId,
        conversationParticipants.userId,
      ],
      name: "conversation_read_checkpoints_participant_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [
        table.organizationId,
        table.workspaceId,
        table.conversationId,
        table.lastReadMessageId,
      ],
      foreignColumns: [
        conversationMessages.organizationId,
        conversationMessages.workspaceId,
        conversationMessages.conversationId,
        conversationMessages.id,
      ],
      name: "conversation_read_checkpoints_message_fk",
    }),
  ],
);

export const collaborationEvents = pgTable(
  "collaboration_events",
  {
    id: text("id").primaryKey(),
    cursor: serial("cursor").notNull(),
    organizationId: text("organization_id").notNull(),
    workspaceId: text("workspace_id").notNull(),
    conversationId: text("conversation_id"),
    actorId: text("actor_id"),
    eventType: text("event_type").notNull(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: text("aggregate_id").notNull(),
    payload: jsonb("payload").notNull().default({}),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("collaboration_events_org_id_unique").on(
      table.organizationId,
      table.id,
    ),
    uniqueIndex("collaboration_events_org_cursor_unique").on(
      table.organizationId,
      table.cursor,
    ),
    foreignKey({
      columns: [table.organizationId, table.workspaceId],
      foreignColumns: [workspaces.organizationId, workspaces.id],
      name: "collaboration_events_org_workspace_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.workspaceId, table.conversationId],
      foreignColumns: [
        conversations.organizationId,
        conversations.workspaceId,
        conversations.id,
      ],
      name: "collaboration_events_org_workspace_conversation_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.actorId],
      foreignColumns: [memberships.organizationId, memberships.userId],
      name: "collaboration_events_org_actor_fk",
    }),
    check(
      "collaboration_events_expiry_check",
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
    index("collaboration_events_workspace_feed_idx").on(
      table.organizationId,
      table.workspaceId,
      table.createdAt,
      table.id,
    ),
  ],
);

export const messageAttachments = pgTable(
  "message_attachments",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").notNull(),
    conversationId: text("conversation_id").notNull(),
    messageId: text("message_id")
      .notNull()
      .references(() => conversationMessages.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    uploadedBy: text("uploaded_by")
      .notNull()
      .references(() => users.id),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [
        table.organizationId,
        table.workspaceId,
        table.conversationId,
        table.messageId,
      ],
      foreignColumns: [
        conversationMessages.organizationId,
        conversationMessages.workspaceId,
        conversationMessages.conversationId,
        conversationMessages.id,
      ],
      name: "message_attachments_scoped_message_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [
        table.organizationId,
        table.workspaceId,
        table.conversationId,
        table.uploadedBy,
      ],
      foreignColumns: [
        conversationParticipants.organizationId,
        conversationParticipants.workspaceId,
        conversationParticipants.conversationId,
        conversationParticipants.userId,
      ],
      name: "message_attachments_uploader_participant_fk",
    }),
    index("message_attachments_message_idx").on(
      table.organizationId,
      table.messageId,
    ),
  ],
);

// Better Auth owns these identity/session tables. Product profiles remain in
// app_users so authorization data can evolve independently from credentials.
export const authUsers = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("emailVerified").notNull().default(false),
    image: text("image"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Better Auth injects this server-only digest while an invite-only account
    // is being created. A database trigger atomically consumes it into
    // registration_invitation_claims and clears the transient value before the
    // transaction commits.
    registrationInvitationTokenHash: text("registrationInvitationTokenHash"),
  },
  (table) => [uniqueIndex("auth_user_email_unique").on(table.email)],
);

export const registrationInvitationClaims = pgTable(
  "registration_invitation_claims",
  {
    invitationId: text("invitation_id")
      .primaryKey()
      .references(() => invitations.id, { onDelete: "cascade" }),
    authUserId: text("auth_user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    claimedAt: timestamp("claimed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("registration_invitation_claims_auth_user_unique").on(
      table.authUserId,
    ),
  ],
);

export const authSessions = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
    token: text("token").notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ipAddress: text("ipAddress"),
    userAgent: text("userAgent"),
    userId: text("userId")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("auth_session_token_unique").on(table.token),
    index("auth_session_user_idx").on(table.userId),
  ],
);

export const authAccounts = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("accountId").notNull(),
    issuer: text("issuer").notNull(),
    providerId: text("providerId").notNull(),
    userId: text("userId")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    accessToken: text("accessToken"),
    refreshToken: text("refreshToken"),
    idToken: text("idToken"),
    accessTokenExpiresAt: timestamp("accessTokenExpiresAt", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("auth_account_issuer_account_unique").on(
      table.issuer,
      table.accountId,
    ),
    index("auth_account_user_idx").on(table.userId),
  ],
);

export const authVerifications = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("auth_verification_identifier_idx").on(table.identifier)],
);

// Better Auth identities and application users intentionally remain separate.
// This one-to-one mapping is the only live bridge from credentials to product
// authorization and is resolved exclusively on the server.
export const authUserMappings = pgTable(
  "auth_user_mappings",
  {
    authUserId: text("auth_user_id")
      .primaryKey()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    appUserId: text("app_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("auth_user_mappings_app_user_unique").on(table.appUserId),
  ],
);

// The active organization is server-owned state. A client can request a switch,
// but this composite FK and repository checks require a real membership.
export const appUserOrganizationSelections = pgTable(
  "app_user_organization_selections",
  {
    appUserId: text("app_user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    selectedAt: timestamp("selected_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.appUserId],
      foreignColumns: [memberships.organizationId, memberships.userId],
      name: "app_user_org_selections_membership_fk",
    }).onDelete("cascade"),
    index("app_user_org_selections_org_idx").on(table.organizationId),
  ],
);

// Drafts contain only the explicitly typed, non-secret onboarding fields. The
// completion columns are written in the same transaction as the tenant graph.
export const onboardingProgress = pgTable(
  "onboarding_progress",
  {
    authUserId: text("auth_user_id")
      .primaryKey()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    appUserId: text("app_user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    status: onboardingStatusEnum("status").notNull().default("draft"),
    step: text("step").notNull().default("1"),
    draft: jsonb("draft").notNull().default({}),
    version: integer("version").notNull().default(1),
    completionIdempotencyKey: text("completion_idempotency_key"),
    completionRequestFingerprint: text("completion_request_fingerprint"),
    completedOrganizationId: text("completed_organization_id").references(
      () => organizations.id,
      { onDelete: "set null" },
    ),
    completedPortfolioId: text("completed_portfolio_id").references(
      () => portfolios.id,
      { onDelete: "set null" },
    ),
    completedWorkspaceId: text("completed_workspace_id").references(
      () => workspaces.id,
      { onDelete: "set null" },
    ),
    completedBoardId: text("completed_board_id").references(() => boards.id, {
      onDelete: "set null",
    }),
    completedBlueprintId: text("completed_blueprint_id").references(
      () => blueprints.id,
      { onDelete: "set null" },
    ),
    completedBlueprintInstanceId: text(
      "completed_blueprint_instance_id",
    ).references(() => blueprintInstances.id, { onDelete: "set null" }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("onboarding_progress_app_user_unique")
      .on(table.appUserId)
      .where(sql`${table.appUserId} is not null`),
    foreignKey({
      columns: [table.completedOrganizationId, table.completedPortfolioId],
      foreignColumns: [portfolios.organizationId, portfolios.id],
      name: "onboarding_progress_org_portfolio_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.completedOrganizationId, table.completedWorkspaceId],
      foreignColumns: [workspaces.organizationId, workspaces.id],
      name: "onboarding_progress_org_workspace_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [
        table.completedOrganizationId,
        table.completedWorkspaceId,
        table.completedBoardId,
      ],
      foreignColumns: [boards.organizationId, boards.workspaceId, boards.id],
      name: "onboarding_progress_org_workspace_board_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.completedOrganizationId, table.completedBlueprintId],
      foreignColumns: [blueprints.organizationId, blueprints.id],
      name: "onboarding_progress_org_blueprint_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [
        table.completedOrganizationId,
        table.completedBlueprintInstanceId,
      ],
      foreignColumns: [
        blueprintInstances.organizationId,
        blueprintInstances.id,
      ],
      name: "onboarding_progress_org_blueprint_instance_fk",
    }).onDelete("set null"),
    check(
      "onboarding_progress_completion_check",
      sql`(
        ${table.status} = 'draft'
        and ${table.completedAt} is null
      ) or (
        ${table.status} = 'completed'
        and ${table.appUserId} is not null
        and ${table.completionIdempotencyKey} is not null
        and ${table.completionRequestFingerprint} is not null
        and ${table.completedOrganizationId} is not null
        and ${table.completedPortfolioId} is not null
        and ${table.completedWorkspaceId} is not null
        and ${table.completedBoardId} is not null
        and ${table.completedBlueprintId} is not null
        and ${table.completedBlueprintInstanceId} is not null
        and ${table.completedAt} is not null
      )`,
    ),
  ],
);
