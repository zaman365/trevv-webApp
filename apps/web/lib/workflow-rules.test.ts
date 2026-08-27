import { describe, expect, it } from "vitest";
import {
  routeForWorkItemType,
  scoreOpportunity,
  validateCapture,
} from "./workflow-rules";

describe("workflow rules", () => {
  it("scores opportunities without allowing division by zero", () => {
    expect(
      scoreOpportunity({ impact: 4, confidence: 4, fit: 5, effort: 2 }),
    ).toBe("40.0");
    expect(
      scoreOpportunity({ impact: 3, confidence: 2, fit: 4, effort: 0 }),
    ).toBe("24.0");
  });

  it("requires dates only for time-bound approval and milestone captures", () => {
    expect(validateCapture({ type: "task", title: "Ship the update" })).toEqual(
      [],
    );
    expect(
      validateCapture({ type: "approval", title: "Review copy" }),
    ).toContain("A due date is required for milestones and approvals.");
    expect(validateCapture({ type: "milestone", title: "" })).toHaveLength(2);
  });

  it("routes specialized work to its management surface", () => {
    expect(routeForWorkItemType("decision")).toBe("/app/decisions");
    expect(routeForWorkItemType("idea")).toBe("/app/ideas");
    expect(routeForWorkItemType("approval")).toBe("/app/approvals");
    expect(routeForWorkItemType("task")).toBe("/app/my-work");
  });
});
