import { describe, expect, it } from "vitest";
import { app } from "./app";

describe("TREVV API v1", () => {
  it("returns a live Portfolio roll-up", async () => {
    const response = await app.request("/api/v1/portfolio");
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      hubs: unknown[];
      signals: { decisions: number; blocked: number };
    };
    expect(body.hubs).toHaveLength(8);
    expect(body.signals.decisions).toBeGreaterThan(0);
    expect(body.signals.blocked).toBeGreaterThan(0);
  });
  it("scopes Portfolio roll-ups without mixing original and current Hubs", async () => {
    const response = await app.request(
      "/api/v1/portfolio?portfolioId=portfolio-original",
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      portfolio: { id: string };
      hubs: Array<{ hub: { name: string } }>;
    };
    expect(body.portfolio.id).toBe("portfolio-original");
    expect(body.hubs).toHaveLength(8);
    expect(body.hubs.map(({ hub }) => hub.name)).toContain("ZEHN");
    expect(body.hubs.map(({ hub }) => hub.name)).not.toContain(
      "Northstar Apparel",
    );
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
      hubId: "hub-northstar",
      boardId: "b-northstar-launch",
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
  it("supports explainable Attention actions with noise controls", async () => {
    const list = await app.request(
      "/api/v1/attention?portfolioId=portfolio-demo",
    );
    expect(list.status).toBe(200);
    const signals = (await list.json()) as Array<{
      id: string;
      reason: string;
    }>;
    expect(signals.length).toBeGreaterThan(0);
    expect(signals[0]?.reason).toBeTruthy();

    const invalid = await app.request(`/api/v1/attention/${signals[0]?.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "dismiss" }),
    });
    expect(invalid.status).toBe(422);

    const resolved = await app.request(`/api/v1/attention/${signals[0]?.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "resolve" }),
    });
    expect(resolved.status).toBe(200);
  });

  it("separates Waiting follow-ups and commercial entitlements", async () => {
    const waiting = await app.request("/api/v1/waiting");
    expect(waiting.status).toBe(200);
    expect(((await waiting.json()) as unknown[]).length).toBeGreaterThan(0);

    const entitlements = await app.request("/api/v1/entitlements");
    expect(entitlements.status).toBe(200);
    const body = (await entitlements.json()) as {
      planKey: string;
      values: Record<string, unknown>;
    };
    expect(body.planKey).toBe("development-unrestricted");
    expect(body.values).toHaveProperty("portfolios.max");
  });

  it("exports the complete portable organization shape", async () => {
    const response = await app.request("/api/v1/export/organization.json");
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    for (const key of [
      "portfolios",
      "hubs",
      "boards",
      "items",
      "decisions",
      "updates",
      "ideas",
      "insights",
      "milestones",
      "commentMetadata",
      "smartLinks",
    ])
      expect(body).toHaveProperty(key);
  });
});
