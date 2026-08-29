import { z } from "zod";

export const idSchema = z.string().min(3).max(128);
export const cursorSchema = z.string().max(512).optional();
export const roleSchema = z.enum([
  "owner",
  "admin",
  "workspace_lead",
  "member",
  "guest",
  "viewer",
]);
export const workspaceHealthSchema = z.enum([
  "on_track",
  "watch",
  "critical",
  "parked",
]);
export const lifecycleStageSchema = z.enum([
  "idea",
  "validate",
  "build",
  "launch",
  "grow",
  "operate",
  "paused",
  "archived",
]);
export const workspaceTypeSchema = z.enum([
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
  "client_program",
  "journey",
  "other",
]);
export const itemTypeSchema = z.enum([
  "task",
  "decision",
  "approval",
  "milestone",
  "idea",
  "request",
]);
export const itemStatusSchema = z.enum([
  "not_started",
  "working",
  "blocked",
  "review",
  "done",
]);
export const prioritySchema = z.enum([
  "urgent",
  "high",
  "normal",
  "low",
  "none",
]);

export const userSchema = z.object({
  id: idSchema,
  email: z.email(),
  name: z.string().min(1).max(160),
  role: roleSchema,
  locale: z.enum(["en", "de"]),
});

export const sessionSchema = z.object({
  user: userSchema,
  organizationId: idSchema,
  expiresAt: z.iso.datetime(),
});

export const workspaceSchema = z.object({
  id: idSchema,
  portfolioId: idSchema,
  slug: z.string().min(1).max(120),
  name: z.string().min(1).max(160),
  icon: z.string().min(1).max(12),
  accent: z.string().regex(/^#[0-9a-f]{6}$/i),
  type: workspaceTypeSchema,
  stage: lifecycleStageSchema,
  health: workspaceHealthSchema,
  healthNote: z.string().max(1_000),
  priority: z.string().max(500),
  lead: z
    .object({ name: z.string(), initials: z.string(), color: z.string() })
    .optional(),
  nextMilestone: z.object({ title: z.string(), date: z.iso.date() }).optional(),
  latestUpdate: z.object({ text: z.string(), date: z.iso.date() }).optional(),
  metrics: z
    .array(
      z.object({
        label: z.string(),
        value: z.string(),
        trend: z.string().optional(),
      }),
    )
    .max(12),
});

const workItemBaseSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  boardId: idSchema,
  title: z.string().min(1).max(500),
  type: itemTypeSchema,
  priority: prioritySchema,
  status: itemStatusSchema,
  dueDate: z.iso.date().optional(),
  assignees: z
    .array(
      z.object({
        id: idSchema,
        name: z.string().min(1).max(160),
      }),
    )
    .max(100),
  approvalState: z
    .enum(["pending", "changes_requested", "approved", "rejected"])
    .optional(),
  decisionState: z
    .enum(["needed", "analyzing", "delegated", "deferred", "decided"])
    .optional(),
  version: z.number().int().nonnegative().max(2_147_483_647),
});

export const workItemSchema = workItemBaseSchema.superRefine(
  (value, context) => {
    if (value.type === "approval" && !value.approvalState)
      context.addIssue({
        code: "custom",
        path: ["approvalState"],
        message: "An approval item needs an approval state.",
      });
    if (value.type !== "approval" && value.approvalState)
      context.addIssue({
        code: "custom",
        path: ["approvalState"],
        message: "Only approval items can carry an approval state.",
      });
    if (value.type === "decision" && !value.decisionState)
      context.addIssue({
        code: "custom",
        path: ["decisionState"],
        message: "A decision item needs a decision state.",
      });
    if (value.type !== "decision" && value.decisionState)
      context.addIssue({
        code: "custom",
        path: ["decisionState"],
        message: "Only decision items can carry a decision state.",
      });
  },
);

export const workspaceRollupSchema = z.object({
  open: z.number().int().nonnegative(),
  overdue: z.number().int().nonnegative(),
  blocked: z.number().int().nonnegative(),
  decisions: z.number().int().nonnegative(),
  approvals: z.number().int().nonnegative(),
  score: z.number().nonnegative(),
});

export const portfolioSignalSchema = z.object({
  decisions: z.number().int().nonnegative(),
  approvals: z.number().int().nonnegative(),
  blocked: z.number().int().nonnegative(),
  overdueMilestones: z.number().int().nonnegative(),
  staleUpdates: z.number().int().nonnegative(),
  unassignedUrgent: z.number().int().nonnegative(),
});

