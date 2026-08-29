import { describe, expect, it, vi } from "vitest";
import { POST } from "./route";

describe("client error collection route", () => {
  it("accepts bounded metadata without reflecting application errors", async () => {
    const write = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const response = await POST(
      new Request("https://trevv.test/api/web/client-error", {
        method: "POST",
        headers: { "x-request-id": "request-trace-123" },
        body: JSON.stringify({
          surface: "app-route",
          errorName: "TypeError",
          digest: "render-digest-123",
          message: "private customer data",
          stack: "private source",
        }),
      }),
    );
    expect(response.status).toBe(204);
    const logged = String(write.mock.calls[0]?.[0] ?? "");
    expect(logged).toContain('"requestId":"request-trace-123"');
    expect(logged).toContain('"digest":"render-digest-123"');
    expect(logged).not.toContain("private customer data");
    expect(logged).not.toContain("private source");
    write.mockRestore();
  });

  it("rejects invalid report shapes", async () => {
    const response = await POST(
      new Request("https://trevv.test/api/web/client-error", {
        method: "POST",
        body: JSON.stringify({ surface: "unknown", errorName: "Error" }),
      }),
    );
    expect(response.status).toBe(400);
  });

  it("rejects an oversized body even when Content-Length is false-low", async () => {
    const response = await POST(
      new Request("https://trevv.test/api/web/client-error", {
        method: "POST",
        headers: { "content-length": "1" },
        body: "x".repeat(2_049),
      }),
    );
    expect(response.status).toBe(413);
  });
});
