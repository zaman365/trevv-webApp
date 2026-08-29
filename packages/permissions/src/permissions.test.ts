import { describe, expect, it } from "vitest";
import {
  can,
  canCollaborate,
  PermissionError,
  requireAccess,
  requireCollaborationAccess,
  type AccessContext,
  type CollaborationScope,
} from "./index";

const context = (role: AccessContext["role"]): AccessContext => ({
  userId: "user-a",
  organizationId: "org-a",
  role,
  accessiblePortfolioIds: new Set(["portfolio-a"]),
  managedPortfolioIds: new Set(["portfolio-a"]),
  accessibleWorkspaceIds: new Set(["workspace-a"]),
  managedWorkspaceIds: new Set(["workspace-a"]),
});

describe("tenant authorization", () => {
  it("rejects cross-tenant resource identifiers for every role", () => {
    for (const role of [
      "owner",
      "admin",
      "workspace_lead",
      "member",
      "guest",
      "viewer",
    ] as const)
      expect(
        can(context(role), "read", "item", {
          organizationId: "org-b",
          workspaceId: "workspace-a",
        }),
      ).toBe(false);
  });
  it("does not reveal unrelated Workspaces to a guest", () => {
    expect(
      can(context("guest"), "read", "workspace", {
        organizationId: "org-a",
        workspaceId: "workspace-unrelated",
        explicitlyShared: false,
      }),
    ).toBe(false);
    expect(() =>
      requireAccess(context("guest"), "read", "workspace", {
        organizationId: "org-a",
        workspaceId: "workspace-unrelated",
      }),
    ).toThrow(PermissionError);
  });
  it("requires explicit Portfolio membership outside organization-management roles", () => {
    expect(
      can(context("member"), "read", "portfolio", {
        organizationId: "org-a",
        portfolioId: "portfolio-a",
      }),
    ).toBe(true);
    expect(
      can(context("member"), "read", "portfolio", {
        organizationId: "org-a",
        portfolioId: "portfolio-unrelated",
      }),
    ).toBe(false);
  });
  it("keeps viewers read-only and allows Workspace Leads to manage their Workspace", () => {
    expect(
      can(context("viewer"), "update", "item", {
        organizationId: "org-a",
        workspaceId: "workspace-a",
        explicitlyShared: true,
      }),
    ).toBe(false);
    expect(
      can(context("workspace_lead"), "manage_members", "workspace", {
        organizationId: "org-a",
        workspaceId: "workspace-a",
      }),
    ).toBe(true);
    expect(
      can(context("workspace_lead"), "update", "board", {
        organizationId: "org-a",
        workspaceId: "workspace-a",
      }),
    ).toBe(true);
  });
});

const room = (
  overrides: Partial<CollaborationScope> = {},
): CollaborationScope => ({
  organizationId: "org-a",
  workspaceId: "workspace-a",
  kind: "workspace",
  visibility: "organization",
  activeParticipant: false,
  ...overrides,
});

