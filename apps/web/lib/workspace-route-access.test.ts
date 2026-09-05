import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { TrevvApiError } from "@founderhq/api-client";

const state = vi.hoisted(() => ({ workspaces: vi.fn(), detail: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({
    toString: () => "trevv.session_token=test",
    get: () => undefined,
  }),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT;${url}`);
  },
}));
vi.mock("@founderhq/api-client", async (original) => ({
  ...(await original<typeof import("@founderhq/api-client")>()),
  createApiClient: () => ({
    workspaces: state.workspaces,
    workspace: state.detail,
  }),
}));
import { requireWorkspaceAccess } from "./server-auth";

const organization = {
  id: "org-one",
  name: "One",
  slug: "one",
  role: "owner",
  timezone: "Europe/Berlin",
};
const session = {
  user: {
    id: "user-one",
    email: "owner@example.test",
    name: "Owner",
    role: "owner",
    locale: "en",
  },
  organizationId: organization.id,
  organization,
  availableOrganizations: [organization],
  managedWorkspaceIds: ["workspace-one"],
  expiresAt: "2099-01-01T00:00:00.000Z",
};
beforeEach(() => {
  vi.stubEnv("DEMO_MODE", "false");
  vi.stubEnv("API_ORIGIN", "http://api.test");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(session)),
  );
  state.workspaces
    .mockReset()
    .mockResolvedValue([{ id: "workspace-one", slug: "allowed" }]);
  state.detail.mockReset().mockResolvedValue({
    workspace: { id: "workspace-one" },
    items: ["complete history"],
    rollup: { open: 101 },
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("workspace routing without loading its item history", () => {
  it("starts workspace access while session resolution is pending", async () => {
    let completeSession!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            completeSession = resolve;
          }),
      ),
    );
    const result = requireWorkspaceAccess(
      "allowed",
      "/app/workspaces/allowed",
      { details: false },
    );
    await vi.waitFor(() => expect(state.workspaces).toHaveBeenCalledOnce());
    completeSession(Response.json(session));
    expect((await result).workspace?.id).toBe("workspace-one");
  });

  it.each(["pending", "failed"])(
    "redirects an anonymous session without waiting for %s workspace access",
    async (outcome) => {
      state.workspaces.mockImplementation(() =>
        outcome === "pending"
          ? new Promise(() => {})
          : Promise.reject(new Error("workspace failed")),
      );
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          Response.json(
            { error: { code: "unauthenticated" } },
            { status: 401 },
          ),
        ),
      );
      await expect(
        requireWorkspaceAccess("allowed", "/app/workspaces/allowed", {
          details: false,
        }),
      ).rejects.toThrow("NEXT_REDIRECT;/sign-in?next=");
    },
  );

  it("uses the authoritative accessible list and never requests full detail for route checks", async () => {
    const result = await requireWorkspaceAccess(
      "allowed",
      "/app/workspaces/allowed",
      { details: false },
    );
    expect(result.workspace?.id).toBe("workspace-one");
    expect(state.workspaces).toHaveBeenCalledOnce();
    expect(state.detail).not.toHaveBeenCalled();
  });

  it("preserves complete workspace detail for existing callers", async () => {
    expect(
      await requireWorkspaceAccess("allowed", "/app/workspaces/allowed"),
    ).toMatchObject({ items: ["complete history"], rollup: { open: 101 } });
    expect(state.detail).toHaveBeenCalledWith("allowed");
    expect(state.workspaces).not.toHaveBeenCalled();
  });

  it.each(["unknown", "other-organization", "removed"])(
    "keeps an inaccessible %s workspace as a 404",
    async (slug) => {
      await expect(
        requireWorkspaceAccess(slug, `/app/workspaces/${slug}`, {
          details: false,
        }),
      ).rejects.toThrow(";404");
      expect(state.detail).not.toHaveBeenCalled();
    },
  );

  it("rechecks access on a later request after revocation", async () => {
    await requireWorkspaceAccess("allowed", "/app/workspaces/allowed", {
      details: false,
    });
    state.workspaces.mockResolvedValue([]);
    await expect(
      requireWorkspaceAccess("allowed", "/app/workspaces/allowed", {
        details: false,
      }),
    ).rejects.toThrow(";404");
  });

  it.each([401, 403, 404])(
    "retains upstream access failure handling for %s",
    async (status) => {
      state.workspaces.mockRejectedValue(
        new TrevvApiError(
          "access_unavailable",
          "Unavailable",
          "request",
          status,
        ),
      );
      await expect(
        requireWorkspaceAccess("allowed", "/app/workspaces/allowed", {
          details: false,
        }),
      ).rejects.toThrow(
        status === 401 ? "NEXT_REDIRECT;/sign-in?next=" : ";404",
      );
    },
  );
});
