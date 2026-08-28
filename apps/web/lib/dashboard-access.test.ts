import { describe, expect, it } from "vitest";
import type { WorkItem } from "@founderhq/core";
import {
  dashboardLevelsForAccess,
  filterItemsForDashboardView,
  type DashboardAccess,
} from "./dashboard-access";

const items: WorkItem[] = [
  {
    id: "one",
    workspaceId: "project-a",
    boardId: "board-a",
    title: "Campaign",
    type: "task",
    priority: "normal",
    status: "working",
    assignee: "Amira Demir",
  },
  {
    id: "two",
    workspaceId: "project-b",
    boardId: "board-b",
    title: "Budget",
    type: "task",
    priority: "high",
    status: "review",
    assignee: "Mohammed Zaman",
  },
];

describe("dashboard access hierarchy", () => {
  it("only exposes reporting levels granted by access", () => {
    const access: DashboardAccess = {
      portfolioIds: [],
      projectIds: ["project-a"],
      teamIds: [],
      personal: true,
    };
    expect(dashboardLevelsForAccess(access)).toEqual(["project", "personal"]);
  });

  it("filters the same source work for project, team, and personal views", () => {
    expect(
      filterItemsForDashboardView(items, "project", "project-a").map(
        (item) => item.id,
      ),
    ).toEqual(["one"]);
    expect(
      filterItemsForDashboardView(items, "team", "marketing").map(
        (item) => item.id,
      ),
    ).toEqual(["one"]);
    expect(
      filterItemsForDashboardView(items, "personal", "Mohammed Zaman").map(
        (item) => item.id,
      ),
    ).toEqual(["two"]);
  });
});
