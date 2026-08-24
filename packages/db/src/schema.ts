import {
  boolean,
  date,
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

export const roleEnum = pgEnum("membership_role", [
  "owner",
  "admin",
  "hub_lead",
  "member",
  "guest",
  "viewer",
]);
export const hubTypeEnum = pgEnum("hub_type", [
  "venture",
  "brand",
  "product",
  "shared_function",
  "client_program",
  "journey",
  "other",
]);
export const hubHealthEnum = pgEnum("hub_health", [
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
  "weighted_milestones",
  "manual",
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

export const hubs = pgTable(
  "hubs",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description").notNull().default(""),
    type: hubTypeEnum("type").notNull(),
    accentColor: text("accent_color").notNull(),
    icon: text("icon").notNull(),
    visibility: visibilityEnum("visibility").notNull().default("private"),
    lifecycleStage: lifecycleEnum("lifecycle_stage").notNull(),
    health: hubHealthEnum("health").notNull(),
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
    ...timestamps,
  },
  (table) => [
    uniqueIndex("hubs_org_slug_unique").on(table.organizationId, table.slug),
    index("hubs_org_health_idx").on(table.organizationId, table.health),
    index("hubs_org_lead_idx").on(table.organizationId, table.leadUserId),
  ],
);

export const hubMembers = pgTable(
  "hub_members",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    hubId: text("hub_id")
      .notNull()
      .references(() => hubs.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    canManage: boolean("can_manage").notNull().default(false),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.hubId, table.userId] }),
    index("hub_members_user_idx").on(table.organizationId, table.userId),
  ],
);

export const boards = pgTable(
  "boards",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    hubId: text("hub_id")
      .notNull()
      .references(() => hubs.id, { onDelete: "cascade" }),
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
    index("boards_org_hub_idx").on(table.organizationId, table.hubId),
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
    hubId: text("hub_id")
      .notNull()
      .references(() => hubs.id, { onDelete: "cascade" }),
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
    index("items_org_hub_idx").on(table.organizationId, table.hubId),
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
  },
  (table) => [primaryKey({ columns: [table.itemId, table.dependsOnItemId] })],
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
  hubId: text("hub_id").references(() => hubs.id, { onDelete: "cascade" }),
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

export const hubUpdates = pgTable(
  "hub_updates",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    hubId: text("hub_id")
      .notNull()
      .references(() => hubs.id, { onDelete: "cascade" }),
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
    index("hub_updates_hub_date_idx").on(
      table.organizationId,
      table.hubId,
      table.publishedAt,
    ),
  ],
);
export const hubMetrics = pgTable("hub_metrics", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  hubId: text("hub_id")
    .notNull()
    .references(() => hubs.id, { onDelete: "cascade" }),
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
    .references(() => hubMetrics.id, { onDelete: "cascade" }),
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
    organizationId: text("organization_id").notNull(),
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
    organizationId: text("organization_id").notNull(),
    eventType: text("event_type").notNull(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: text("aggregate_id").notNull(),
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
    index("outbox_pending_idx").on(table.processedAt, table.availableAt),
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
