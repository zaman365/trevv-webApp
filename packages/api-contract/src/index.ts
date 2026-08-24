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
  "venture",
  "brand",
  "product",
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

export const portfolioResponseSchema = z.object({
  asOf: z.iso.datetime(),
  signals: portfolioSignalSchema,
  hubs: z.array(z.object({ hub: hubSchema, rollup: hubRollupSchema })),
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
