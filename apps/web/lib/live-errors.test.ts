import { describe, expect, it } from "vitest";
import { TrevvApiError } from "@founderhq/api-client";
import { presentLiveError, presentLiveReadError } from "./live-errors";

describe("background read errors", () => {
  it("does not report a previously saved change as failed when a refresh fails", () => {
    const error = new TrevvApiError(
      "unavailable",
      "Unavailable",
      "request-one",
      503,
    );
    expect(presentLiveReadError(error)).toMatchObject({
      title: "Unable to refresh current data",
      description:
        "Your last loaded records and drafts are kept. Retry to check for updates.",
      requestId: "request-one",
    });
  });
  it("still exposes permission loss immediately", () => {
    expect(
      presentLiveReadError(
        new TrevvApiError("forbidden", "Access changed", "request-one", 403),
      ).kind,
    ).toBe("permission-loss");
  });
});

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
      description: expect.stringContaining("save could not be confirmed"),
    });
  });

  it("explains an incomplete save receipt without claiming the task was lost", () => {
    expect(
      presentLiveError(
        new TrevvApiError(
          "invalid_save_confirmation",
          "The change may already be saved. Retry the same save.",
          "trace-save",
          201,
        ),
      ),
    ).toMatchObject({
      kind: "terminal-error",
      title: "The save confirmation could not be read",
      description: expect.stringContaining("may already be saved"),
      requestId: "trace-save",
    });
  });
});
