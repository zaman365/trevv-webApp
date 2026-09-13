import { describe, expect, it } from "vitest";
import { teamSectionFromHash, teamWorkspaceRecords } from "./team-workspace";
import { teams, item } from "../test-fixtures/live-workflow-data";
import { teamBoards, teamItems } from "../test-fixtures/team-workspace-data";

describe("team workspace scope", () => {
  it("keeps explicit team/project ownership ahead of overlapping membership", () => {
    const result = teamWorkspaceRecords(
      teams[0]!,
      [
        ...teamItems,
        {
          ...item,
          id: "explicit-other",
          planning: { teamId: "team-operations" },
          assignees: [{ id: "user-one", name: "Owner" }],
        },
        {
          ...item,
          id: "other-workspace",
          workspaceId: "workspace-other",
          planning: { teamId: "team-launch" },
        },
      ],
      teamBoards,
      "2026-09-13",
    );
    expect(result.work.map((record) => record.id)).toEqual([
      "launch-brief",
      "launch-blocked",
      "launch-done",
      "launch-milestone",
      "shared-work",
    ]);
    expect(result.open).toHaveLength(4);
    expect(result.completed).toHaveLength(1);
    expect(result.overdue.map((record) => record.id)).toEqual(["launch-brief"]);
    expect(result.blocked.map((record) => record.id)).toEqual([
      "launch-blocked",
    ]);
    expect(result.projects.map((record) => record.id)).toEqual(["board-one"]);
    expect(result.people[0]!.assigned).toHaveLength(2);
    expect(result.milestones[0]!.id).toBe("launch-milestone");
  });
  it("keeps unknown hashes on Overview and recognizes every team section", () => {
    expect(teamSectionFromHash("#communication")).toBe("communication");
    expect(teamSectionFromHash("#settings")).toBe("settings");
    expect(teamSectionFromHash("#not-a-section")).toBe("overview");
  });
});