export const portfolioSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  name: z.string().min(1).max(160),
  slug: z.string().min(1).max(120),
  description: z.string().max(1_000),
  isDefault: z.boolean(),
});

export const portfolioResponseSchema = z.object({
  asOf: z.iso.datetime(),
  portfolio: portfolioSchema,
  signals: portfolioSignalSchema,
  workspaces: z.array(
    z.object({ workspace: workspaceSchema, rollup: workspaceRollupSchema }),
  ),
});

export const attentionSignalSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  portfolioId: idSchema,
  workspaceId: idSchema.optional(),
  entityType: z.string().min(1).max(80),
  entityId: idSchema,
  signalType: z.string().min(1).max(120),
  severity: z.enum(["info", "low", "medium", "high", "critical"]),
  impact: z.number().min(1).max(5),
  urgency: z.number().min(1).max(5),
  responsibility: z.number().positive(),
  reason: z.string().min(1).max(2_000),
  recommendedAction: z.string().max(2_000).optional(),
  createdAt: z.iso.datetime(),
  resolvedAt: z.iso.datetime().optional(),
  dismissedAt: z.iso.datetime().optional(),
  snoozedUntil: z.iso.datetime().optional(),
  actionReason: z.string().max(1_000).optional(),
  metadata: z.record(z.string(), z.unknown()),
  version: z.number().int().nonnegative().max(2_147_483_647),
});

export const attentionActionSchema = z
  .object({
    action: z.enum(["resolve", "dismiss", "snooze"]),
    reason: z.string().trim().min(3).max(1_000).optional(),
    snoozedUntil: z.iso.datetime().optional(),
  })
  .superRefine((value, context) => {
    if (["dismiss", "snooze"].includes(value.action) && !value.reason)
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: "A reason is required when dismissing or snoozing a signal.",
      });
    if (value.action === "snooze" && !value.snoozedUntil)
      context.addIssue({
        code: "custom",
        path: ["snoozedUntil"],
        message: "A snooze-until date is required.",
      });
  });

export const waitingStateSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  portfolioId: idSchema,
  workspaceId: idSchema,
  entityType: z.enum(["work_item", "decision", "approval"]),
  entityId: idSchema,
  title: z.string().min(1).max(500),
  waitingType: z.enum([
    "person",
    "team",
    "external_partner",
    "client",
    "vendor",
    "decision",
    "document",
    "dependency",
    "other",
  ]),
  waitingReferenceId: idSchema.optional(),
  waitingLabel: z.string().max(200).optional(),
  waitingSince: z.iso.date(),
  expectedBy: z.iso.date().optional(),
  followUpOwnerId: idSchema,
  followUpOwnerName: z.string().min(1).max(160),
  nextFollowUp: z.iso.date().optional(),
  waitingNote: z.string().max(2_000).optional(),
  resolvedAt: z.iso.datetime().optional(),
  version: z.number().int().nonnegative().max(2_147_483_647),
});

export const waitingActionSchema = z
  .object({
    action: z.enum(["resolve", "nudge", "reschedule"]),
    note: z.string().trim().max(1_000).optional(),
    nextFollowUp: z.iso.date().optional(),
  })
  .superRefine((value, context) => {
    if (value.action === "reschedule" && !value.nextFollowUp)
      context.addIssue({
        code: "custom",
        path: ["nextFollowUp"],
        message: "A rescheduled follow-up needs a new date.",
      });
  });

export const weeklyReviewInputSchema = z.object({
  workspaceId: idSchema,
  health: workspaceHealthSchema,
  progress: z.string().trim().min(1),
  blocker: z.string().trim().min(1),
  nextMilestone: z.string().trim().min(1),
  decisionNeeded: z.string().trim().optional(),
  priorityNextWeek: z.string().trim().min(1),
});

export const weeklyReviewResponseSchema = z.object({
  update: z.object({
    id: idSchema,
    workspaceId: idSchema,
    health: workspaceHealthSchema,
    progress: z.string(),
    blocker: z.string(),
    nextMilestone: z.string(),
    decisionNeeded: z.string().optional(),
    priorityNextWeek: z.string(),
    publishedAt: z.iso.datetime(),
  }),
  snapshot: z.object({
    id: idSchema,
    organizationId: idSchema,
    portfolioId: idSchema,
    workspaceId: idSchema,
    capturedAt: z.iso.datetime(),
    health: workspaceHealthSchema,
    source: z.literal("weekly_review"),
  }),
  attentionRefreshQueued: z.boolean(),
});

export const workspaceDetailSchema = z.object({
  workspace: workspaceSchema,
  rollup: workspaceRollupSchema,
  items: z.array(workItemSchema),
});

