import { afterEach, describe, expect, it, vi } from "vitest";
import { reportClientError } from "./client-error-reporting";

afterEach(() => vi.unstubAllGlobals());

describe("client error reporting", () => {
  it("reports only a bounded digest and never the message or stack", async () => {
    const request = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", request);
    const error = new Error("Customer private message");
    error.stack = "private source and data";
    Object.assign(error, { digest: "render-digest-123" });

    reportClientError("app-route", error);
    await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
    const init = request.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({
      surface: "app-route",
      errorName: "Error",
      digest: "render-digest-123",
    });
    expect(String(init.body)).not.toContain("Customer private message");
    expect(String(init.body)).not.toContain("private source");
  });
});
