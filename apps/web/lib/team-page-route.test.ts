import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ access: vi.fn(), mode: vi.fn() }));
vi.mock("./server-auth", () => ({ requireWorkspaceAccess: state.access }));
vi.mock("./web-runtime-config", () => ({ webRuntimeMode: state.mode }));
vi.mock("next/navigation", () => ({
  redirect: (href: string) => {
    throw new Error(`redirect:${href}`);
  },
}));
vi.mock("../components/live-team-page", () => ({ LiveTeamPage: () => null }));
import TeamPage from "../app/app/workspaces/[workspaceSlug]/teams/[teamId]/page";
beforeEach(() => {
  state.access.mockReset().mockResolvedValue({});
  state.mode.mockReset().mockReturnValue("live");
});
describe("team page routing", () => {
  it("checks workspace access before rendering the requested team", async () => {
    const page = await TeamPage({
      params: Promise.resolve({ workspaceSlug: "launch", teamId: "team-one" }),
    });
    expect(state.access).toHaveBeenCalledWith(
      "launch",
      "/app/workspaces/launch/teams/team-one",
      { details: false },
    );
    expect(page.props).toMatchObject({
      workspaceSlug: "launch",
      teamId: "team-one",
    });
  });
  it("does not render a team when workspace access fails", async () => {
    state.access.mockRejectedValue(new Error("access removed"));
    await expect(
      TeamPage({
        params: Promise.resolve({
          workspaceSlug: "launch",
          teamId: "team-one",
        }),
      }),
    ).rejects.toThrow("access removed");
    expect(state.mode).not.toHaveBeenCalled();
  });
  it("preserves the fictional team directory in demo mode", async () => {
    state.mode.mockReturnValue("demo");
    await expect(
      TeamPage({
        params: Promise.resolve({
          workspaceSlug: "launch",
          teamId: "team-one",
        }),
      }),
    ).rejects.toThrow("redirect:/app/workspaces/launch/teams");
  });
});
