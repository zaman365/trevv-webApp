export const teamCapabilityCatalog = [
  {
    id: "work",
    label: "Boards & tasks",
    description: "Create, assign, and update work in this workspace.",
  },
  {
    id: "messages",
    label: "Team messages",
    description: "Join the team's workspace conversations and rooms.",
  },
  {
    id: "decisions",
    label: "Decisions",
    description: "Contribute to decisions owned by the team.",
  },
  {
    id: "approvals",
    label: "Approvals",
    description: "Review and respond to team approval requests.",
  },
  {
    id: "resources",
    label: "Files & resources",
    description:
      "Use the links, files, and connected tools shared with the team.",
  },
  {
    id: "reporting",
    label: "Reports & analytics",
    description: "See team-level progress, workload, and delivery signals.",
  },
] as const;

export type TeamCapabilityId = (typeof teamCapabilityCatalog)[number]["id"];
export type TeamAccent = "violet" | "blue" | "amber" | "green";

export interface WorkspaceTeam {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  leadMemberId: string | null;
  memberIds: string[];
  capabilities: TeamCapabilityId[];
  accent: TeamAccent;
}

export interface StoredWorkspaceTeamMember {
  userId: string;
  userName: string;
  workspaceIds: string[];
  email?: string;
  role?: "Owner" | "Admin" | "Member" | "Guest";
  status?: "active" | "away" | "draft";
}

export interface StoredWorkspaceTeamsSnapshot<
  TMember extends StoredWorkspaceTeamMember = StoredWorkspaceTeamMember,
> {
  members: TMember[];
  teams: WorkspaceTeam[];
}

export const workspaceTeamsStorageKey = "trevv:workspace-teams:v1";
export const workspaceTeamsChangedEvent = "trevv:workspace-teams-changed";

export function readWorkspaceTeamsSnapshot<
  TMember extends StoredWorkspaceTeamMember = StoredWorkspaceTeamMember,
>(): StoredWorkspaceTeamsSnapshot<TMember> | null {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(workspaceTeamsStorageKey) ?? "null",
    ) as Partial<StoredWorkspaceTeamsSnapshot<TMember>> | null;
    if (
      !parsed ||
      !Array.isArray(parsed.members) ||
      !Array.isArray(parsed.teams)
    )
      return null;
    const members = parsed.members.filter((member): member is TMember =>
      Boolean(
        member &&
        typeof member.userId === "string" &&
        typeof member.userName === "string" &&
        Array.isArray(member.workspaceIds),
      ),
    );
    const teams = parsed.teams.filter((team): team is WorkspaceTeam =>
      Boolean(
        team &&
        typeof team.id === "string" &&
        typeof team.workspaceId === "string" &&
        typeof team.name === "string" &&
        Array.isArray(team.memberIds) &&
        Array.isArray(team.capabilities),
      ),
    );
    return { members, teams };
  } catch {
    return null;
  }
}

export function writeWorkspaceTeamsSnapshot<
  TMember extends StoredWorkspaceTeamMember,
>(snapshot: StoredWorkspaceTeamsSnapshot<TMember>): void {
  localStorage.setItem(workspaceTeamsStorageKey, JSON.stringify(snapshot));
  window.dispatchEvent(new CustomEvent(workspaceTeamsChangedEvent));
}

interface WorkspaceIdentity {
  id: string;
}

interface WorkspaceMemberIdentity {
  userId: string;
  workspaceIds: readonly string[];
  role?: "Owner" | "Admin" | "Member" | "Guest";
}

const teamTemplates: ReadonlyArray<
  Pick<WorkspaceTeam, "name" | "description" | "capabilities" | "accent">
> = [
  {
    name: "Leadership",
    description:
      "Workspace direction, decisions, approvals, and operating signals.",
    capabilities: ["decisions", "approvals", "reporting"],
    accent: "violet",
  },
  {
    name: "Marketing",
    description:
      "Campaign planning, creative delivery, and launch coordination.",
    capabilities: ["work", "messages", "approvals", "resources"],
    accent: "amber",
  },
  {
    name: "Technology",
    description:
      "Product delivery, technical decisions, and shared documentation.",
    capabilities: ["work", "messages", "decisions", "resources"],
    accent: "blue",
  },
];

export function createInitialWorkspaceTeams(
  workspaces: readonly WorkspaceIdentity[],
  members: readonly WorkspaceMemberIdentity[],
): WorkspaceTeam[] {
  return workspaces.flatMap((workspace) => {
    const candidates = members.filter((member) =>
      member.workspaceIds.includes(workspace.id),
    );
    const leaders = candidates.filter((member) =>
      ["Owner", "Admin"].includes(member.role ?? "Member"),
    );

    return teamTemplates.map((template, templateIndex) => {
      const selected = candidates.filter((_, memberIndex) => {
        if (templateIndex === 0)
          return ["Owner", "Admin"].includes(
            candidates[memberIndex]!.role ?? "Member",
          );
        return memberIndex % 2 === (templateIndex - 1) % 2;
      });
      const assigned = selected.length ? selected : candidates.slice(0, 1);

      return {
        id: `${workspace.id}-${template.name.toLocaleLowerCase()}`,
        workspaceId: workspace.id,
        name: template.name,
        description: template.description,
        leadMemberId:
          (templateIndex === 0 ? leaders[0] : assigned[0])?.userId ?? null,
        memberIds: assigned.map((member) => member.userId),
        capabilities: [...template.capabilities],
        accent: template.accent,
      };
    });
  });
}

export function teamsForMember(
  teams: readonly WorkspaceTeam[],
  memberId: string,
): WorkspaceTeam[] {
  return teams.filter((team) => team.memberIds.includes(memberId));
}

export function capabilitiesForMember(
  teams: readonly WorkspaceTeam[],
  memberId: string,
): TeamCapabilityId[] {
  const inherited = new Set(
    teamsForMember(teams, memberId).flatMap((team) => team.capabilities),
  );
  return teamCapabilityCatalog
    .map((capability) => capability.id)
    .filter((capability) => inherited.has(capability));
}

export function setTeamMembership(
  teams: readonly WorkspaceTeam[],
  teamId: string,
  memberId: string,
  assigned: boolean,
): WorkspaceTeam[] {
  return teams.map((team) => {
    if (team.id !== teamId) return team;
    const memberIds = assigned
      ? [...new Set([...team.memberIds, memberId])]
      : team.memberIds.filter((candidate) => candidate !== memberId);
    return {
      ...team,
      memberIds,
      leadMemberId:
        !assigned && team.leadMemberId === memberId
          ? (memberIds[0] ?? null)
          : team.leadMemberId,
    };
  });
}
