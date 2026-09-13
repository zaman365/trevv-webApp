import type {
  BoardDto,
  TeamDto,
  TeamFeatureCapability,
  TeamPreset,
  WorkItemDto,
} from "@founderhq/api-contract";
import { taskBelongsToTeam, sortTasks } from "./task-views";

export const teamSections = [
  "overview",
  "tasks",
  "projects",
  "communication",
  "people",
  "settings",
] as const;
export type TeamSection = (typeof teamSections)[number];
export const teamSectionLabels: Record<TeamSection, string> = {
  overview: "Overview",
  tasks: "Tasks",
  projects: "Projects & milestones",
  communication: "Communication",
  people: "People & workload",
  settings: "Settings",
};
export function teamSectionFromHash(hash: string): TeamSection {
  const value = hash.replace(/^#/, "");
  return teamSections.includes(value as TeamSection)
    ? (value as TeamSection)
    : "overview";
}

export function teamWorkspaceRecords(
  team: TeamDto,
  items: readonly WorkItemDto[],
  boards: readonly BoardDto[],
  today: string,
) {
  const work = items.filter((item) => taskBelongsToTeam(item, team, boards));
  const open = work.filter((item) => item.status !== "done");
  const overdue = open.filter((item) => item.dueDate && item.dueDate < today);
  const blocked = open.filter((item) => item.status === "blocked");
  const projects = boards.filter(
    (board) =>
      board.workspaceId === team.workspaceId &&
      board.planning?.teamId === team.id,
  );
  return {
    work,
    open,
    overdue,
    blocked,
    projects,
    completed: work.filter((item) => item.status === "done"),
    activeProjects: projects.filter(
      (board) => board.planning?.state !== "completed",
    ),
    milestones: sortTasks(
      work.filter((item) => item.type === "milestone"),
      "due",
    ),
    priority: sortTasks(
      open.filter(
        (item) =>
          item.status === "blocked" ||
          item.priority === "urgent" ||
          (item.dueDate && item.dueDate <= today),
      ),
      "due",
    ),
    upcoming: sortTasks(
      open.filter((item) => item.dueDate && item.dueDate >= today),
      "due",
    ),
    recent: sortTasks(work, "recent"),
    people: team.members.map((member) => {
      const assigned = open.filter((item) =>
        item.assignees.some((person) => person.id === member.user.id),
      );
      return {
        member,
        assigned,
        overdue: assigned.filter(
          (item) => item.dueDate && item.dueDate < today,
        ),
        blocked: assigned.filter((item) => item.status === "blocked"),
      };
    }),
  };
}

export const featureLabels: Record<TeamFeatureCapability, string> = {
  work: "Work coordination",
  messages: "Team messages",
  decisions: "Decisions",
  approvals: "Approvals",
  resources: "Resources",
  reporting: "Reporting",
};

export const presetLabels: Record<TeamPreset, string> = {
  leadership: "Leadership",
  marketing: "Marketing",
  technology: "Technology",
  operations: "Operations",
  sales: "Sales",
  custom: "Custom",
};

export const featureOptions = Object.keys(
  featureLabels,
) as TeamFeatureCapability[];
export const presetOptions = Object.keys(presetLabels) as TeamPreset[];

export function canManageTeams(
  managedWorkspaceIds: readonly string[],
  workspaceId: string,
) {
  return managedWorkspaceIds.includes(workspaceId);
}

export function canManageTeam(
  team: TeamDto,
  userId: string,
  managedWorkspaceIds: readonly string[],
) {
  return (
    canManageTeams(managedWorkspaceIds, team.workspaceId) ||
    team.members.some(
      (member) => member.user.id === userId && member.role === "lead",
    )
  );
}

export function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toLocaleUpperCase();
}
