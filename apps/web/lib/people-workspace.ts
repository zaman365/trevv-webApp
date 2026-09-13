import type {
  BoardDto,
  ConversationDto,
  TeamDto,
  WorkItemDto,
} from "@founderhq/api-contract";
export { personHref } from "./people-routes";

export function personEmailHref(email: string, subject = "") {
  return `mailto:${encodeURIComponent(email)}${subject ? `?subject=${encodeURIComponent(subject)}` : ""}`;
}

export function directConversationFor(
  conversations: readonly ConversationDto[],
  workspaceId: string,
  currentUserId: string,
  personId: string,
) {
  return conversations.find(
    (conversation) =>
      conversation.workspaceId === workspaceId &&
      conversation.kind === "direct" &&
      conversation.participants.length === 2 &&
      [currentUserId, personId].every((id) =>
        conversation.participants.some(
          (participant) => participant.user.id === id,
        ),
      ),
  );
}

export function personWorkspaceRecords(
  userId: string,
  workspaceId: string,
  items: readonly WorkItemDto[],
  boards: readonly BoardDto[],
  teams: readonly TeamDto[],
  today: string,
) {
  const work = items.filter(
    (item) =>
      item.workspaceId === workspaceId &&
      item.assignees.some((person) => person.id === userId),
  );
  const memberships = teams.filter(
    (team) =>
      team.workspaceId === workspaceId &&
      team.members.some((member) => member.user.id === userId),
  );
  const projectIds = new Set(work.map((item) => item.boardId));
  const open = work.filter((item) => item.status !== "done");
  return {
    work,
    open,
    completed: work.filter((item) => item.status === "done"),
    blocked: open.filter((item) => item.status === "blocked"),
    overdue: open.filter((item) => item.dueDate && item.dueDate < today),
    upcoming: open
      .filter((item) => item.dueDate)
      .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!)),
    activity: [...work].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    projects: boards.filter(
      (board) => board.workspaceId === workspaceId && projectIds.has(board.id),
    ),
    memberships,
  };
}

export function recoverChatTabs(value: string | null): {
  ids: string[];
  activeId: string | null;
} {
  try {
    const parsed: unknown = JSON.parse(value ?? "null");
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("ids" in parsed) ||
      !Array.isArray(parsed.ids)
    )
      return { ids: [], activeId: null };
    const ids = [
      ...new Set(
        parsed.ids.filter(
          (id): id is string =>
            typeof id === "string" && id.length > 0 && id.length <= 200,
        ),
      ),
    ].slice(0, 12);
    return {
      ids,
      activeId:
        "activeId" in parsed &&
        typeof parsed.activeId === "string" &&
        ids.includes(parsed.activeId)
          ? parsed.activeId
          : (ids[0] ?? null),
    };
  } catch {
    return { ids: [], activeId: null };
  }
}
