import { describe, expect, it } from "vitest";
import {
  newReportPlan,
  nextReportPlan,
  reportingToday,
  reportPeriod,
  reportPlanText,
} from "./report-plan";
import type { ReportPlanDto } from "@founderhq/api-contract/report-plan";

describe("report and plan periods", () => {
  it("uses the organization day across midnight and daylight-saving boundaries", () => {
    expect(
      reportingToday("Europe/Berlin", new Date("2026-03-29T22:30:00Z")),
    ).toBe("2026-03-30");
    expect(
      reportingToday("America/New_York", new Date("2026-03-29T22:30:00Z")),
    ).toBe("2026-03-29");
    expect(reportPeriod("tomorrow", "2026-12-31")).toEqual({
      period: "day",
      periodStart: "2027-01-01",
      periodEnd: "2027-01-01",
    });
  });
  it("uses inclusive Monday–Sunday weeks and full calendar months", () => {
    expect(reportPeriod("this_week", "2026-03-29")).toEqual({
      period: "week",
      periodStart: "2026-03-23",
      periodEnd: "2026-03-29",
    });
    expect(reportPeriod("next_week", "2026-03-29")).toEqual({
      period: "week",
      periodStart: "2026-03-30",
      periodEnd: "2026-04-05",
    });
    expect(reportPeriod("next_month", "2028-01-31")).toEqual({
      period: "month",
      periodStart: "2028-02-01",
      periodEnd: "2028-02-29",
    });
  });
  it("copies a plan into a private next-period draft without falsely carrying completion or blockers", () => {
    const record: ReportPlanDto = {
      ...newReportPlan("plan", "2026-01-01"),
      ...reportPeriod("this_month", "2026-01-01"),
      id: "plan",
      workspaceId: "workspace",
      authorId: "member",
      authorName: "Alex",
      version: 1,
      createdAt: "2026-01-01T12:00:00Z",
      updatedAt: "2026-01-01T12:00:00Z",
      publishedAt: "2026-01-01T12:00:00Z",
      archivedAt: null,
      state: "published",
      health: "done",
    };
    record.content.goals = "Release the project";
    record.content.nextSteps = "Prepare the review";
    record.content.blockers = "Waiting on an old approval";
    const next = nextReportPlan(record);
    expect(next).toMatchObject({
      periodStart: "2026-02-01",
      periodEnd: "2026-02-28",
      state: "draft",
      health: "on_track",
      content: {
        goals: "Release the project",
        nextSteps: "Prepare the review",
        blockers: "",
      },
    });
    expect(record.state).toBe("published");
    const partialMonth = nextReportPlan({
      ...record,
      periodStart: "2026-01-15",
      periodEnd: "2026-01-31",
    });
    expect(partialMonth.periodStart).toBe("2026-02-01");
    expect(partialMonth.periodEnd).toBe("2026-02-17");
    const midMonth = nextReportPlan({
      ...record,
      periodStart: "2026-01-01",
      periodEnd: "2026-01-10",
    });
    expect(midMonth.periodStart).toBe("2026-01-11");
    expect(midMonth.periodEnd).toBe("2026-01-20");
    expect(reportPlanText(record)).toContain(
      "Alex · Plan · 2026-01-01 – 2026-01-31",
    );
    expect(reportPlanText(record)).toContain(
      "## Goals and priorities\nRelease the project",
    );
  });
});

import {
  reportFromTemplate,
  reportTemplates,
  reuseReportTemplate,
  reportTimeCsv,
} from "./report-plan";
import { saveReportPlanSchema } from "@founderhq/api-contract/report-plan";
describe("Report & Log templates and exports", () => {
  it("creates valid private template drafts without claiming work has already happened", () => {
    for (const template of reportTemplates) {
      const draft = reportFromTemplate(template.id, "2026-09-14");
      expect(saveReportPlanSchema.safeParse(draft).success).toBe(true);
      expect(draft.content.completed).toBe("");
      expect(draft.state).toBe("draft");
      expect(draft.content.templateId).toBe(template.id);
    }
  });
  it("exports complete work evidence and reuses structure without repeating actual time or progress", () => {
    const record: ReportPlanDto = {
      ...newReportPlan("log", "2026-09-14"),
      id: "log",
      workspaceId: "workspace",
      authorId: "member",
      authorName: "Alex",
      version: 0,
      createdAt: "2026-09-14T12:00:00Z",
      updatedAt: "2026-09-14T12:00:00Z",
      archivedAt: null,
      publishedAt: null,
    };
    record.content = {
      ...record.content,
      results: "Released assets",
      progressPercent: 60,
      timeEntries: [
        { date: "2026-09-14", activity: "=Potential formula", minutes: 90 },
      ],
      resources: [
        { label: "Results", url: "https://drive.google.com/file/d/result" },
      ],
    };
    const text = reportPlanText(record);
    expect(text).toContain("1h 30m");
    expect(text).toContain("Progress: 60%");
    expect(text).toContain("https://drive.google.com/file/d/result");
    expect(text).toContain("Released assets");
    expect(reportTimeCsv([record])).toContain("'=Potential formula");
    const reused = reuseReportTemplate(record, "2026-09-15");
    expect(reused.content.timeEntries).toEqual([]);
    expect(reused.content.progressPercent).toBeUndefined();
    expect(reused.content.results).toBe("");
    expect(reused.content.resources).toEqual(record.content.resources);
    expect(record.content.timeEntries).toHaveLength(1);
  });
});
