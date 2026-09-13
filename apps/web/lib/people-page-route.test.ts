import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ access: vi.fn(), mode: vi.fn() }));
vi.mock("./server-auth", () => ({ requireWorkspaceAccess: state.access }));
vi.mock("./web-runtime-config", () => ({ webRuntimeMode: state.mode }));
vi.mock("next/navigation", () => ({
  redirect: (href: string) => {
    throw new Error(`redirect:${href}`);
  },
}));
vi.mock("../components/live-people-page", () => ({
  LivePeoplePage: () => null,
}));
import PersonPage from "../app/app/workspaces/[workspaceSlug]/people/[userId]/page";
import PeoplePage from "../app/app/workspaces/[workspaceSlug]/people/page";
beforeEach(() => {
  state.access.mockReset().mockResolvedValue({});
  state.mode.mockReset().mockReturnValue("live");
});
describe("people page routing", () => {
  it("checks workspace access before rendering the directory and profile", async () => {
    await PeoplePage({ params: Promise.resolve({ workspaceSlug: "launch" }) });
    expect(state.access).toHaveBeenLastCalledWith(
      "launch",
      "/app/workspaces/launch/people",
      { details: false },
    );
    const page = await PersonPage({
      params: Promise.resolve({ workspaceSlug: "launch", userId: "user-one" }),
    });
    expect(state.access).toHaveBeenLastCalledWith(
      "launch",
      "/app/workspaces/launch/people/user-one",
      { details: false },
    );
    expect(page.props).toMatchObject({
      workspaceSlug: "launch",
      userId: "user-one",
    });
  });
  it("does not render a person when workspace access is denied", async () => {
    state.access.mockRejectedValue(new Error("access removed"));
    await expect(
      PersonPage({
        params: Promise.resolve({
          workspaceSlug: "launch",
          userId: "user-one",
        }),
      }),
    ).rejects.toThrow("access removed");
    expect(state.mode).not.toHaveBeenCalled();
  });
  it("preserves the fictional team experience in demo mode", async () => {
    state.mode.mockReturnValue("demo");
    await expect(
      PeoplePage({ params: Promise.resolve({ workspaceSlug: "launch" }) }),
    ).rejects.toThrow("redirect:/app/workspaces/launch/teams");
  });
});
