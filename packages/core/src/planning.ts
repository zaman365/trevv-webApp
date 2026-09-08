/** Saved planning context; membership and authorization are checked separately. */
export interface BoardPlanning {
  kind:
    | "project"
    | "sprint"
    | "campaign"
    | "content"
    | "backlog"
    | "operations"
    | "goals";
  state: "planned" | "active" | "completed";
  teamId?: string | undefined;
  parentBoardId?: string | undefined;
}

export interface WorkItemPlanning {
  cycleId?: string | undefined;
  milestoneId?: string | undefined;
  teamId?: string | undefined;
  topic?: string | undefined;
  workKind?: string | undefined;
  estimate?: number | undefined;
  acceptanceCriteria?: string | undefined;
  details?: Record<string, string> | undefined;
}
