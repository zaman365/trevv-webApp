import { z } from "zod";

export const reportResourceSchema = z
  .object({
    label: z.string().trim().min(1).max(160),
    url: z
      .string()
      .trim()
      .max(2048)
      .refine((value) => {
        try {
          const url = new URL(value);
          return (
            ["http:", "https:"].includes(url.protocol) &&
            !url.username &&
            !url.password
          );
        } catch {
          return false;
        }
      }, "Use a complete http or https URL without embedded credentials."),
    note: z.string().trim().max(500).optional(),
  })
  .strict();

const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const reportTimeEntrySchema = z
  .object({
    date: z.iso.date(),
    activity: z.string().trim().min(1).max(240),
    minutes: z.number().int().min(1).max(1440),
    breakMinutes: z.number().int().min(0).max(1439).optional(),
    startTime: clockTime.optional(),
    endTime: clockTime.optional(),
    endsNextDay: z.boolean().optional(),
  })
  .strict();
export type ReportTimeEntry = z.infer<typeof reportTimeEntrySchema>;
export type ReportResource = z.infer<typeof reportResourceSchema>;

export function clockMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours! * 60 + minutes!;
}
export function elapsedWorkMinutes(
  entry: Pick<
    ReportTimeEntry,
    "startTime" | "endTime" | "endsNextDay" | "breakMinutes"
  >,
) {
  if (!entry.startTime || !entry.endTime) return undefined;
  return (
    clockMinutes(entry.endTime) -
    clockMinutes(entry.startTime) +
    (entry.endsNextDay ? 1440 : 0) -
    (entry.breakMinutes ?? 0)
  );
}

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
    results: note.optional(),
    progressPercent: z.number().int().min(0).max(100).optional(),
    templateId: z.string().trim().min(1).max(80).optional(),
    resources: z.array(reportResourceSchema).max(20).optional(),
    timeEntries: z.array(reportTimeEntrySchema).max(100).optional(),
  })
  .strict();

export const reportPlanFieldsSchema = z
  .object({
    kind: z.enum(["report", "log", "plan"]),
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
    const intervals: Array<{ start: number; end: number }> = [];
    const dailyMinutes = new Map<string, number>();
    for (const [index, entry] of (value.content.timeEntries ?? []).entries()) {
      const issue = (message: string) =>
        ctx.addIssue({
          code: "custom",
          path: ["content", "timeEntries", index],
          message,
        });
      const elapsed = elapsedWorkMinutes(entry);
      if (Boolean(entry.startTime) !== Boolean(entry.endTime))
        issue("Provide both a start and end time, or use duration only.");
      if (
        elapsed !== undefined &&
        (elapsed <= 0 ||
          elapsed !== entry.minutes ||
          entry.minutes + (entry.breakMinutes ?? 0) > 1440)
      )
        issue(
          "Working time must match the start/end times minus breaks, within 24 hours.",
        );
      if (
        elapsed === undefined &&
        (entry.endsNextDay || (entry.breakMinutes ?? 0) > 0)
      )
        issue("Breaks and overnight shifts require start and end times.");
      if (!Number.isFinite(Date.parse(entry.date))) continue;
      const nextDay = new Date(Date.parse(entry.date) + 86400000)
        .toISOString()
        .slice(0, 10);
      if (
        entry.date < value.periodStart ||
        entry.date > value.periodEnd ||
        (entry.endsNextDay && nextDay > value.periodEnd)
      )
        issue("Time entries must fit within the report’s start and end dates.");
      if (entry.startTime && entry.endTime) {
        const start =
          Date.parse(entry.date) / 60000 + clockMinutes(entry.startTime);
        const end =
          Date.parse(entry.date) / 60000 +
          clockMinutes(entry.endTime) +
          (entry.endsNextDay ? 1440 : 0);
        if (intervals.some((other) => start < other.end && end > other.start))
          issue("Time entries in this update must not overlap.");
        intervals.push({ start, end });
      }
      const total = (dailyMinutes.get(entry.date) ?? 0) + entry.minutes;
      dailyMinutes.set(entry.date, total);
      if (total > 1440)
        issue("Logged work for one start date cannot exceed 24 hours.");
    }
    if (value.state === "published") {
      if (
        value.kind !== "plan" &&
        !value.content.workingOn &&
        !value.content.completed &&
        !value.content.results &&
        !(value.kind === "log" && value.content.timeEntries?.length)
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
    kind: z.enum(["report", "log", "plan"]).optional(),
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
