import { describe, expect, it } from "vitest";
import { reportPlanQuerySchema, saveReportPlanSchema } from "./report-plan.js";

const input = {
  kind: "report",
  title: "Daily report",
  period: "day",
  periodStart: "2026-09-10",
  periodEnd: "2026-09-10",
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
describe("member report and plan contracts", () => {
  it("allows incomplete private drafts but requires meaningful published updates", () => {
    expect(saveReportPlanSchema.safeParse(input).success).toBe(true);
    expect(
      saveReportPlanSchema.safeParse({ ...input, state: "published" }).success,
    ).toBe(false);
    expect(
      saveReportPlanSchema.safeParse({
        ...input,
        state: "published",
        content: {
          ...input.content,
          completed: "Delivered the onboarding guide.",
        },
      }).success,
    ).toBe(true);
    expect(
      saveReportPlanSchema.safeParse({
        ...input,
        kind: "plan",
        state: "published",
        content: { ...input.content, goals: "Ship onboarding" },
      }).success,
    ).toBe(false);
    expect(
      saveReportPlanSchema.safeParse({
        ...input,
        kind: "plan",
        state: "published",
        content: {
          ...input.content,
          goals: "Ship onboarding",
          nextSteps: "Finish the invite flow.",
        },
      }).success,
    ).toBe(true);
  });
  it("rejects impossible dates, reversed periods, multi-day daily reports, and whitespace-only work", () => {
    for (const patch of [
      { periodEnd: "2026-09-09" },
      { periodEnd: "2026-09-11" },
      { periodStart: "2026-02-30" },
      { title: "  " },
      { state: "published", content: { ...input.content, workingOn: "  " } },
    ]) {
      expect(
        saveReportPlanSchema.safeParse({ ...input, ...patch }).success,
      ).toBe(false);
    }
    expect(
      saveReportPlanSchema.safeParse({
        ...input,
        period: "sprint",
        periodEnd: "2026-09-24",
      }).success,
    ).toBe(true);
  });
  it("does not accept a client-chosen author or tenant and bounds personal text", () => {
    for (const patch of [
      { authorId: "other-member" },
      { organizationId: "other-org" },
      { workspaceId: "other-workspace" },
      { content: { ...input.content, completed: "x".repeat(4001) } },
    ])
      expect(
        saveReportPlanSchema.safeParse({ ...input, ...patch }).success,
      ).toBe(false);
    expect(
      reportPlanQuerySchema.safeParse({ from: "2026-09-11", to: "2026-09-10" })
        .success,
    ).toBe(false);
    expect(
      reportPlanQuerySchema.parse({ page: "2", attention: "true" }),
    ).toEqual({ page: 2, attention: "true" });
  });
});

describe("Report & Log details", () => {
  const time = {
    date: "2026-09-10",
    activity: "Campaign delivery",
    startTime: "09:00",
    endTime: "12:00",
    breakMinutes: 30,
    minutes: 150,
  };
  const log = {
    ...input,
    kind: "log",
    state: "published",
    content: {
      ...input.content,
      timeEntries: [time],
      resources: [
        {
          label: "Results",
          url: "https://drive.google.com/file/d/results/view",
        },
      ],
      results: "Delivered assets",
      progressPercent: 75,
    },
  };
  it("keeps old records valid and accepts reports, logs and plans with time and resources", () => {
    expect(saveReportPlanSchema.safeParse(input).success).toBe(true);
    expect(saveReportPlanSchema.parse(log).content.timeEntries).toEqual([time]);
    expect(
      saveReportPlanSchema.safeParse({
        ...log,
        content: { ...input.content, timeEntries: [time] },
      }).success,
    ).toBe(true);
    expect(
      saveReportPlanSchema.safeParse({
        ...input,
        state: "published",
        content: { ...input.content, results: "Revenue increased by 8%" },
      }).success,
    ).toBe(true);
    expect(reportPlanQuerySchema.parse({ kind: "log" }).kind).toBe("log");
  });
  it("rejects unsafe URLs, oversized resource lists and impossible progress", () => {
    for (const url of [
      "javascript:alert(1)",
      "data:text/html,hello",
      "file:///private/file",
      "https://user:password@example.com",
      "not a URL",
    ]) {
      expect(
        saveReportPlanSchema.safeParse({
          ...log,
          content: { ...log.content, resources: [{ label: "File", url }] },
        }).success,
      ).toBe(false);
    }
    for (const patch of [
      { progressPercent: 101 },
      { progressPercent: -1 },
      {
        resources: Array(21).fill({
          label: "File",
          url: "https://example.com",
        }),
      },
    ])
      expect(
        saveReportPlanSchema.safeParse({
          ...log,
          content: { ...log.content, ...patch },
        }).success,
      ).toBe(false);
  });
  it("rejects mismatched, reversed, overlapping and out-of-period time", () => {
    for (const timeEntries of [
      [{ ...time, minutes: 151 }],
      [{ ...time, endTime: "08:00" }],
      [{ ...time, breakMinutes: 200 }],
      [
        time,
        {
          ...time,
          startTime: "11:30",
          endTime: "13:00",
          minutes: 90,
          breakMinutes: 0,
        },
      ],
      [{ ...time, date: "2026-09-11" }],
      [{ ...time, date: "2026-02-30" }],
      [{ ...time, endTime: undefined }],
      [{ date: time.date, activity: "Work", minutes: 60, breakMinutes: 10 }],
      [
        { date: time.date, activity: "Work", minutes: 1000 },
        { date: time.date, activity: "More", minutes: 500 },
      ],
    ])
      expect(
        saveReportPlanSchema.safeParse({
          ...log,
          content: { ...log.content, timeEntries },
        }).success,
      ).toBe(false);
  });
  it("supports explicit overnight shifts and excludes breaks from working time", () => {
    const overnight = {
      ...time,
      startTime: "22:00",
      endTime: "02:00",
      endsNextDay: true,
      minutes: 210,
    };
    const value = {
      ...log,
      period: "custom",
      periodEnd: "2026-09-11",
      content: { ...log.content, timeEntries: [overnight] },
    };
    expect(saveReportPlanSchema.safeParse(value).success).toBe(true);
    expect(
      saveReportPlanSchema.safeParse({
        ...value,
        content: {
          ...value.content,
          timeEntries: [
            overnight,
            {
              ...time,
              date: "2026-09-11",
              startTime: "01:00",
              endTime: "03:00",
              minutes: 120,
              breakMinutes: 0,
            },
          ],
        },
      }).success,
    ).toBe(false);
  });
});
