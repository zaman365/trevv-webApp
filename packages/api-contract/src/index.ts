import { z } from "zod";

export const idSchema = z.string().min(3).max(128);
export const cursorSchema = z.string().max(512).optional();
export const roleSchema = z.enum([
  "owner",
  "admin",
  "hub_lead",
  "member",
  "guest",
  "viewer",
]);
export const hubHealthSchema = z.enum([
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
export const hubTypeSchema = z.enum([
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

export const hubSchema = z.object({
  id: idSchema,
  portfolioId: idSchema,
  slug: z.string().min(1).max(120),
  name: z.string().min(1).max(160),
  icon: z.string().min(1).max(12),
  accent: z.string().regex(/^#[0-9a-f]{6}$/i),
  type: hubTypeSchema,
  stage: lifecycleStageSchema,
  health: hubHealthSchema,
  healthNote: z.string().max(1_000),
  priority: z.string().max(500),
  lead: z.object({ name: z.string(), initials: z.string(), color: z.string() }),
  nextMilestone: z.object({ title: z.string(), date: z.iso.date() }),
  latestUpdate: z.object({ text: z.string(), date: z.iso.date() }),
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

export const workItemSchema = z.object({
  id: idSchema,
  hubId: idSchema,
  boardId: idSchema,
  title: z.string().min(1).max(500),
  type: itemTypeSchema,
  priority: prioritySchema,
  status: itemStatusSchema,
  dueDate: z.iso.date().optional(),
  assignee: z.string().max(160).optional(),
  approvalState: z
    .enum(["pending", "changes_requested", "approved", "rejected"])
    .optional(),
  decisionState: z
    .enum(["needed", "analyzing", "delegated", "deferred", "decided"])
    .optional(),
});

export const hubRollupSchema = z.object({
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
  hubs: z.array(z.object({ hub: hubSchema, rollup: hubRollupSchema })),
});

export const attentionSignalSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  portfolioId: idSchema,
  hubId: idSchema.optional(),
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
  hubId: idSchema,
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
});

export const paginatedItemsSchema = z.object({
  data: z.array(workItemSchema),
  nextCursor: z.string().nullable(),
});

export const createItemSchema = workItemSchema
  .omit({ id: true })
  .extend({ idempotencyKey: z.string().uuid().optional() });
export const updateItemSchema = workItemSchema
  .pick({
    title: true,
    status: true,
    priority: true,
    dueDate: true,
    assignee: true,
  })
  .partial()
  .extend({ version: z.number().int().nonnegative() });

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
export type HubDto = z.infer<typeof hubSchema>;
export type WorkItemDto = z.infer<typeof workItemSchema>;
export type PortfolioResponse = z.infer<typeof portfolioResponseSchema>;
export type PortfolioDto = z.infer<typeof portfolioSchema>;
export type AttentionSignalDto = z.infer<typeof attentionSignalSchema>;
export type WaitingStateDto = z.infer<typeof waitingStateSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;

export const eventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("hub.health.changed"),
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
