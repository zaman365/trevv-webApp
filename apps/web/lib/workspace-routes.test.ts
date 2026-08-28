import { describe, expect, it } from "vitest";
import {
  isWorkspaceView,
  workspaceDirectoryHref,
  workspaceHref,
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
    expect(isWorkspaceView("portfolio")).toBe(false);
    expect(isWorkspaceView("unknown")).toBe(false);
  });

  it("keeps workspace creation at the directory boundary", () => {
    expect(workspaceDirectoryHref()).toBe("/app/workspaces");
    expect(workspaceDirectoryHref(true)).toBe(
      "/app/workspaces?create=workspace",
    );
  });
});
