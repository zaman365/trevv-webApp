import { describe, expect, it } from "vitest";
import {
  isWorkspaceView,
  workspaceHref,
  workspaceScopeHref,
} from "./workspace-routes";

describe("workspace routes", () => {
  it("builds canonical overview and module URLs", () => {
    expect(workspaceHref("northstar-apparel")).toBe(
      "/app/workspaces/northstar-apparel",
    );
    expect(workspaceHref("northstar-apparel", "attention")).toBe(
      "/app/workspaces/northstar-apparel/attention",
    );
    expect(workspaceHref("northstar apparel", "inbox", "waiting")).toBe(
      "/app/workspaces/northstar%20apparel/inbox#waiting",
    );
  });

  it("recognizes only supported workspace modules", () => {
    expect(isWorkspaceView("dashboard")).toBe(true);
    expect(isWorkspaceView("teams")).toBe(true);
    expect(isWorkspaceView("team")).toBe(false);
    expect(isWorkspaceView("portfolio")).toBe(false);
    expect(isWorkspaceView("unknown")).toBe(false);
  });

  it("never invents an operational scope when no workspace is selected", () => {
    expect(workspaceScopeHref(undefined, "attention")).toBe("/app/portfolio");
    expect(workspaceScopeHref("northstar-apparel", "attention")).toBe(
      "/app/workspaces/northstar-apparel/attention",
    );
  });
});
