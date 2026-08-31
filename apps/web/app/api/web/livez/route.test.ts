import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Web liveness", () => {
  it("reports only process-local liveness without contacting dependencies", async () => {
    const fetchMock = vi.fn(() => {
      throw new Error("Web liveness must not contact a dependency.");
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "ok",
      service: "trevv-web",
    });
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