export const meaningfulChangeSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  portfolioId: idSchema,
  workspaceId: idSchema,
  entityType: z.string().min(1).max(80),
  entityId: idSchema,
  type: z.enum([
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
  ]),
  summary: z.string().min(1).max(2_000),
  occurredAt: z.iso.datetime(),
  importance: z.number().nonnegative(),
  metadata: z.record(z.string(), z.unknown()),
});

export const changeRadarSchema = z.object({
  checkpoint: z.object({
    userId: idSchema,
    portfolioId: idSchema,
    lastSeenAt: z.iso.datetime(),
  }),
  changes: z.array(meaningfulChangeSchema),
});

export const workspaceSnapshotSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  portfolioId: idSchema,
  workspaceId: idSchema,
  capturedAt: z.iso.datetime(),
  health: workspaceHealthSchema,
  progress: z.number().optional(),
  openCount: z.number().int().nonnegative(),
  overdueCount: z.number().int().nonnegative(),
  blockedCount: z.number().int().nonnegative(),
  decisionCount: z.number().int().nonnegative(),
  attentionCount: z.number().int().nonnegative(),
  nextMilestoneId: idSchema.optional(),
  nextMilestoneStatus: z.string().max(120).optional(),
  latestUpdateAt: z.iso.datetime().optional(),
  source: z.enum(["weekly_review", "monthly_review", "manual"]),
});

export const reviewRitualSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  portfolioId: idSchema,
  workspaceId: idSchema.optional(),
  type: z.enum(["daily_focus", "weekly_workspace", "monthly_portfolio"]),
  cadence: z.string().min(1).max(160),
  enabled: z.boolean(),
  nextDueAt: z.iso.datetime().optional(),
  reminderEnabled: z.boolean(),
});

export const decisionOutcomeSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  portfolioId: idSchema,
  decisionItemId: idSchema,
  outcome: z.enum([
    "better_than_expected",
    "as_expected",
    "worse_than_expected",
    "too_early",
  ]),
  learning: z.string().max(5_000),
  wouldRepeat: z.boolean().optional(),
  recordedBy: idSchema,
  recordedAt: z.iso.datetime(),
});

export const managementMemorySchema = z.object({
  workspaceSnapshots: z.array(workspaceSnapshotSchema),
  reviewRituals: z.array(reviewRitualSchema),
  decisionOutcomes: z.array(decisionOutcomeSchema),
});

export const searchResultSchema = z.object({
  workspaces: z.array(workspaceSchema),
  items: z.array(workItemSchema),
});

export const conversationKindSchema = z.enum([
  "workspace",
  "team",
  "direct",
  "external",
]);
export const conversationVisibilitySchema = z.enum([
  "organization",
  "private",
  "guest_scoped",
]);
export const messageIntentSchema = z.enum([
  "message",
  "request",
  "decision",
  "update",
]);
export const messageResponseStateSchema = z.enum(["open", "resolved"]);

export const conversationSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  portfolioId: idSchema,
  workspaceId: idSchema,
  title: z.string().trim().min(1).max(160),
  purpose: z.string().trim().max(1_000),
  kind: conversationKindSchema,
  visibility: conversationVisibilitySchema,
  participantIds: z.array(idSchema).min(1).max(250),
  lastMessageAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});

export const conversationMessageSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  conversationId: idSchema,
  senderId: idSchema,
  parentMessageId: idSchema.optional(),
  body: z.string().trim().min(1).max(20_000),
  intent: messageIntentSchema,
  responseOwnerId: idSchema.optional(),
  responseDueAt: z.iso.datetime().optional(),
  responseState: messageResponseStateSchema.optional(),
  linkedEntityType: z.string().trim().max(80).optional(),
  linkedEntityId: idSchema.optional(),
  metadata: z.record(z.string(), z.unknown()),
  editedAt: z.iso.datetime().optional(),
  createdAt: z.iso.datetime(),
});

export const createConversationSchema = conversationSchema
  .omit({
    id: true,
    organizationId: true,
    lastMessageAt: true,
    createdAt: true,
  })
  .superRefine((value, context) => {
    if (value.kind === "direct" && value.participantIds.length !== 2)
      context.addIssue({
        code: "custom",
        path: ["participantIds"],
        message: "A direct conversation must have exactly two participants.",
      });
    if (value.kind === "external" && value.visibility !== "guest_scoped")
      context.addIssue({
        code: "custom",
        path: ["visibility"],
        message: "External rooms must use guest-scoped visibility.",
      });
  });

