import { describe, expect, it } from "vitest";
import {
  acceptedRequestId,
  createJsonLogger,
  createApiMetrics,
  createMemoryRateLimitStore,
  createPostgresRateLimitStore,
  rateLimitPolicy,
  telemetryPath,
  trustedClientKey,
} from "./operations";

describe("API operational controls", () => {
  it("accepts bounded correlation IDs and replaces unsafe values", () => {
    expect(acceptedRequestId("trace-123456", () => "generated-safe")).toBe(
      "trace-123456",
    );
    expect(acceptedRequestId("line\nbreak", () => "generated-safe")).toBe(
      "generated-safe",
    );
    expect(acceptedRequestId("short", () => "generated-safe")).toBe(
      "generated-safe",
    );
  });

  it("uses only a configured, valid proxy header as a client key", () => {
    const headers = new Headers({
      "x-forwarded-for": "198.51.100.1, 10.0.0.2",
      "x-trevv-client-ip": "198.51.100.9",
    });
    expect(trustedClientKey(headers, undefined)).toBe("client:unresolved");
    expect(trustedClientKey(headers, "x-trevv-client-ip")).toBe(
      "ip:198.51.100.9",
    );
    expect(() => trustedClientKey(new Headers(), "x-trevv-client-ip")).toThrow(
      /missing or invalid/,
    );
    expect(() => trustedClientKey(headers, "forwarded")).toThrow(/X- header/);
  });

  it("assigns stricter authentication and mutation policies", () => {
    expect(rateLimitPolicy("POST", "/api/auth/sign-in/email")).toEqual({
      bucket: "auth-sensitive",
      limit: 10,
      windowMs: 900_000,
    });
    expect(rateLimitPolicy("PATCH", "/api/v1/items/item-1")).toMatchObject({
      bucket: "api-mutation",
      limit: 120,
    });
    expect(rateLimitPolicy("GET", "/api/v1/items")).toMatchObject({
      bucket: "api-read",
      limit: 600,
    });
    expect(rateLimitPolicy("GET", "/api/v1/readyz")).toBeNull();
  });

  it("enforces fixed windows without a process-global store", async () => {
    const store = createMemoryRateLimitStore();
    const now = new Date("2026-08-29T12:00:00.000Z");
    const input = {
      bucket: "test",
      key: "ip:192.0.2.1",
      limit: 2,
      windowMs: 1_000,
      now,
    };
    await expect(store.consume(input)).resolves.toMatchObject({
      allowed: true,
      remaining: 1,
    });
    await expect(store.consume(input)).resolves.toMatchObject({
      allowed: true,
      remaining: 0,
    });
    await expect(store.consume(input)).resolves.toMatchObject({
      allowed: false,
      remaining: 0,
    });
    await expect(
      store.consume({ ...input, now: new Date(now.getTime() + 1_000) }),
    ).resolves.toMatchObject({ allowed: true, remaining: 1 });
  });

  it("adapts shared PostgreSQL counts and periodically prunes expired windows", async () => {
    let count = 0;
    let pruned = 0;
    const store = createPostgresRateLimitStore({
      async consume(input) {
        count += 1;
        return {
          count,
          resetAt: new Date(input.now.getTime() + input.windowMs),
        };
      },
      async pruneExpired() {
        pruned += 1;
        return 0;
      },
    });
    const input = {
      bucket: "test",
      key: "ip:192.0.2.1",
      limit: 1,
      windowMs: 60_000,
      now: new Date("2026-08-29T12:00:00.000Z"),
    };
    await expect(store.consume(input)).resolves.toMatchObject({
      allowed: true,
      remaining: 0,
    });
    await expect(store.consume(input)).resolves.toMatchObject({
      allowed: false,
      remaining: 0,
    });
    expect(store.scope).toBe("shared");
    expect(pruned).toBe(1);
  });

  it("does not deny an already-counted request when best-effort cleanup fails", async () => {
    let cleanupErrors = 0;
    const store = createPostgresRateLimitStore(
      {
        async consume(input) {
          return {
            count: 1,
            resetAt: new Date(input.now.getTime() + input.windowMs),
          };
        },
        async pruneExpired() {
          throw new Error("cleanup unavailable");
        },
      },
      { onCleanupError: () => (cleanupErrors += 1) },
    );
    await expect(
      store.consume({
        bucket: "test",
        key: "ip:192.0.2.1",
        limit: 1,
        windowMs: 60_000,
        now: new Date("2026-08-29T12:00:00.000Z"),
      }),
    ).resolves.toMatchObject({ allowed: true });
    expect(cleanupErrors).toBe(1);
  });

  it("redacts sensitive structured fields before writing JSON", () => {
    const lines: string[] = [];
    const logger = createJsonLogger((line) => lines.push(line));
    logger.write({
      level: "error",
      requestId: "trace-123456",
      authorization: "Bearer credential",
      nested: { email: "person@example.test", safe: "kept" },
    });
    expect(JSON.parse(lines[0] ?? "{}")).toEqual({
      level: "error",
      requestId: "trace-123456",
      authorization: "[redacted]",
      nested: { email: "[redacted]", safe: "kept" },
    });
  });

  it("exports bounded low-cardinality Prometheus metrics", () => {
    const metrics = createApiMetrics();
    metrics.recordRequest({
      method: "GET",
      path: "/api/v1/workspaces/:resource",
      status: 503,
      durationMs: 120,
    });
    metrics.recordRateLimitRejection("auth-sensitive");
    metrics.recordRateLimitStoreError();
    metrics.recordUnhandledError();
    const rendered = metrics.render();
    expect(rendered).toContain(
      'trevv_api_http_requests_total{method="GET",route="/api/v1/workspaces/:resource",status_class="5xx"} 1',
    );
    expect(rendered).toContain('le="250"} 1');
    expect(rendered).toContain(
      'trevv_api_rate_limit_rejections_total{bucket="auth-sensitive"} 1',
    );
    expect(rendered).toContain("trevv_api_rate_limit_store_errors_total 1");
    expect(rendered).toContain("trevv_api_up 1");
  });

  it("collapses unknown routes and caps metric series defensively", () => {
    expect(telemetryPath("/api/v1/random-tenant-value/guessed-id")).toBe(
      "/api/v1/:unmatched",
    );
    expect(telemetryPath("/api/auth/random-operation/private-id")).toBe(
      "/api/auth/:operation",
    );
    const metrics = createApiMetrics();
    for (let index = 0; index < 2_000; index += 1)
      metrics.recordRequest({
        method: `ATTACKER-${index}`,
        path: `/attacker-controlled-${index}`,
        status: index,
        durationMs: 1,
      });
    const series = metrics
      .render()
      .split("\n")
      .filter((line) => line.startsWith("trevv_api_http_requests_total{"));
    expect(series.length).toBeLessThanOrEqual(513);
    expect(series.every((line) => line.includes('method="OTHER"'))).toBe(true);
    expect(
      series.some((line) =>
        line.includes('method="OTHER",route="/:overflow",status_class="other"'),
      ),
    ).toBe(true);
  });
});
