import { describe, expect, it } from "vitest";
import {
  capabilitiesForMember,
  createInitialWorkspaceTeams,
  setTeamMembership,
  teamsForMember,
  type WorkspaceTeam,
} from "./teams";

const members = [
  {
    userId: "owner",
    workspaceIds: ["workspace-a"],
    role: "Owner" as const,
  },
  {
    userId: "member",
    workspaceIds: ["workspace-a"],
    role: "Member" as const,
  },
];

describe("workspace teams", () => {
  it("creates multiple workspace-scoped teams with useful defaults", () => {
    const teams = createInitialWorkspaceTeams([{ id: "workspace-a" }], members);

    expect(teams.map((team) => team.name)).toEqual([
      "Leadership",
      "Marketing",
      "Technology",
    ]);
    expect(teams.every((team) => team.workspaceId === "workspace-a")).toBe(
      true,
    );
    expect(teams.find((team) => team.name === "Leadership")?.leadMemberId).toBe(
      "owner",
    );
  });

  it("derives the unique capabilities a person inherits from their teams", () => {
    const teams: WorkspaceTeam[] = [
      {
        id: "marketing",
        workspaceId: "workspace-a",
        name: "Marketing",
        description: "",
        leadMemberId: "owner",
        memberIds: ["owner"],
        capabilities: ["work", "messages"],
        accent: "amber",
      },
      {
        id: "leadership",
        workspaceId: "workspace-a",
        name: "Leadership",
        description: "",
        leadMemberId: "owner",
        memberIds: ["owner"],
        capabilities: ["messages", "decisions"],
        accent: "violet",
      },
    ];

    expect(capabilitiesForMember(teams, "owner")).toEqual([
      "work",
      "messages",
      "decisions",
    ]);
  });

  it("adds and removes membership while keeping a valid team lead", () => {
    const teams = createInitialWorkspaceTeams([{ id: "workspace-a" }], members);
    const marketing = teams.find((team) => team.name === "Marketing")!;
    const withMember = setTeamMembership(teams, marketing.id, "member", true);

    expect(
      teamsForMember(withMember, "member").map((team) => team.name),
    ).toContain("Marketing");

    const withoutLead = setTeamMembership(
      withMember,
      marketing.id,
      marketing.leadMemberId!,
      false,
    );
    const updated = withoutLead.find((team) => team.id === marketing.id)!;
    expect(updated.memberIds).not.toContain(marketing.leadMemberId);
    expect(updated.leadMemberId).toBe(updated.memberIds[0] ?? null);
  });
});
