import { describe, expect, it, vi } from "vitest";
import { POST } from "./route";

describe("CSP report route", () => {
  it("logs only sanitized CSP metadata", async () => {
    const write = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const response = await POST(
      new Request("https://trevv.test/api/web/csp-report", {
        method: "POST",
        headers: { "x-request-id": "request-csp-report-123" },
        body: JSON.stringify({
          "csp-report": {
            "effective-directive": "connect-src",
            "document-uri": "https://trevv.test/app/private?token=secret",
            "blocked-uri": "https://tracker.test/collect?email=private",
            sample: "sensitive inline text",
          },
        }),
      }),
    );
    expect(response.status).toBe(204);
    const logged = String(write.mock.calls[0]?.[0] ?? "");
    expect(logged).toContain('"effectiveDirective":"connect-src"');
    expect(logged).toContain('"requestId":"request-csp-report-123"');
    expect(logged).toContain('"blockedOrigin":"https://tracker.test"');
    expect(logged).not.toContain("token=secret");
    expect(logged).not.toContain("sensitive inline text");
    write.mockRestore();
  });

  it("rejects invalid and oversized reports", async () => {
    expect(
      (
        await POST(
          new Request("https://trevv.test/api/web/csp-report", {
            method: "POST",
            body: "not-json",
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await POST(
          new Request("https://trevv.test/api/web/csp-report", {
            method: "POST",
            headers: { "content-length": String(16 * 1_024 + 1) },
            body: "{}",
          }),
        )
      ).status,
    ).toBe(413);
    expect(
      (
        await POST(
          new Request("https://trevv.test/api/web/csp-report", {
            method: "POST",
            headers: { "content-length": "1" },
            body: "x".repeat(16 * 1_024 + 1),
          }),
        )
      ).status,
    ).toBe(413);
  });
});
