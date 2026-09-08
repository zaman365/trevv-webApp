import { describe, expect, it } from "vitest";
import { workspaceShellRoute } from "./workspace-shell-route";
import { workspaceViews } from "./workspace-routes";

describe("persistent shell route ownership", () => {
  it("loads accessible organization records for all My Work while preserving the scoped route", () => {
    expect(workspaceShellRoute("/app/my-work")).toEqual({
      active: "myWork",
      requiresRecords: true,
    });
    expect(workspaceShellRoute("/app/workspaces/launch/my-work")).toEqual({
      active: "myWork",
      workspaceSlug: "launch",
      requiresRecords: true,
    });
  });
  it.each(workspaceViews)(
    "preserves chrome and record access for %s",
    (view) => {
      expect(workspaceShellRoute(`/app/workspaces/one/${view}`)).toMatchObject({
        workspaceSlug: "one",
        requiresRecords: true,
      });
    },
  );
  it.each(["sessions", "privacy", "invitations"])(
    "does not block account %s on item history",
    (page) => {
      expect(workspaceShellRoute(`/app/account/${page}`)).toEqual({
        active: "settings",
        requiresRecords: false,
      });
    },
  );
  it.each([
    "/app/workspaces/one/stakeholder",
    "/app/workspaces/one/unknown",
    "/app/hubs/one",
    "/sign-in",
    "/app/unknown",
  ])("keeps standalone or unavailable route %s outside chrome", (path) => {
    expect(workspaceShellRoute(path)).toBeNull();
  });
  it("preserves board and import routes plus encoded workspace identities", () => {
    expect(
      workspaceShellRoute("/app/workspaces/team%20one/boards/board-id"),
    ).toEqual({
      active: "workspace",
      workspaceSlug: "team one",
      requiresRecords: true,
    });
    expect(
      workspaceShellRoute("/app/workspaces/one/settings/import"),
    ).toMatchObject({ active: "settings" });
  });
});
