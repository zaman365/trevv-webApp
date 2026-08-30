import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Web readiness", () => {
  const webRelease = {
    releaseId: "release-2026.08.30.1",
    gitSha: "a".repeat(40),
    imageId: `sha256:${"b".repeat(64)}`,
  };
  const apiRelease = {
    ...webRelease,
    imageId: `sha256:${"c".repeat(64)}`,
  };
  const readyApi = {
    status: "ready",
    service: "trevv-api",
    version: "v1",
    mode: "live",
    registrationMode: "invite_only",
    database: "ready",
    release: apiRelease,
    time: "2026-08-30T12:00:00.000Z",
  };

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
      registrationMode: "not_applicable",
      api: "not_required",
      release: null,
      apiRelease: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires the private live API and its database to be ready", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DEMO_MODE", "false");
    vi.stubEnv("API_ORIGIN", "https://api.service.internal");
    vi.stubEnv("REGISTRATION_MODE", "invite_only");
    vi.stubEnv("RELEASE_ID", webRelease.releaseId);
    vi.stubEnv("RELEASE_GIT_SHA", webRelease.gitSha);
    vi.stubEnv("RELEASE_IMAGE_ID", webRelease.imageId);
    const fetchMock = vi.fn().mockResolvedValue(Response.json(readyApi));
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "ready",
      mode: "live",
      registrationMode: "invite_only",
      api: "ready",
      release: webRelease,
      apiRelease,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://api.service.internal/api/v1/readyz"),
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("fails closed when Web and API registration admission differ", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DEMO_MODE", "false");
    vi.stubEnv("REGISTRATION_MODE", "invite_only");
    vi.stubEnv("API_ORIGIN", "https://api.service.internal");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ ...readyApi, registrationMode: "public" }),
        ),
    );

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: "unavailable",
      registrationMode: "invite_only",
    });
  });

  it("fails closed when the API dependency is unavailable", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DEMO_MODE", "false");
    vi.stubEnv("API_ORIGIN", "https://api.service.internal");
    vi.stubEnv("REGISTRATION_MODE", "invite_only");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: "unavailable",
      api: "unavailable",
    });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("is not ready when production artifact identity is absent", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEMO_MODE", "false");
    vi.stubEnv("API_ORIGIN", "https://api.service.internal");
    vi.stubEnv("REGISTRATION_MODE", "invite_only");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: "unavailable",
      release: null,
      apiRelease: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
