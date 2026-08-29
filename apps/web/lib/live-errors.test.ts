import { describe, expect, it } from "vitest";
import { TrevvApiError } from "@founderhq/api-client";
import { presentLiveError } from "./live-errors";

describe("presentLiveError", () => {
  it.each([
    [401, "permission-loss"],
    [403, "permission-loss"],
    [404, "permission-loss"],
    [409, "version-conflict"],
    [422, "validation"],
    [429, "rate-limit"],
    [500, "terminal-error"],
  ] as const)("maps HTTP %s to %s", (status, kind) => {
    expect(
      presentLiveError(
        new TrevvApiError(
          "test_error",
          "The request failed.",
          "request-test",
          status,
        ),
      ),
    ).toMatchObject({ kind, requestId: "request-test" });
  });

  it("treats network failures as unconfirmed offline work", () => {
    expect(presentLiveError(new TypeError("Failed to fetch"))).toMatchObject({
      kind: "offline",
      description: expect.stringContaining("no business change"),
    });
  });
});
