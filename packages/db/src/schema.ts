import {
  boolean,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
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
export const messageIntentEnum = pgEnum("message_intent", [
  "message",
  "request",
  "decision",
  "update",
]);
export const messageResponseStateEnum = pgEnum("message_response_state", [
  "open",
  "resolved",
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
  (table) => [uniqueIndex("app_users_email_unique").on(table.email)],
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
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
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
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("notifications_user_unread_idx").on(
      table.organizationId,
      table.userId,
      table.readAt,
    ),
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
    index("outbox_pending_idx").on(table.processedAt, table.availableAt),
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
    recommendedAction: text("recommended_action"),
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
  (table) => [index("blueprints_org_idx").on(table.organizationId)],
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
    uniqueIndex("blueprint_versions_number_unique").on(
      table.blueprintId,
      table.version,
    ),
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
    uniqueIndex("blueprint_instances_board_unique").on(table.boardId),
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

// Messaging is deliberately separate from Inbox. Inbox remains the user's
// action queue; conversations keep durable communication and work context.
export const conversations = pgTable(
  "conversations",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    portfolioId: text("portfolio_id").references(() => portfolios.id, {
      onDelete: "cascade",
    }),
    workspaceId: text("workspace_id").references(() => workspaces.id, {
      onDelete: "cascade",
    }),
    title: text("title").notNull(),
    purpose: text("purpose").notNull().default(""),
    kind: conversationKindEnum("kind").notNull(),
    visibility: conversationVisibilityEnum("visibility").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ...timestamps,
  },
  (table) => [
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

export const conversationParticipants = pgTable(
  "conversation_participants",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    participantRole: text("participant_role").notNull().default("member"),
    notificationLevel: text("notification_level").notNull().default("all"),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }),
    mutedUntil: timestamp("muted_until", { withTimezone: true }),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    removedAt: timestamp("removed_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.conversationId, table.userId] }),
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
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    senderId: text("sender_id")
      .notNull()
      .references(() => users.id),
    parentMessageId: text("parent_message_id"),
    body: text("body").notNull(),
    intent: messageIntentEnum("intent").notNull().default("message"),
    responseOwnerId: text("response_owner_id").references(() => users.id),
    responseDueAt: timestamp("response_due_at", { withTimezone: true }),
    responseState: messageResponseStateEnum("response_state"),
    linkedEntityType: text("linked_entity_type"),
    linkedEntityId: text("linked_entity_id"),
    metadata: jsonb("metadata").notNull().default({}),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
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

export const conversationReactions = pgTable(
  "conversation_reactions",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    messageId: text("message_id")
      .notNull()
      .references(() => conversationMessages.id, { onDelete: "cascade" }),
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
  ],
);

export const messageAttachments = pgTable(
  "message_attachments",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
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
  },
  (table) => [uniqueIndex("auth_user_email_unique").on(table.email)],
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
  (table) => [index("auth_account_user_idx").on(table.userId)],
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
