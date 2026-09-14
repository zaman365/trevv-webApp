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
export type ReportTextField = Exclude<
  keyof ReportPlanContent,
  "timeEntries" | "resources" | "templateId" | "progressPercent"
>;
export const contentLabels: Record<ReportTextField, string> = {
  workingOn: "Working on now",
  completed: "Completed and outcomes",
  results: "Results and impact",
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
  "results",
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
  kind: SaveReportPlanInput["kind"],
  today: string,
): SaveReportPlanInput {
  return {
    kind,
    title:
      kind === "plan"
        ? "Tomorrow’s plan"
        : kind === "log"
          ? "Daily work log"
          : "Daily report",
    ...reportPeriod(kind === "plan" ? "tomorrow" : "today", today),
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
      results: "",
      timeEntries: [],
      progressPercent: undefined,
      workingOn: "",
      blockers: "",
      supportNeeded: "",
    },
  };
}
export function reportPlanText(record: ReportPlanDto) {
  const sections = record.kind === "plan" ? planFields : reportFields;
  return [
    `# ${record.title}`,
    `${record.authorName} · ${reportKindLabels[record.kind]} · ${record.periodStart}${record.periodStart !== record.periodEnd ? ` – ${record.periodEnd}` : ""}`,
    `Status: ${healthLabels[record.health]}`,
    ...(record.context ? [`Context: ${record.context}`] : []),
    ...(record.content.progressPercent !== undefined
      ? [`Progress: ${record.content.progressPercent}%`]
      : []),
    ...(record.content.timeEntries?.length
      ? [
          `## Working time · ${formatWorkMinutes(reportTimeTotal(record))}`,
          ...record.content.timeEntries.map(
            (entry) =>
              `${entry.date} · ${entry.activity} · ${formatWorkMinutes(entry.minutes)}${entry.startTime ? ` · ${entry.startTime}–${entry.endTime}${entry.endsNextDay ? " (+1 day)" : ""} · ${entry.breakMinutes ?? 0}m break` : ""}`,
          ),
        ]
      : []),
    ...(record.content.resources?.length
      ? [
          "## Resources",
          ...record.content.resources.map(
            (resource) =>
              `${resource.label}: ${resource.url}${resource.note ? ` — ${resource.note}` : ""}`,
          ),
        ]
      : []),
    ...sections
      .filter((field) => record.content[field])
      .map((field) => `## ${contentLabels[field]}\n${record.content[field]}`),
  ].join("\n\n");
}

export const reportKindLabels = {
  report: "Report",
  log: "Work log",
  plan: "Plan",
} as const;
export const reportTemplates = [
  {
    id: "daily",
    name: "Daily progress",
    description: "Work completed, current progress, blockers and next steps.",
    kind: "report",
    preset: "today",
  },
  {
    id: "weekly",
    name: "Weekly report",
    description: "Summarize the week’s outcomes, results and priorities.",
    kind: "report",
    preset: "this_week",
  },
  {
    id: "sprint",
    name: "Sprint review",
    description:
      "Review deliverables, measurable results and lessons for the next sprint.",
    kind: "report",
    preset: "this_week",
  },
  {
    id: "handover",
    name: "Results & handover",
    description:
      "Document delivered work, resource links and what happens next.",
    kind: "report",
    preset: "today",
  },
  {
    id: "work-log",
    name: "Daily work log",
    description:
      "Record activities, working time and the results of your work.",
    kind: "log",
    preset: "today",
  },
  {
    id: "time-log",
    name: "Weekly time log",
    description: "Log time by activity and day, including shifts and breaks.",
    kind: "log",
    preset: "this_week",
  },
  {
    id: "plan",
    name: "Next-period plan",
    description:
      "Keep goals, planned actions, dependencies and success criteria together.",
    kind: "plan",
    preset: "next_week",
  },
] as const;
export function reportFromTemplate(
  id: string,
  today: string,
): SaveReportPlanInput {
  const template =
    reportTemplates.find((entry) => entry.id === id) ?? reportTemplates[0]!;
  const input = newReportPlan(template.kind, today);
  return {
    ...input,
    ...reportPeriod(template.preset, today),
    ...(template.id === "sprint" ? { period: "sprint" as const } : {}),
    title: template.name,
    content: { ...input.content, templateId: template.id },
  };
}
export function reuseReportTemplate(
  record: ReportPlanDto,
  today: string,
): SaveReportPlanInput {
  const input = nextReportPlan(record);
  return {
    ...input,
    ...reportPeriod(
      record.period === "week"
        ? "this_week"
        : record.period === "month"
          ? "this_month"
          : "today",
      today,
    ),
    title: record.title,
    content: {
      ...input.content,
      results: "",
      progressPercent: undefined,
      timeEntries: [],
    },
  };
}
export function formatWorkMinutes(minutes: number) {
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
export function reportTimeTotal(record: Pick<ReportPlanDto, "content">) {
  return (record.content.timeEntries ?? []).reduce(
    (sum, entry) => sum + entry.minutes,
    0,
  );
}
export function reportTimeCsv(records: ReportPlanDto[]) {
  const cell = (value: unknown) => {
    const text = String(value ?? "");
    return `"${(/^[=+\-@\t\r]/.test(text) ? "'" : "") + text.replaceAll('"', '""')}"`;
  };
  return [
    [
      "Report",
      "Member",
      "Visibility",
      "Date",
      "Activity",
      "Start",
      "End",
      "Ends next day",
      "Break minutes",
      "Working minutes",
      "Context",
    ],
    ...records.flatMap((record) =>
      (record.content.timeEntries ?? []).map((entry) => [
        record.title,
        record.authorName,
        record.state,
        entry.date,
        entry.activity,
        entry.startTime,
        entry.endTime,
        entry.endsNextDay ? "Yes" : "No",
        entry.breakMinutes ?? 0,
        entry.minutes,
        record.context,
      ]),
    ),
  ]
    .map((row) => row.map(cell).join(","))
    .join("\r\n");
}

export const reportTemplateHints: Record<
  string,
  Partial<Record<ReportTextField, string>>
> = {
  daily: {
    completed:
      "What did you deliver today? Name the finished work and its outcome.",
    nextSteps: "What comes next, and is any help needed to keep it moving?",
  },
  weekly: {
    completed: "Summarize this week’s main deliverables and commitments met.",
    results:
      "Compare results with your goals. Include useful numbers, feedback or lessons.",
    nextSteps: "What are the priorities for next week?",
  },
  sprint: {
    workingOn:
      "Which sprint goal and remaining deliverables are being reviewed?",
    completed:
      "Which sprint commitments were delivered, and which remain open?",
    results:
      "Record the outcome against the sprint goal, plus lessons for the next sprint.",
  },
  handover: {
    completed:
      "What is ready to hand over? Add the deliverable names and status.",
    results:
      "Describe the result and acceptance checks. Put the deliverable URLs in Links & resources.",
    nextSteps:
      "Who takes over, what needs attention, and when is the next check-in?",
  },
  "work-log": {
    workingOn:
      "List the activities you worked on. Add time per activity in Working time.",
    results: "What did the work produce or move forward?",
  },
  "time-log": {
    workingOn: "Summarize the activities covered by your time entries.",
    results: "What outcomes were achieved during the logged time?",
  },
};
