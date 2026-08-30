import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

describe("Web Vitals collection route", () => {
  beforeEach(() => {
    vi.stubEnv("WEB_VITALS_INGEST_ENABLED", "true");
  });

  it("fails closed when ingestion is not explicitly enabled", async () => {
    vi.stubEnv("WEB_VITALS_INGEST_ENABLED", "false");
    const response = await POST(
      new Request("https://trevv.test/api/web/vitals", { method: "POST" }),
    );
    expect(response.status).toBe(404);
  });

  it("logs only a normalized, content-free metric", async () => {
    const write = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const response = await POST(
      new Request("https://trevv.test/api/web/vitals", {
        method: "POST",
        headers: { "x-request-id": "request-trace-123" },
        body: JSON.stringify({
          name: "INP",
          value: 180,
          delta: 45,
          rating: "good",
          navigationType: "navigate",
          surface: "/app/workspaces/:workspace/:view",
          id: "browser-tracking-id",
          title: "private customer content",
        }),
      }),
    );
    expect(response.status).toBe(204);
    const logged = String(write.mock.calls[0]?.[0] ?? "");
    expect(logged).toContain('"event":"web_vital_observed"');
    expect(logged).toContain('"surface":"/app/workspaces/:workspace/:view"');
    expect(logged).not.toContain("browser-tracking-id");
    expect(logged).not.toContain("private customer content");
    write.mockRestore();
  });

  it("rejects raw resource paths and false-low oversized bodies", async () => {
    const invalid = await POST(
      new Request("https://trevv.test/api/web/vitals", {
        method: "POST",
        body: JSON.stringify({
          name: "LCP",
          value: 1,
          delta: 1,
          rating: "good",
          navigationType: "navigate",
          surface: "/app/workspaces/private-client/messages",
        }),
      }),
    );
    expect(invalid.status).toBe(400);

    const oversized = await POST(
      new Request("https://trevv.test/api/web/vitals", {
        method: "POST",
        headers: { "content-length": "1" },
        body: "x".repeat(1_025),
      }),
    );
    expect(oversized.status).toBe(413);
  });
});
