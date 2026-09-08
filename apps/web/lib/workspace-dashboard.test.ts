import { describe, expect, it } from "vitest";
import {
  dashboardDayAfter,
  dashboardFocusItems,
  dashboardMetrics,
  dashboardPlanItems,
} from "./workspace-dashboard";
import { taskToday } from "./task-views";
import { item, board } from "../test-fixtures/live-workflow-data";
import type { WorkItemDto } from "@founderhq/api-contract";

const work = (id: string, extra: Partial<WorkItemDto> = {}): WorkItemDto => ({
  ...item,
  id,
  ...extra,
});
const today = "2026-09-09";
const records = [
  work("done", { status: "done", dueDate: "2026-09-01" }),
  work("late", {
    status: "blocked",
    dueDate: "2026-09-08",
    assignees: [
      { id: "a", name: "Alex" },
      { id: "b", name: "Blair" },
    ],
  }),
  work("today", {
    status: "working",
    dueDate: today,
    assignees: [{ id: "a", name: "Alex" }],
  }),
  work("undated"),
  work("milestone", { type: "milestone", dueDate: "2026-09-12" }),
];
describe("workspace dashboard evidence", () => {
  it("counts real statuses, incomplete work and shared assignments without duplicating totals", () => {
    const result = dashboardMetrics([...records, records[0]!], today, 7);
    expect(result).toMatchObject({
      total: 5,
      done: 1,
      open: 4,
      overdue: 1,
      blocked: 1,
      unassigned: 2,
      undated: 1,
      completion: 20,
    });
    expect(result.statuses.reduce((sum, s) => sum + s.count, 0)).toBe(5);
    expect(result.owners.find((owner) => owner.id === "a")).toMatchObject({
      open: 2,
      blocked: 1,
      overdue: 1,
    });
    expect(result.owners.find((owner) => owner.id === "b")).toMatchObject({
      open: 1,
      blocked: 1,
      overdue: 1,
    });
    expect(result.deadlines.map((day) => day.count)).toEqual([
      1, 0, 0, 1, 0, 0, 0,
    ]);
  });
  it("keeps completion empty for an empty workspace and orders undated milestones last", () => {
    expect(dashboardMetrics([], today, 7)).toMatchObject({
      total: 0,
      completion: 0,
      owners: [],
      milestones: [],
    });
    expect(
      dashboardMetrics(
        [...records, work("later", { type: "milestone" })],
        today,
        7,
      ).milestones.map((i) => i.id),
    ).toEqual(["milestone", "later"]);
  });
  it("drills into the exact work behind status, owner, due date and milestone charts", () => {
    const ids = (focus: Parameters<typeof dashboardFocusItems>[1]) =>
      dashboardFocusItems(records, focus, today).map((i) => i.id);
    expect(ids({ kind: "status", key: "done", label: "Done" })).toEqual([
      "done",
    ]);
    expect(ids({ kind: "overdue", label: "Late" })).toEqual(["late"]);
    expect(ids({ kind: "date", key: today, label: "Today" })).toEqual([
      "today",
    ]);
    expect(ids({ kind: "owner", key: "a", label: "Alex" })).toEqual([
      "late",
      "today",
    ]);
    expect(ids({ kind: "unassigned", label: "Needs owner" })).toEqual([
      "undated",
      "milestone",
    ]);
    expect(ids({ kind: "milestones", label: "Milestones" })).toEqual([
      "milestone",
    ]);
  });
  it("selects a sprint's parent-board tasks once and excludes unrelated project work", () => {
    const sprint = { ...board, id: "sprint" };
    const tasks = [
      work("linked", { planning: { cycleId: "sprint" } }),
      work("legacy", { boardId: "sprint", planning: { cycleId: "sprint" } }),
      work("elsewhere"),
    ];
    expect(dashboardPlanItems(tasks, sprint).map((i) => i.id)).toEqual([
      "linked",
      "legacy",
    ]);
  });
  it("uses the organization's current day and advances calendar dates across DST and year boundaries", () => {
    expect(taskToday("Europe/Berlin", new Date("2026-09-08T23:30:00Z"))).toBe(
      today,
    );
    expect(dashboardDayAfter("2026-10-24", 2)).toBe("2026-10-26");
    expect(dashboardDayAfter("2026-12-31", 1)).toBe("2027-01-01");
  });
});