describe("collaboration authorization", () => {
  it("covers every organization role across Workspace, Team, private, direct, and external rooms", () => {
    const roles = [
      "owner",
      "admin",
      "workspace_lead",
      "member",
      "guest",
      "viewer",
    ] as const;
    const roomCases = [
      {
        name: "Workspace room",
        scope: room(),
        participantRequired: false,
      },
      {
        name: "private room",
        scope: room({ visibility: "private" }),
        participantRequired: true,
      },
      {
        name: "Team room",
        scope: room({ kind: "team", visibility: "private" }),
        participantRequired: true,
      },
      {
        name: "direct room",
        scope: room({ kind: "direct", visibility: "private" }),
        participantRequired: true,
      },
      {
        name: "external room",
        scope: room({ kind: "external", visibility: "guest_scoped" }),
        participantRequired: true,
      },
    ] as const;

    for (const role of roles) {
      for (const roomCase of roomCases) {
        const activeScope = {
          ...roomCase.scope,
          activeParticipant: true,
          activeTeamMember: roomCase.scope.kind === "team",
        };
        const guestCanUseRoom =
          role !== "guest" || roomCase.scope.kind === "external";
        expect(
          canCollaborate(context(role), "read", "conversation", activeScope),
          `${role} read policy for assigned ${roomCase.name}`,
        ).toBe(guestCanUseRoom);
        expect(
          canCollaborate(context(role), "send", "message", activeScope),
          `${role} send policy for ${roomCase.name}`,
        ).toBe(role !== "viewer" && guestCanUseRoom);

        const removedScope = {
          ...activeScope,
          activeParticipant: false,
          activeTeamMember: false,
        };
        const canReadAfterRoomRemoval =
          !roomCase.participantRequired && role !== "guest";
        expect(
          canCollaborate(context(role), "read", "conversation", removedScope),
          `${role} removal policy for ${roomCase.name}`,
        ).toBe(canReadAfterRoomRemoval);
      }
    }
  });

  it("fails closed for a removed Workspace member regardless of role or room kind", () => {
    for (const role of [
      "owner",
      "admin",
      "workspace_lead",
      "member",
      "guest",
      "viewer",
    ] as const) {
      const removedContext = {
        ...context(role),
        accessibleWorkspaceIds: new Set<string>(),
        managedWorkspaceIds: new Set<string>(),
      };
      for (const scope of [
        room({ activeParticipant: true }),
        room({
          kind: "team",
          visibility: "private",
          activeParticipant: true,
          activeTeamMember: true,
        }),
        room({
          kind: "direct",
          visibility: "private",
          activeParticipant: true,
        }),
        room({
          kind: "external",
          visibility: "guest_scoped",
          activeParticipant: true,
        }),
      ]) {
        expect(
          canCollaborate(removedContext, "read", "conversation", scope),
        ).toBe(false);
        expect(canCollaborate(removedContext, "send", "message", scope)).toBe(
          false,
        );
      }
    }
  });

  it("never treats Team feature inheritance as a data grant", () => {
    expect(
      canCollaborate(context("member"), "read", "conversation", {
        ...room({ kind: "team", visibility: "private" }),
        activeParticipant: true,
        activeTeamMember: false,
      }),
    ).toBe(false);
    expect(
      canCollaborate(context("member"), "read", "conversation", {
        ...room({ kind: "team", visibility: "private" }),
        activeParticipant: true,
        activeTeamMember: true,
      }),
    ).toBe(true);
  });

  it("does not give owners or administrators implicit private-message access", () => {
    for (const role of ["owner", "admin"] as const) {
      expect(
        canCollaborate(
          context(role),
          "read",
          "message",
          room({
            kind: "direct",
            visibility: "private",
            activeParticipant: false,
          }),
        ),
      ).toBe(false);
      expect(() =>
        requireCollaborationAccess(
          context(role),
          "read",
          "message",
          room({
            kind: "direct",
            visibility: "private",
            activeParticipant: false,
          }),
        ),
      ).toThrow(PermissionError);
    }
  });

  it("keeps viewers read-only and guests explicitly scoped", () => {
    const shared = room({
      kind: "external",
      visibility: "guest_scoped",
      activeParticipant: true,
    });
    expect(canCollaborate(context("guest"), "read", "message", shared)).toBe(
      true,
    );
    expect(canCollaborate(context("guest"), "send", "message", shared)).toBe(
      true,
    );
    expect(canCollaborate(context("viewer"), "read", "message", shared)).toBe(
      true,
    );
    expect(canCollaborate(context("viewer"), "react", "message", shared)).toBe(
      false,
    );
    expect(
      canCollaborate(context("guest"), "manage_participants", "conversation", {
        ...shared,
        conversationOwner: true,
      }),
    ).toBe(false);
    expect(
      canCollaborate(context("guest"), "read", "team", {
        ...room({ kind: "team", visibility: "private" }),
        activeParticipant: true,
        activeTeamMember: true,
      }),
    ).toBe(false);
  });

  it("limits Team management to organization, Workspace, and Team leads", () => {
    expect(canCollaborate(context("owner"), "create", "team", room())).toBe(
      true,
    );
    expect(
      canCollaborate(context("workspace_lead"), "manage_members", "team", {
        ...room(),
        teamLead: false,
      }),
    ).toBe(true);
    expect(
      canCollaborate(context("member"), "manage_members", "team", {
        ...room(),
        teamLead: true,
      }),
    ).toBe(true);
    expect(
      canCollaborate(context("member"), "manage_members", "team", room()),
    ).toBe(false);
  });

  it("lets a response owner resolve a request without granting room administration", () => {
    const responseOwner = room({
      kind: "team",
      visibility: "private",
      activeParticipant: true,
      activeTeamMember: true,
      responseOwner: true,
    });
    expect(
      canCollaborate(context("member"), "update", "message", responseOwner),
    ).toBe(true);
    expect(
      canCollaborate(
        context("member"),
        "manage_participants",
        "conversation",
        responseOwner,
      ),
    ).toBe(false);
  });

  it("rejects every collaboration action across tenant or Workspace scope", () => {
    expect(
      canCollaborate(
        context("owner"),
        "read",
        "conversation",
        room({ organizationId: "org-b", activeParticipant: true }),
      ),
    ).toBe(false);
    expect(
      canCollaborate(
        context("owner"),
        "read",
        "conversation",
        room({ workspaceId: "workspace-b", activeParticipant: true }),
      ),
    ).toBe(false);
  });
});
