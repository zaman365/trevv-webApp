import { afterEach, describe, expect, it, vi } from "vitest";
import { proxyApiRequest } from "./api-proxy";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("browser API proxy boundary", () => {
  it.each([
    ["GET", ["auth", "get-session"]],
    ["GET", ["auth", "list-sessions"]],
    ["POST", ["auth", "revoke-session"]],
    ["POST", ["auth", "sign-out"]],
    ["GET", ["auth", "sign-in", "email"]],
  ])("does not expose %s /api/%s", async (method, segments) => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);

    const response = await proxyApiRequest(
      new Request(`https://trevv.test/api/${segments.join("/")}`, { method }),
      segments,
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(upstream).not.toHaveBeenCalled();
  });

  it("replaces successful sign-in bodies while preserving the HTTP-only cookie", async () => {
    vi.stubEnv("API_ORIGIN", "https://api.trevv.test");
    const upstream = vi.fn().mockResolvedValue(
      Response.json(
        {
          token: "raw-session-token",
          session: { token: "nested-session-token" },
          user: { email: "founder@example.test" },
        },
        {
          headers: {
            "set-cookie":
              "trevv.session_token=opaque; HttpOnly; Secure; SameSite=Lax",
          },
        },
      ),
    );
    vi.stubGlobal("fetch", upstream);

    const response = await proxyApiRequest(
      new Request("https://trevv.test/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "founder@example.test",
          password: "not-a-real-password",
        }),
      }),
      ["auth", "sign-in", "email"],
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("set-cookie")).toContain(
      "trevv.session_token=opaque",
    );
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(upstream).toHaveBeenCalledOnce();
  });

  it("returns only public validation fields from failed auth operations", async () => {
    const upstream = vi.fn().mockResolvedValue(
      Response.json(
        {
          code: "INVALID_EMAIL_OR_PASSWORD",
          message: "Email or password is incorrect.",
          token: "must-not-cross-the-web-boundary",
        },
        { status: 401 },
      ),
    );
    vi.stubGlobal("fetch", upstream);

    const response = await proxyApiRequest(
      new Request("https://trevv.test/api/auth/sign-in/email", {
        method: "POST",
      }),
      ["auth", "sign-in", "email"],
    );
    const text = await response.text();

    expect(response.status).toBe(401);
    expect(JSON.parse(text)).toEqual({
      code: "INVALID_EMAIL_OR_PASSWORD",
      message: "Email or password is incorrect.",
    });
    expect(text).not.toContain("must-not-cross-the-web-boundary");
  });
});
