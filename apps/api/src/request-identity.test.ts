import { describe, expect, it, vi } from "vitest";
import { requestLocalIdentityResolver } from "./request-identity.js";

describe("request-local identity resolution", () => {
  it("shares concurrent and sequential reads of one request but rechecks later requests", async () => {
    const identity = {
      authUserId: "user",
      email: "user@example.test",
      name: "User",
      emailVerified: true,
      sessionId: "session",
      expiresAt: new Date(),
    };
    const resolve = vi
      .fn()
      .mockResolvedValueOnce(identity)
      .mockResolvedValueOnce(null);
    const resolver = requestLocalIdentityResolver({ resolve });
    const request = new Request("https://api.example.test/api/v1/session");
    expect(
      await Promise.all([resolver.resolve(request), resolver.resolve(request)]),
    ).toEqual([identity, identity]);
    expect(await resolver.resolve(request)).toBe(identity);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(await resolver.resolve(new Request(request))).toBeNull();
    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it("preserves resolver failures for this request without leaking them into later requests", async () => {
    const failure = new Error("Identity store unavailable");
    const resolve = vi
      .fn()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce(null);
    const resolver = requestLocalIdentityResolver({ resolve });
    const request = new Request("https://api.example.test/api/v1/session");
    await expect(resolver.resolve(request)).rejects.toBe(failure);
    await expect(resolver.resolve(request)).rejects.toBe(failure);
    expect(resolve).toHaveBeenCalledTimes(1);
    await expect(resolver.resolve(new Request(request))).resolves.toBeNull();
  });
});
