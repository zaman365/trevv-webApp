import type { BoardDto, WorkItemDto } from "@founderhq/api-contract";

export {
  dashboardStatuses,
  dashboardDayAfter,
  dashboardMetrics,
} from "./workspace-dashboard-metrics";

export type DashboardFocus =
  | {
      kind: "all" | "open" | "overdue" | "unassigned" | "milestones";
      label: string;
    }
  | { kind: "status" | "owner" | "date"; key: string; label: string };

/** A cycle owns a selection of its parent project's items, not a duplicate copy. */
export function dashboardPlanItems(
  items: readonly WorkItemDto[],
  board: BoardDto,
) {
  return items.filter(
    (item) => item.boardId === board.id || item.planning?.cycleId === board.id,
  );
}

export function dashboardFocusItems(
  items: readonly WorkItemDto[],
  focus: DashboardFocus,
  today: string,
) {
  return items.filter((item) => {
    if (focus.kind === "milestones")
      return item.type === "milestone" && item.status !== "done";
    if (focus.kind === "open") return item.status !== "done";
    if (focus.kind === "overdue")
      return (
        item.status !== "done" && Boolean(item.dueDate && item.dueDate < today)
      );
    if (focus.kind === "unassigned")
      return item.status !== "done" && item.assignees.length === 0;
    if (focus.kind === "status") return item.status === focus.key;
    if (focus.kind === "owner")
      return (
        item.status !== "done" &&
        (focus.key === "unassigned"
          ? item.assignees.length === 0
          : item.assignees.some((person) => person.id === focus.key))
      );
    if (focus.kind === "date")
      return item.status !== "done" && item.dueDate === focus.key;
    return true;
  });
}
