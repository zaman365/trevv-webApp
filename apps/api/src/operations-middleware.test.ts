import { describe, expect, it } from "vitest";
import { createDemoAdapter } from "./demo-adapter";
import { createApiApp } from "./app";
import type { ApiLogger, ApiRateLimitStore } from "./operations";
import { createApiMetrics } from "./operations";

describe("API operations middleware", () => {
  it("propagates safe correlation IDs and records query-free request telemetry", async () => {
    const records: Array<Readonly<Record<string, unknown>>> = [];
    const logger: ApiLogger = { write: (record) => records.push(record) };
    const app = createApiApp({
      mode: "demo",
      ...createDemoAdapter(),
      idGenerator: () => "generated-request-1",
      operations: { logger },
    });

    const response = await app.request(
      "/api/v1/workspaces/workspace-northstar?secret=not-logged",
      { headers: { "x-request-id": "incoming-trace-123" } },
    );

    expect(response.headers.get("x-request-id")).toBe("incoming-trace-123");
    expect(records.at(-1)).toMatchObject({
      event: "request_completed",
      requestId: "incoming-trace-123",
      method: "GET",
      path: "/api/v1/workspaces/:resource",
      status: response.status,
    });
    expect(JSON.stringify(records)).not.toContain("not-logged");
  });

  it("returns stable rate-limit headers and never calls the data plane", async () => {
    let accessResolutionCount = 0;
    const store: ApiRateLimitStore = {
      scope: "shared",
      async consume() {
        return {
          allowed: false,
          limit: 10,
          remaining: 0,
          resetAt: new Date("2026-08-29T12:00:30.000Z"),
        };
      },
    };
    const demo = createDemoAdapter();
    const app = createApiApp({
      mode: "demo",
      ...demo,
      clock: () => new Date("2026-08-29T12:00:00.000Z"),
      accessResolver: {
        ...demo.accessResolver,
        async resolve(request, requestId) {
          accessResolutionCount += 1;
          return demo.accessResolver.resolve(request, requestId);
        },
      },
      operations: {
        rateLimitStore: store,
        trustedClientIpHeader: "x-trevv-client-ip",
      },
    });

    const response = await app.request("/api/v1/portfolios", {
      headers: { "x-trevv-client-ip": "192.0.2.10" },
    });

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("30");
    expect(response.headers.get("ratelimit-limit")).toBe("10");
    expect(response.headers.get("ratelimit-remaining")).toBe("0");
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "rate_limited", details: { retryAfterSeconds: 30 } },
    });
    expect(accessResolutionCount).toBe(0);
  });

  it("fails closed without exposing store failures", async () => {
    const app = createApiApp({
      mode: "demo",
      ...createDemoAdapter(),
      operations: {
        rateLimitStore: {
          scope: "shared",
          async consume() {
            throw new Error("redis://user:password@private.example.test");
          },
        },
      },
    });

    const response = await app.request("/api/v1/portfolios");
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private.example.test");
  });

  it("keeps liveness and Prometheus metrics content-free", async () => {
    const app = createApiApp({ mode: "demo", ...createDemoAdapter() });
    await app.request("/api/v1/portfolios");
    const liveness = await app.request("/internal/livez");
    expect(await liveness.json()).toEqual({
      status: "ok",
      service: "trevv-api",
    });
    const metrics = await app.request("/internal/metrics");
    const text = await metrics.text();
    expect(metrics.headers.get("content-type")).toContain("text/plain");
    expect(text).toContain("trevv_api_http_requests_total");
    expect(text).toContain("/api/v1/portfolios");
    expect(text).not.toContain('route="/internal/livez"');
    expect(text).not.toContain('route="/internal/metrics"');
    expect(text).not.toContain("Fictional");
  });

  it("bounds authentication bodies before invoking the auth provider", async () => {
    let invoked = false;
    const app = createApiApp({
      mode: "demo",
      ...createDemoAdapter(),
      authHandler: async () => {
        invoked = true;
        return Response.json({ ok: true });
      },
    });
    const response = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": String(65 * 1_024),
      },
      body: JSON.stringify({ value: "small body with a false large claim" }),
    });
    expect(response.status).toBe(413);
    expect(invoked).toBe(false);
  });

  it("never lets logging, metrics, or error-reporting failures replace a response", async () => {
    const demo = createDemoAdapter();
    const metrics = createApiMetrics();
    const app = createApiApp({
      mode: "demo",
      ...demo,
      dataPlane: {
        ...demo.dataPlane,
        async listPortfolios() {
          throw new Error("unexpected repository fault");
        },
      },
      operations: {
        logger: {
          write: () => {
            throw new Error("logger unavailable");
          },
        },
        metrics: {
          ...metrics,
          recordRequest: () => {
            throw new Error("metrics unavailable");
          },
          recordUnhandledError: () => {
            throw new Error("metrics unavailable");
          },
        },
        errorReporter: {
          capture: () => {
            throw new Error("reporter unavailable");
          },
        },
      },
    });

    const response = await app.request("/api/v1/portfolios");
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "internal_error" },
    });
  });
});
