import { expect, it } from "vitest";
import { board } from "../test-fixtures/live-workflow-data";
import { planningForBoard } from "./task-planning";

it("keeps topic context and milestone within the project when selecting a sprint", () => {
  const cycle = {
    ...board,
    id: "cycle-one",
    planning: {
      kind: "sprint" as const,
      state: "active" as const,
      parentBoardId: board.id,
      teamId: "team-one",
    },
  };
  const planning = planningForBoard(
    cycle,
    {
      topic: "Launch",
      milestoneId: "milestone-one",
      details: { Channel: "Email" },
    },
    board,
  );
  expect(planning).toEqual({
    topic: "Launch",
    milestoneId: "milestone-one",
    cycleId: cycle.id,
    teamId: "team-one",
    details: { Channel: "Email" },
  });
  expect(planningForBoard(board, planning, cycle)).toEqual({
    topic: "Launch",
    milestoneId: "milestone-one",
    teamId: "team-one",
    details: { Channel: "Email" },
  });
});

it("clears another project's cycle, milestone, and team while preserving descriptive context", () => {
  const target = {
    ...board,
    id: "other-project",
    planning: {
      kind: "campaign" as const,
      state: "planned" as const,
      teamId: "marketing",
    },
  };
  expect(
    planningForBoard(
      target,
      {
        cycleId: "old-cycle",
        milestoneId: "old-milestone",
        teamId: "old-team",
        topic: "Launch",
        acceptanceCriteria: "Reviewed",
      },
      board,
    ),
  ).toEqual({
    teamId: "marketing",
    topic: "Launch",
    acceptanceCriteria: "Reviewed",
  });
});
