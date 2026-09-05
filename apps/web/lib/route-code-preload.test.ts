import { describe, expect, it, vi } from "vitest";
import {
  isAppPath,
  preloadRouteCode,
  routeCodeModules,
} from "./route-code-preload";
import { workspaceViews } from "./workspace-routes";

const state = vi.hoisted(() => ({ calendar: vi.fn(), loader: vi.fn() }));
vi.mock("../components/calendar-experience", () => {
  state.calendar();
  return {};
});
vi.mock("../components/workspace-module-loader", () => {
  state.loader();
  return {};
});

describe("static route warming", () => {
  it("supports every existing workspace view in both runtime modes", () => {
    for (const mode of ["demo", "live"] as const)
      for (const view of workspaceViews)
        expect(
          routeCodeModules(`/app/workspaces/one/${view}?query=yes#item`, mode),
        ).toHaveLength(2);
    expect(routeCodeModules("/app/workspaces/one/settings", "live")).toContain(
      "liveWork",
    );
    expect(routeCodeModules("/app/workspaces/one/settings", "demo")).toContain(
      "settings",
    );
    expect(
      routeCodeModules("/app/workspaces/one/boards/board", "live"),
    ).toContain("liveBoard");
    expect(routeCodeModules("/app/workspaces/one/stakeholder", "live")).toEqual(
      ["stakeholder"],
    );
    expect(
      routeCodeModules("/app/workspaces/one/settings/import", "demo"),
    ).toEqual(["management"]);
  });
  it("does not guess an unknown, external, or public route", () => {
    for (const path of [
      "/sign-in",
      "https://example.test/app/portfolio",
      "/app/workspaces/one/missing",
      "/app/missing",
    ])
      expect(routeCodeModules(path, "live")).toEqual([]);
    expect(isAppPath("/application")).toBe(false);
    expect(isAppPath("/app?next=one")).toBe(true);
  });
  it("deduplicates concurrent warming by module across workspace slugs", async () => {
    expect(state.calendar).not.toHaveBeenCalled();
    await Promise.all([
      preloadRouteCode("/app/workspaces/one/calendar", "live"),
      preloadRouteCode("/app/workspaces/two/calendar", "live"),
    ]);
    expect(state.calendar).toHaveBeenCalledOnce();
    expect(state.loader).toHaveBeenCalledOnce();
  });
});
