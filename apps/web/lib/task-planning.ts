import type { BoardDto, WorkItemDto } from "@founderhq/api-contract";

/** Keep descriptive context, but never carry another project's references. */
export function planningForBoard(
  board: BoardDto,
  current: WorkItemDto["planning"] = {},
  previousBoard?: BoardDto,
): NonNullable<WorkItemDto["planning"]> {
  const planning = { ...current };
  const changedProject =
    previousBoard &&
    (previousBoard.planning?.parentBoardId ?? previousBoard.id) !==
      (board.planning?.parentBoardId ?? board.id);
  if (changedProject) {
    delete planning.cycleId;
    delete planning.milestoneId;
    delete planning.teamId;
  }
  if (board.planning?.parentBoardId) planning.cycleId = board.id;
  else if (
    previousBoard?.planning?.parentBoardId &&
    previousBoard.id !== board.id
  )
    delete planning.cycleId;
  if (!planning.teamId && board.planning?.teamId)
    planning.teamId = board.planning.teamId;
  return planning;
}
