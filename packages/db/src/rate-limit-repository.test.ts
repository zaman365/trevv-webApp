import { describe, expect, it } from "vitest";
import { hashClientKey } from "./rate-limit-repository";

describe("rate-limit repository input safety", () => {
  it("creates deterministic one-way client identifiers", () => {
    const secret = "test-rate-limit-key-material-000001";
    expect(hashClientKey("ip:192.0.2.1", secret)).toMatch(/^[0-9a-f]{64}$/u);
    expect(hashClientKey("ip:192.0.2.1", secret)).toBe(
      hashClientKey("ip:192.0.2.1", secret),
    );
    expect(hashClientKey("ip:192.0.2.1", secret)).not.toBe(
      hashClientKey("ip:192.0.2.2", secret),
    );
    expect(hashClientKey("ip:192.0.2.1", secret)).not.toBe(
      hashClientKey("ip:192.0.2.1", "second-rate-limit-key-material-002"),
    );
    expect(() => hashClientKey("", secret)).toThrow(/1-512/);
    expect(() => hashClientKey("ip:192.0.2.1", "short")).toThrow(/32/);
  });
});
