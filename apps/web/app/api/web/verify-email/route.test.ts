import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  serverAuthFetch: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/lib/server-auth", () => ({
  serverAuthFetch: mocks.serverAuthFetch,
}));

import { POST } from "./route";

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://trevv.test");
  mocks.cookies.mockReset();
  mocks.serverAuthFetch.mockReset();
  mocks.cookies.mockResolvedValue({
    get: vi.fn().mockReturnValue({ value: "one-time-verification-token" }),
  });
});

afterEach(() => vi.unstubAllEnvs());

describe("Web email verification", () => {
  it.each([429, 503])(
    "preserves the one-time token for retryable upstream HTTP %s",
    async (status) => {
      mocks.serverAuthFetch.mockResolvedValue(
        Response.json(
          { code: "temporarily_unavailable" },
          {
            status,
            headers: {
              "retry-after": "17",
              "x-request-id": "verification-request-1",
            },
          },
        ),
      );

      const response = await POST(sameOriginRequest());

      expect(response.status).toBe(status === 429 ? 429 : 502);
      expect(response.headers.get("set-cookie")).toBeNull();
      expect(response.headers.get("retry-after")).toBe("17");
      expect(response.headers.get("x-request-id")).toBe(
        "verification-request-1",
      );
      await expect(response.json()).resolves.toMatchObject({
        error: expect.stringMatching(/try verification again/iu),
      });
    },
  );

  it("clears a definitively invalid one-time token", async () => {
    mocks.serverAuthFetch.mockResolvedValue(
      Response.json({ code: "INVALID_TOKEN" }, { status: 400 }),
    );

    const response = await POST(sameOriginRequest());

    expect(response.status).toBe(400);
    expect(response.headers.get("set-cookie")).toContain(
      "trevv.pending_email_verification=",
    );
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("briefly remembers a successful verification so an interrupted redirect can resume", async () => {
    mocks.serverAuthFetch.mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "https://trevv.test/onboarding" },
      }),
    );

    const response = await POST(sameOriginRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain(
      "trevv.completed_email_verification=confirmed",
    );
    expect(response.headers.get("set-cookie")).toContain("Max-Age=60");
  });

  it("accepts only the scoped completion marker when the one-time token was already consumed", async () => {
    mocks.cookies.mockResolvedValue({
      get: vi.fn((name: string) =>
        name === "trevv.completed_email_verification"
          ? { value: "confirmed" }
          : undefined,
      ),
    });

    const response = await POST(sameOriginRequest());

    expect(response.status).toBe(200);
    expect(mocks.serverAuthFetch).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({ success: true });
  });
});

function sameOriginRequest() {
  return new Request("https://trevv.test/api/web/verify-email", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://trevv.test",
    },
    body: JSON.stringify({ returnTo: "/onboarding" }),
  });
}
