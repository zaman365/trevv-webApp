import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Web readiness", () => {
  it("reports demo readiness without inventing a live API dependency", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DEMO_MODE", "true");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "ready",
      mode: "demo",
      api: "not_required",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires the private live API and its database to be ready", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DEMO_MODE", "false");
    vi.stubEnv("API_ORIGIN", "https://api.service.internal");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        Response.json({ status: "ready", mode: "live", database: "ready" }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "ready",
      mode: "live",
      api: "ready",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://api.service.internal/api/v1/readyz"),
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("fails closed when the API dependency is unavailable", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DEMO_MODE", "false");
    vi.stubEnv("API_ORIGIN", "https://api.service.internal");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: "unavailable",
      api: "unavailable",
    });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
});
