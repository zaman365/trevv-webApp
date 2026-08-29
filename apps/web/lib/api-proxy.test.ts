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
    const upstreamHeaders = new Headers(
      (upstream.mock.calls[0]?.[1] as RequestInit | undefined)?.headers,
    );
    expect(upstreamHeaders.get("x-request-id")).toMatch(
      /^[a-z0-9][a-z0-9._:-]{7,127}$/iu,
    );
    expect(response.headers.get("x-request-id")).toBe(
      upstreamHeaders.get("x-request-id"),
    );
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

  it.each([
    ["declared", String(128 * 1_024 + 1), "{}"],
    ["false-low", "1", "x".repeat(128 * 1_024 + 1)],
    ["undeclared", undefined, "x".repeat(128 * 1_024 + 1)],
  ])(
    "rejects %s oversized bodies before the upstream fetch",
    async (_, length, body) => {
      const upstream = vi.fn();
      vi.stubGlobal("fetch", upstream);
      const headers = new Headers({
        "content-type": "application/json",
        "x-request-id": "request-body-limit-123",
      });
      if (length) headers.set("content-length", length);

      const response = await proxyApiRequest(
        new Request("https://trevv.test/api/v1/items", {
          method: "POST",
          headers,
          body,
        }),
        ["v1", "items"],
      );

      expect(response.status).toBe(413);
      expect(response.headers.get("x-request-id")).toBe(
        "request-body-limit-123",
      );
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "payload_too_large" },
      });
      expect(upstream).not.toHaveBeenCalled();
    },
  );

  it("streams server events and aborts the upstream request when the browser disconnects", async () => {
    vi.stubEnv("API_ORIGIN", "https://api.trevv.test");
    const encoder = new TextEncoder();
    let upstreamSignal: AbortSignal | null | undefined;
    const upstream = vi
      .fn()
      .mockImplementation(async (_url: URL, init: RequestInit) => {
        upstreamSignal = init.signal;
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(
                encoder.encode('event: ready\ndata: {"cursor":1}\n\n'),
              );
              controller.enqueue(
                encoder.encode('event: message.sent\ndata: {"cursor":2}\n\n'),
              );
            },
          }),
          {
            headers: {
              "cache-control": "no-cache",
              "content-type": "text/event-stream; charset=utf-8",
            },
          },
        );
      });
    vi.stubGlobal("fetch", upstream);
    const browserAbort = new AbortController();

    const response = await proxyApiRequest(
      new Request("https://trevv.test/api/v1/events?workspaceId=workspace-a", {
        signal: browserAbort.signal,
      }),
      ["v1", "events"],
    );
    const reader = response.body!.getReader();
    const first = await reader.read();
    const second = await reader.read();

    expect(new TextDecoder().decode(first.value)).toContain('cursor":1');
    expect(new TextDecoder().decode(second.value)).toContain('cursor":2');
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(upstreamSignal).toBeDefined();
    expect(upstreamSignal?.aborted).toBe(false);

    browserAbort.abort();
    expect(upstreamSignal?.aborted).toBe(true);
    await reader.cancel();
  });
});
