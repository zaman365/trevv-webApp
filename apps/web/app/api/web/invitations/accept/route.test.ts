import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  serverApiFetch: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/lib/server-auth", () => ({
  serverApiFetch: mocks.serverApiFetch,
}));

import { POST } from "./route";

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://trevv.test");
  mocks.cookies.mockReset();
  mocks.serverApiFetch.mockReset();
});

afterEach(() => vi.unstubAllEnvs());

describe("Web invitation acceptance", () => {
  it("keeps the raw token path primary when its scoped cookie exists", async () => {
    mocks.cookies.mockResolvedValue(cookieStore("opaque-invitation-token"));
    mocks.serverApiFetch.mockResolvedValue(
      Response.json({ organizationId: "organization-a" }),
    );

    const response = await POST(sameOriginRequest());

    expect(response.status).toBe(200);
    expect(mocks.serverApiFetch).toHaveBeenCalledWith("/invitations/accept", {
      method: "POST",
      body: JSON.stringify({ token: "opaque-invitation-token" }),
    });
  });

  it("preserves the raw token so a lost acceptance response can replay safely", async () => {
    mocks.cookies.mockResolvedValue(cookieStore("opaque-invitation-token"));
    mocks.serverApiFetch
      .mockRejectedValueOnce(new Error("upstream response lost"))
      .mockResolvedValueOnce(
        Response.json({ organizationId: "organization-replayed" }),
      );

    const uncertain = await POST(sameOriginRequest());
    const replayed = await POST(sameOriginRequest());

    expect(uncertain.status).toBe(503);
    expect(uncertain.headers.get("set-cookie")).toBeNull();
    expect(replayed.status).toBe(200);
    await expect(replayed.json()).resolves.toEqual({ accepted: true });
    expect(replayed.headers.get("set-cookie")).toContain(
      "trevv.pending_invitation=",
    );
    expect(mocks.serverApiFetch).toHaveBeenNthCalledWith(
      1,
      "/invitations/accept",
      {
        method: "POST",
        body: JSON.stringify({ token: "opaque-invitation-token" }),
      },
    );
    expect(mocks.serverApiFetch).toHaveBeenNthCalledWith(
      2,
      "/invitations/accept",
      {
        method: "POST",
        body: JSON.stringify({ token: "opaque-invitation-token" }),
      },
    );
  });

  it("falls back to the durable claim when the raw invitation cookie is stale", async () => {
    mocks.cookies.mockResolvedValue(cookieStore("stale-invitation-token"));
    mocks.serverApiFetch
      .mockResolvedValueOnce(
        Response.json(
          { error: { code: "resource_not_found" } },
          { status: 404 },
        ),
      )
      .mockResolvedValueOnce(claimRequiredResponse())
      .mockResolvedValueOnce(
        Response.json({ organizationId: "organization-recovered" }),
      );

    const response = await POST(sameOriginRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ accepted: true });
    expect(mocks.serverApiFetch).toHaveBeenNthCalledWith(
      1,
      "/invitations/accept",
      {
        method: "POST",
        body: JSON.stringify({ token: "stale-invitation-token" }),
      },
    );
    expect(mocks.serverApiFetch).toHaveBeenNthCalledWith(2, "/session");
    expect(mocks.serverApiFetch).toHaveBeenNthCalledWith(
      3,
      "/invitations/accept-claim",
      { method: "POST" },
    );
  });

  it("does not treat an active session as proof that a stale raw token was accepted", async () => {
    mocks.cookies.mockResolvedValue(cookieStore("unrelated-stale-token"));
    mocks.serverApiFetch
      .mockResolvedValueOnce(
        Response.json(
          { error: { code: "resource_not_found" } },
          { status: 404 },
        ),
      )
      .mockResolvedValueOnce(
        Response.json({ organizationId: "existing-organization" }),
      );

    const response = await POST(sameOriginRequest());

    expect(response.status).toBe(404);
    expect(mocks.serverApiFetch).toHaveBeenCalledTimes(2);
    expect(mocks.serverApiFetch).not.toHaveBeenCalledWith(
      "/invitations/accept-claim",
      expect.anything(),
    );
    expect(response.headers.get("set-cookie")).toContain(
      "trevv.pending_invitation=",
    );
  });

  it("recovers through the durable authenticated claim only when the raw cookie is absent", async () => {
    mocks.cookies.mockResolvedValue(cookieStore(undefined));
    mocks.serverApiFetch
      .mockResolvedValueOnce(claimRequiredResponse())
      .mockResolvedValueOnce(
        Response.json({ organizationId: "organization-b" }),
      );

    const response = await POST(sameOriginRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ accepted: true });
    expect(mocks.serverApiFetch).toHaveBeenCalledWith(
      "/invitations/accept-claim",
      { method: "POST" },
    );
  });

  it("reconciles a prior durable acceptance on a later cookie-free retry", async () => {
    mocks.cookies.mockResolvedValue(cookieStore(undefined));
    mocks.serverApiFetch.mockResolvedValue(
      Response.json({ organizationId: "organization-already-accepted" }),
    );

    const response = await POST(sameOriginRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ accepted: true });
    expect(mocks.serverApiFetch).toHaveBeenCalledTimes(1);
    expect(mocks.serverApiFetch).toHaveBeenCalledWith("/session");
    expect(response.headers.get("set-cookie")).toContain(
      "trevv.pending_invitation=",
    );
  });

  it("propagates anonymous claim recovery as sign-in-required without inventing acceptance", async () => {
    mocks.cookies.mockResolvedValue(cookieStore(undefined));
    mocks.serverApiFetch.mockResolvedValue(
      Response.json({ error: { code: "unauthorized" } }, { status: 401 }),
    );

    const response = await POST(sameOriginRequest());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Sign in with the invited email address to continue.",
    });
  });

  it("keeps a missing durable claim non-leaking", async () => {
    mocks.cookies.mockResolvedValue(cookieStore(undefined));
    mocks.serverApiFetch
      .mockResolvedValueOnce(claimRequiredResponse())
      .mockResolvedValueOnce(
        Response.json(
          { error: { code: "invitation_invalid" } },
          { status: 404 },
        ),
      )
      .mockResolvedValueOnce(claimRequiredResponse());

    const response = await POST(sameOriginRequest());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "This invitation is invalid, expired, revoked, or already used.",
    });
  });

  it("reconciles a durable claim when acceptance committed but its response was lost", async () => {
    mocks.cookies.mockResolvedValue(cookieStore(undefined));
    mocks.serverApiFetch
      .mockResolvedValueOnce(claimRequiredResponse())
      .mockRejectedValueOnce(new Error("upstream response lost"))
      .mockResolvedValueOnce(
        Response.json({ organizationId: "organization-committed" }),
      );

    const response = await POST(sameOriginRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ accepted: true });
    expect(response.headers.get("set-cookie")).toContain(
      "trevv.pending_invitation=",
    );
    expect(mocks.serverApiFetch).toHaveBeenNthCalledWith(1, "/session");
    expect(mocks.serverApiFetch).toHaveBeenNthCalledWith(
      2,
      "/invitations/accept-claim",
      { method: "POST" },
    );
    expect(mocks.serverApiFetch).toHaveBeenNthCalledWith(3, "/session");
  });

  it.each([
    [429, 429],
    [503, 503],
  ])(
    "preserves the invitation cookie and retry guidance for upstream HTTP %s",
    async (upstreamStatus, responseStatus) => {
      mocks.cookies.mockResolvedValue(cookieStore("opaque-invitation-token"));
      mocks.serverApiFetch.mockResolvedValue(
        Response.json(
          { error: { code: "temporarily_unavailable" } },
          {
            status: upstreamStatus,
            headers: {
              "retry-after": "17",
              "x-request-id": "invitation-request-1",
            },
          },
        ),
      );

      const response = await POST(sameOriginRequest());

      expect(response.status).toBe(responseStatus);
      expect(response.headers.get("set-cookie")).toBeNull();
      expect(response.headers.get("retry-after")).toBe("17");
      expect(response.headers.get("x-request-id")).toBe("invitation-request-1");
    },
  );
});

function cookieStore(token: string | undefined) {
  return {
    get: vi.fn().mockReturnValue(token ? { value: token } : undefined),
  };
}

function claimRequiredResponse() {
  return Response.json(
    { error: { code: "invitation_acceptance_required" } },
    { status: 409 },
  );
}

function sameOriginRequest() {
  return new Request("https://trevv.test/api/web/invitations/accept", {
    method: "POST",
    headers: { origin: "https://trevv.test" },
  });
}
