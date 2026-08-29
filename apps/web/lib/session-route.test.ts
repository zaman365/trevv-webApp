import { describe, expect, it } from "vitest";
import {
  hasSameOrigin,
  redactSessions,
  sessionTokenForId,
} from "./session-route";

const sessions = [
  {
    id: "session-current",
    token: "secret-current-token",
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-02T10:00:00.000Z",
    expiresAt: "2026-09-01T10:00:00.000Z",
    ipAddress: "192.0.2.10",
    userAgent: "Test Browser",
  },
  {
    id: "session-other",
    token: "secret-other-token",
    createdAt: "2026-08-03T10:00:00.000Z",
    updatedAt: "2026-08-04T10:00:00.000Z",
    expiresAt: "2026-09-03T10:00:00.000Z",
  },
];

describe("session route boundary", () => {
  it("redacts bearer tokens and identifies only the current session", () => {
    const redacted = redactSessions(sessions, "session-current");
    expect(redacted?.[0]).toMatchObject({
      id: "session-current",
      current: true,
      ipAddress: "192.0.2.10",
    });
    expect(JSON.stringify(redacted)).not.toContain("secret-");
    expect(redacted?.[1]?.current).toBe(false);
  });

  it("resolves a server-side revocation token without exposing it in the view", () => {
    expect(sessionTokenForId(sessions, "session-other")).toBe(
      "secret-other-token",
    );
    expect(sessionTokenForId(sessions, "missing")).toBeNull();
    expect(redactSessions([{ id: "bad" }], null)).toBeNull();
  });

  it("requires an exact Origin or a browser-controlled same-origin signal", () => {
    expect(
      hasSameOrigin(
        new Request("https://trevv.test/api/web/sessions/revoke-all", {
          headers: { origin: "https://trevv.test" },
        }),
        "https://trevv.test",
      ),
    ).toBe(true);
    expect(
      hasSameOrigin(
        new Request("https://trevv.test/api/web/sessions/revoke-all", {
          headers: { origin: "https://attacker.test" },
        }),
        "https://trevv.test",
      ),
    ).toBe(false);
    expect(
      hasSameOrigin(
        new Request("https://trevv.test/api/web/sessions/revoke-all"),
        "https://trevv.test",
      ),
    ).toBe(false);
    expect(
      hasSameOrigin(
        new Request("https://trevv.test/api/web/sessions/revoke-all", {
          headers: { "sec-fetch-site": "same-origin" },
        }),
        "https://trevv.test",
      ),
    ).toBe(true);
    expect(
      hasSameOrigin(
        new Request("https://trevv.test/api/web/sessions/revoke-all", {
          headers: {
            origin: "https://attacker.test",
            "sec-fetch-site": "same-origin",
          },
        }),
        "https://trevv.test",
      ),
    ).toBe(false);
  });
});
