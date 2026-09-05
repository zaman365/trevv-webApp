import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { clientNavigationHeader } from "./navigation-request";

const state = vi.hoisted(() => ({
  headers: new Headers(),
  session: vi.fn(),
  snapshot: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => state.headers,
}));
vi.mock("./server-auth", () => ({ requireAppSession: state.session }));
vi.mock("./server-live-data", () => ({ loadLiveAppData: state.snapshot }));
vi.mock("../components/app-shell-providers", () => ({
  AppShellProviders: () => null,
}));
import AppLayout from "../app/app/layout";

beforeEach(() => {
  vi.stubEnv("DEMO_MODE", "false");
  state.headers = new Headers();
  state.session.mockReset().mockResolvedValue({
    user: {
      id: "user-one",
      email: "owner@example.test",
      name: "Owner",
      role: "owner",
    },
    organization: { id: "org-one", name: "One", role: "owner" },
    availableOrganizations: [],
    managedWorkspaceIds: [],
  });
  state.snapshot
    .mockReset()
    .mockResolvedValue({ portfolios: [], refreshedAt: "2026-09-05T00:00:00Z" });
});
afterEach(() => vi.unstubAllEnvs());

describe("authorized layout navigation", () => {
  it("seeds complete document loads from the server", async () => {
    const layout = await AppLayout({ children: "page" });
    expect(state.session).toHaveBeenCalledOnce();
    expect(state.snapshot).toHaveBeenCalledOnce();
    expect(layout.props.liveData).toEqual(
      await state.snapshot.mock.results[0]!.value,
    );
  });

  it("does not wait for the organization snapshot on an authenticated RSC navigation", async () => {
    state.headers.set(clientNavigationHeader, "1");
    state.snapshot.mockImplementation(() => new Promise(() => {}));
    const layout = await AppLayout({ children: "page" });
    expect(state.session).toHaveBeenCalledOnce();
    expect(state.snapshot).not.toHaveBeenCalled();
    expect(layout.props.liveData).toBeUndefined();
    expect(layout.props.session.organization.id).toBe("org-one");
  });

  it.each([false, true])(
    "keeps session failures authoritative (navigation=%s)",
    async (navigation) => {
      if (navigation) state.headers.set(clientNavigationHeader, "1");
      state.session.mockRejectedValue(new Error("identity_access_unavailable"));
      await expect(AppLayout({ children: "protected" })).rejects.toThrow(
        "identity_access_unavailable",
      );
      expect(state.snapshot).not.toHaveBeenCalled();
    },
  );
});
