import { z } from "zod";

const note = z.string().trim().max(4000);
export const reportPlanContentSchema = z
  .object({
    workingOn: note,
    completed: note,
    blockers: note,
    supportNeeded: note,
    nextSteps: note,
    goals: note,
    successCriteria: note,
    dependencies: note,
  })
  .strict();

export const reportPlanFieldsSchema = z
  .object({
    kind: z.enum(["report", "plan"]),
    title: z.string().trim().min(1).max(160),
    period: z.enum(["day", "week", "month", "sprint", "custom"]),
    periodStart: z.iso.date(),
    periodEnd: z.iso.date(),
    context: z.string().trim().max(240),
    health: z.enum(["on_track", "at_risk", "blocked", "done"]),
    state: z.enum(["draft", "published"]),
    content: reportPlanContentSchema,
  })
  .strict();

export const saveReportPlanSchema = reportPlanFieldsSchema.superRefine(
  (value, ctx) => {
    if (value.periodEnd < value.periodStart) {
      ctx.addIssue({
        code: "custom",
        path: ["periodEnd"],
        message: "End date must be on or after the start date.",
      });
    }
    if (value.period === "day" && value.periodStart !== value.periodEnd) {
      ctx.addIssue({
        code: "custom",
        path: ["periodEnd"],
        message:
          "A daily update covers one day. Choose Custom for a longer period.",
      });
    }
    if (value.state === "published") {
      if (
        value.kind === "report" &&
        !value.content.workingOn &&
        !value.content.completed
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["content", "completed"],
          message: "Add what you worked on or completed before publishing.",
        });
      }
      if (value.kind === "plan" && !value.content.goals) {
        ctx.addIssue({
          code: "custom",
          path: ["content", "goals"],
          message: "Add a goal before publishing your plan.",
        });
      }
      if (value.kind === "plan" && !value.content.nextSteps) {
        ctx.addIssue({
          code: "custom",
          path: ["content", "nextSteps"],
          message: "Add your planned actions before publishing.",
        });
      }
    }
  },
);

export const reportPlanSchema = reportPlanFieldsSchema.extend({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  authorId: z.string().min(1),
  authorName: z.string(),
  version: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  publishedAt: z.iso.datetime().nullable(),
  archivedAt: z.iso.datetime().nullable(),
});

export const reportPlanQuerySchema = z
  .object({
    kind: z.enum(["report", "plan"]).optional(),
    authorId: z.string().min(1).max(160).optional(),
    state: z.enum(["draft", "published"]).optional(),
    attention: z.enum(["true"]).optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    page: z.coerce.number().int().min(1).max(10000).default(1),
  })
  .strict()
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    path: ["to"],
    message: "End date must be on or after the start date.",
  });

export const reportPlanListSchema = z.object({
  data: z.array(reportPlanSchema),
  page: z.number().int().positive(),
  hasMore: z.boolean(),
});

export type ReportPlanContent = z.infer<typeof reportPlanContentSchema>;
export type SaveReportPlanInput = z.infer<typeof saveReportPlanSchema>;
export type ReportPlanDto = z.infer<typeof reportPlanSchema>;
export type ReportPlanQuery = z.infer<typeof reportPlanQuerySchema>;
export type ReportPlanList = z.infer<typeof reportPlanListSchema>;
