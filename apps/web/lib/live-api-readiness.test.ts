import { afterEach, describe, expect, it, vi } from "vitest";
import {
  waitForLiveApiReadiness,
  warmLiveApiReadiness,
} from "./live-api-readiness";

afterEach(() => vi.unstubAllGlobals());

describe("live API readiness preflight", () => {
  it("accepts only dependency-aware live API readiness", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      Response.json({
        status: "ready",
        service: "trevv-web",
        mode: "live",
        api: "ready",
      }),
    );
    const wait = vi.fn();

    await expect(waitForLiveApiReadiness({ fetchImpl, wait })).resolves.toBe(
      true,
    );
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/web/readyz",
      expect.objectContaining({
        cache: "no-store",
        credentials: "omit",
        signal: expect.any(AbortSignal),
      }),
    );
    expect(wait).not.toHaveBeenCalled();
  });

  it("retries safely but never waits forever", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          { status: "unavailable", mode: "live", api: "unavailable" },
          { status: 503 },
        ),
      )
      .mockRejectedValueOnce(new Error("cold start"))
      .mockResolvedValueOnce(
        Response.json({ status: "ready", mode: "demo", api: "not_required" }),
      );
    const wait = vi.fn().mockResolvedValue(undefined);

    await expect(
      waitForLiveApiReadiness({
        attempts: 3,
        fetchImpl,
        pollDelayMs: 25,
        wait,
      }),
    ).resolves.toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenNthCalledWith(1, 25);
    expect(wait).toHaveBeenNthCalledWith(2, 25);
  });

  it("rejects retry settings that could make the preflight unbounded", async () => {
    await expect(waitForLiveApiReadiness({ attempts: 61 })).rejects.toThrow(
      /between 1 and 60/u,
    );
    await expect(
      waitForLiveApiReadiness({ requestTimeoutMs: 10_001 }),
    ).rejects.toThrow(/between 1 and 10000/u);
  });

  it("shares one in-flight readiness fetch across simultaneous callers", async () => {
    let resolveFetch!: (response: Response) => void;
    const fetchImpl = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchImpl);

    const first = warmLiveApiReadiness();
    const second = warmLiveApiReadiness();

    expect(second).toBe(first);
    expect(fetchImpl).toHaveBeenCalledOnce();

    resolveFetch(liveReadyResponse());
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
  });

  it("starts a new readiness fetch after the shared request settles", async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementation(async () => liveReadyResponse());
    vi.stubGlobal("fetch", fetchImpl);

    const first = warmLiveApiReadiness();
    await expect(first).resolves.toBe(true);
    const second = warmLiveApiReadiness();

    expect(second).not.toBe(first);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await expect(second).resolves.toBe(true);
  });
});

function liveReadyResponse() {
  return Response.json({
    status: "ready",
    service: "trevv-web",
    mode: "live",
    api: "ready",
  });
}
