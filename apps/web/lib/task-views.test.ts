import { describe, expect, it } from "vitest";
import { item } from "../test-fixtures/live-workflow-data";
import { taskMatchesPeriod, taskToday, sortTasks } from "./task-views";

describe("daily task views", () => {
  it("uses the organization's day across UTC midnight and daylight saving", () => {
    expect(
      taskToday("America/Los_Angeles", new Date("2026-09-08T00:30:00Z")),
    ).toBe("2026-09-07");
    expect(taskToday("Europe/Berlin", new Date("2026-03-29T22:30:00Z"))).toBe(
      "2026-03-30",
    );
  });
  it("keeps completed and undated work discoverable without calling it overdue", () => {
    const completed = {
      ...item,
      status: "done" as const,
      dueDate: "2026-01-01",
    };
    expect(taskMatchesPeriod(completed, "overdue", "2026-09-08")).toBe(false);
    expect(taskMatchesPeriod(completed, "completed", "2026-09-08")).toBe(true);
    const undated = { ...item };
    delete undated.dueDate;
    expect(taskMatchesPeriod(undated, "open", "2026-09-08")).toBe(true);
    expect(taskMatchesPeriod(undated, "upcoming", "2026-09-08")).toBe(false);
  });
  it("sorts dated tasks before undated work and urgent tasks before normal ones without mutating records", () => {
    const tasks = [
      {
        ...item,
        id: "later",
        dueDate: "2026-09-10",
        priority: "urgent" as const,
      },
      { ...item, id: "earlier", dueDate: "2026-09-08" },
      { ...item, id: "undated" },
    ];
    expect(sortTasks(tasks, "due").map((task) => task.id)).toEqual([
      "earlier",
      "later",
      "undated",
    ]);
    expect(sortTasks(tasks, "priority")[0]?.id).toBe("later");
    expect(tasks[0]!.id).toBe("later");
  });
});
