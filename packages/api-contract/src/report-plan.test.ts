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