export const createConversationMessageSchema = conversationMessageSchema
  .omit({
    id: true,
    organizationId: true,
    senderId: true,
    responseState: true,
    editedAt: true,
    createdAt: true,
  })
  .superRefine((value, context) => {
    if (
      ["request", "decision"].includes(value.intent) &&
      !value.responseOwnerId
    )
      context.addIssue({
        code: "custom",
        path: ["responseOwnerId"],
        message: "Requests and decisions need a response owner.",
      });
  });

export const updateMessageResponseSchema = z.object({
  responseState: messageResponseStateSchema,
});

export const paginatedItemsSchema = z.object({
  data: z.array(workItemSchema),
  nextCursor: z.string().nullable(),
});

export const createItemSchema = workItemBaseSchema
  .omit({ id: true, version: true, assignees: true })
  .extend({ assigneeIds: z.array(idSchema).max(100).default([]) })
  .superRefine((value, context) => {
    if (value.type === "approval" && !value.approvalState)
      context.addIssue({
        code: "custom",
        path: ["approvalState"],
        message: "An approval item needs an approval state.",
      });
    if (value.type !== "approval" && value.approvalState)
      context.addIssue({
        code: "custom",
        path: ["approvalState"],
        message: "Only approval items can carry an approval state.",
      });
    if (value.type === "decision" && !value.decisionState)
      context.addIssue({
        code: "custom",
        path: ["decisionState"],
        message: "A decision item needs a decision state.",
      });
    if (value.type !== "decision" && value.decisionState)
      context.addIssue({
        code: "custom",
        path: ["decisionState"],
        message: "Only decision items can carry a decision state.",
      });
  });
export const updateItemSchema = workItemBaseSchema
  .pick({
    title: true,
    status: true,
    priority: true,
    dueDate: true,
  })
  .partial()
  .extend({ assigneeIds: z.array(idSchema).max(100).optional() })
  .refine(
    (value) => Object.values(value).some((field) => field !== undefined),
    {
      message: "At least one work-item field must change.",
    },
  );

export const idempotencyKeySchema = z.string().uuid();
export const entityTagSchema = z.string().regex(/^"\d+"$/);

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});

export type User = z.infer<typeof userSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type WorkspaceDto = z.infer<typeof workspaceSchema>;
export type WorkItemDto = z.infer<typeof workItemSchema>;
export type CreateItemInput = z.infer<typeof createItemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
export type PortfolioResponse = z.infer<typeof portfolioResponseSchema>;
export type PortfolioDto = z.infer<typeof portfolioSchema>;
export type AttentionSignalDto = z.infer<typeof attentionSignalSchema>;
export type AttentionAction = z.infer<typeof attentionActionSchema>;
export type WaitingStateDto = z.infer<typeof waitingStateSchema>;
export type WaitingAction = z.infer<typeof waitingActionSchema>;
export type WeeklyReviewInput = z.infer<typeof weeklyReviewInputSchema>;
export type WeeklyReviewResponse = z.infer<typeof weeklyReviewResponseSchema>;
export type WorkspaceDetailDto = z.infer<typeof workspaceDetailSchema>;
export type MeaningfulChangeDto = z.infer<typeof meaningfulChangeSchema>;
export type ChangeRadarDto = z.infer<typeof changeRadarSchema>;
export type WorkspaceSnapshotDto = z.infer<typeof workspaceSnapshotSchema>;
export type ReviewRitualDto = z.infer<typeof reviewRitualSchema>;
export type DecisionOutcomeDto = z.infer<typeof decisionOutcomeSchema>;
export type ManagementMemoryDto = z.infer<typeof managementMemorySchema>;
export type SearchResultDto = z.infer<typeof searchResultSchema>;
export type ConversationDto = z.infer<typeof conversationSchema>;
export type ConversationMessageDto = z.infer<typeof conversationMessageSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;

export const eventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("workspace.health.changed"),
    organizationId: idSchema,
    aggregateId: idSchema,
    occurredAt: z.iso.datetime(),
  }),
  z.object({
    type: z.literal("item.status.changed"),
    organizationId: idSchema,
    aggregateId: idSchema,
    occurredAt: z.iso.datetime(),
  }),
  z.object({
    type: z.literal("decision.requested"),
    organizationId: idSchema,
    aggregateId: idSchema,
    occurredAt: z.iso.datetime(),
  }),
  z.object({
    type: z.literal("approval.completed"),
    organizationId: idSchema,
    aggregateId: idSchema,
    occurredAt: z.iso.datetime(),
  }),
]);
