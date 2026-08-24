import { describe, expect, it } from "vitest";
import { app } from "./app";

describe("FounderHQ API v1", () => {
  it("returns a live Portfolio roll-up", async () => {
    const response = await app.request("/api/v1/portfolio");
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      hubs: unknown[];
      signals: { decisions: number; blocked: number };
    };
    expect(body.hubs).toHaveLength(9);
    expect(body.signals.decisions).toBeGreaterThan(0);
    expect(body.signals.blocked).toBeGreaterThan(0);
  });
  it("uses a consistent error envelope", async () => {
    const response = await app.request("/api/v1/hubs/does-not-exist");
    expect(response.status).toBe(404);
    const body = (await response.json()) as {
      error: { code: string; requestId: string };
    };
    expect(body.error.code).toBe("resource_not_found");
    expect(body.error.requestId).toBeTruthy();
  });
  it("validates item mutations and respects idempotency", async () => {
    const input = {
      hubId: "hub-zehn",
      boardId: "b-zehn-launch",
      title: "Verify launch smoke test",
      type: "task",
      priority: "high",
      status: "working",
    };
    const first = await app.request("/api/v1/items", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "11111111-1111-4111-8111-111111111111",
      },
      body: JSON.stringify(input),
    });
    const second = await app.request("/api/v1/items", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "11111111-1111-4111-8111-111111111111",
      },
      body: JSON.stringify(input),
    });
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(((await first.json()) as { id: string }).id).toBe(
      ((await second.json()) as { id: string }).id,
    );
  });
});
