import { describe, expect, it } from "vitest";
import {
  can,
  PermissionError,
  requireAccess,
  type AccessContext,
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
