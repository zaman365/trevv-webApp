import type {
  ReportPlanContent,
  ReportPlanDto,
  SaveReportPlanInput,
} from "@founderhq/api-contract/report-plan";

export const healthLabels = {
  on_track: "On track",
  at_risk: "At risk",
  blocked: "Blocked",
  done: "Completed",
} as const;
export const contentLabels: Record<keyof ReportPlanContent, string> = {
  workingOn: "Working on now",
  completed: "Completed and outcomes",
  blockers: "Blockers",
  supportNeeded: "Support I need",
  nextSteps: "Next steps",
  goals: "Goals and priorities",
  successCriteria: "What success looks like",
  dependencies: "Dependencies and risks",
};
export const reportFields = [
  "workingOn",
  "completed",
  "blockers",
  "supportNeeded",
  "nextSteps",
] as const;
export const planFields = [
  "goals",
  "nextSteps",
  "successCriteria",
  "dependencies",
  "blockers",
  "supportNeeded",
] as const;
export type PeriodPreset =
  | "today"
  | "tomorrow"
  | "this_week"
  | "next_week"
  | "this_month"
  | "next_month";

export function reportingToday(timezone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) =>
    parts.find((value) => value.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}
export function shiftReportDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return dateKey(value);
}
export function reportPeriod(
  preset: PeriodPreset,
  today: string,
): Pick<SaveReportPlanInput, "period" | "periodStart" | "periodEnd"> {
  if (preset === "today" || preset === "tomorrow") {
    const day = preset === "tomorrow" ? shiftReportDate(today, 1) : today;
    return { period: "day", periodStart: day, periodEnd: day };
  }
  const date = new Date(`${today}T12:00:00Z`);
  if (preset === "this_week" || preset === "next_week") {
    const start = shiftReportDate(
      today,
      -((date.getUTCDay() + 6) % 7) + (preset === "next_week" ? 7 : 0),
    );
    return {
      period: "week",
      periodStart: start,
      periodEnd: shiftReportDate(start, 6),
    };
  }
  const month = date.getUTCMonth() + (preset === "next_month" ? 1 : 0);
  return {
    period: "month",
    periodStart: dateKey(new Date(Date.UTC(date.getUTCFullYear(), month, 1))),
    periodEnd: dateKey(new Date(Date.UTC(date.getUTCFullYear(), month + 1, 0))),
  };
}
export function newReportPlan(
  kind: "report" | "plan",
  today: string,
): SaveReportPlanInput {
  return {
    kind,
    title: kind === "report" ? "Daily report" : "Tomorrow’s plan",
    ...reportPeriod(kind === "report" ? "today" : "tomorrow", today),
    context: "",
    health: "on_track",
    state: "draft",
    content: {
      workingOn: "",
      completed: "",
      blockers: "",
      supportNeeded: "",
      nextSteps: "",
      goals: "",
      successCriteria: "",
      dependencies: "",
    },
  };
}
export function reportPlanInput(record: ReportPlanDto): SaveReportPlanInput {
  const {
    kind,
    title,
    period,
    periodStart,
    periodEnd,
    context,
    health,
    state,
    content,
  } = record;
  return {
    kind,
    title,
    period,
    periodStart,
    periodEnd,
    context,
    health,
    state,
    content: { ...content },
  };
}
export function nextReportPlan(record: ReportPlanDto): SaveReportPlanInput {
  const input = reportPlanInput(record);
  const start = shiftReportDate(input.periodEnd, 1);
  const days =
    Math.round(
      (Date.parse(input.periodEnd) - Date.parse(input.periodStart)) /
        86_400_000,
    ) + 1;
  const month = reportPeriod("this_month", input.periodStart);
  const range =
    input.period === "month" &&
    input.periodStart === month.periodStart &&
    input.periodEnd === month.periodEnd
      ? reportPeriod("this_month", start)
      : {
          period: input.period,
          periodStart: start,
          periodEnd: shiftReportDate(start, days - 1),
        };
  return {
    ...input,
    ...range,
    title: `${input.title.replace(/ \(next period\)$/, "").slice(0, 146)} (next period)`,
    state: "draft",
    health: "on_track",
    content: {
      ...input.content,
      completed: "",
      workingOn: "",
      blockers: "",
      supportNeeded: "",
    },
  };
}
export function reportPlanText(record: ReportPlanDto) {
  const sections = record.kind === "report" ? reportFields : planFields;
  return [
    `# ${record.title}`,
    `${record.authorName} · ${record.kind === "report" ? "Report" : "Plan"} · ${record.periodStart}${record.periodStart !== record.periodEnd ? ` – ${record.periodEnd}` : ""}`,
    `Status: ${healthLabels[record.health]}`,
    ...(record.context ? [`Context: ${record.context}`] : []),
    ...sections
      .filter((field) => record.content[field])
      .map((field) => `## ${contentLabels[field]}\n${record.content[field]}`),
  ].join("\n\n");
}
