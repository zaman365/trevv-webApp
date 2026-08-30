import { describe, expect, it } from "vitest";
import { createWebVitalsRateLimiter } from "./web-vitals-rate-limit";

describe("Web Vitals per-instance rate limiter", () => {
  it("limits a client, reports retry timing, and reopens the next window", () => {
    const limiter = createWebVitalsRateLimiter({ limit: 2, windowMs: 1_000 });
    expect(limiter.consume("client", 1_000).allowed).toBe(true);
    expect(limiter.consume("client", 1_100).allowed).toBe(true);
    expect(limiter.consume("client", 1_200)).toEqual({
      allowed: false,
      retryAfterSeconds: 1,
    });
    expect(limiter.consume("client", 2_000).allowed).toBe(true);
  });

  it("bounds tracked client state", () => {
    const limiter = createWebVitalsRateLimiter({ maximumClients: 2 });
    expect(limiter.consume("one", 1).allowed).toBe(true);
    expect(limiter.consume("two", 1).allowed).toBe(true);
    expect(limiter.consume("three", 1).allowed).toBe(true);
  });
});
