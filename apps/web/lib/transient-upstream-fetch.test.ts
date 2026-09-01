import { describe, expect, it, vi } from "vitest";
import { fetchWithTransientUpstreamRetry } from "./transient-upstream-fetch";

const noDelay = vi.fn(async () => undefined);

describe("transient upstream fetch", () => {
  it("recovers a safe read after transient gateway responses", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 502 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ ok: true }));

    const response = await fetchWithTransientUpstreamRetry(
      "https://api.example.test/api/v1/session",
      {},
      {
        fetchImpl,
        retryDelaysMs: [1, 2],
        sleep: noDelay,
      },
    );

    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(noDelay).toHaveBeenCalledTimes(2);
  });

  it("returns the last transient response when the retry budget is exhausted", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 502 }))
      .mockResolvedValueOnce(new Response(null, { status: 504 }));

    const response = await fetchWithTransientUpstreamRetry(
      "https://api.example.test/api/v1/session",
      {},
      {
        fetchImpl,
        retryDelaysMs: [1],
        sleep: noDelay,
      },
    );

    expect(response.status).toBe(504);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("retries a failed safe read without replaying mutations", async () => {
    const networkFailure = new TypeError("fetch failed");
    const getFetch = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(networkFailure)
      .mockResolvedValueOnce(Response.json({ ok: true }));

    await expect(
      fetchWithTransientUpstreamRetry(
        "https://api.example.test/api/v1/session",
        {},
        {
          fetchImpl: getFetch,
          retryDelaysMs: [1],
          sleep: noDelay,
        },
      ),
    ).resolves.toMatchObject({ status: 200 });
    expect(getFetch).toHaveBeenCalledTimes(2);

    const postFetch = vi.fn<typeof fetch>().mockRejectedValue(networkFailure);
    await expect(
      fetchWithTransientUpstreamRetry(
        "https://api.example.test/api/v1/tasks",
        { method: "POST", body: "{}" },
        {
          fetchImpl: postFetch,
          retryDelaysMs: [1],
          sleep: noDelay,
        },
      ),
    ).rejects.toBe(networkFailure);
    expect(postFetch).toHaveBeenCalledTimes(1);
  });

  it("does not retry ordinary application responses", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 401 }));

    const response = await fetchWithTransientUpstreamRetry(
      "https://api.example.test/api/v1/session",
      {},
      {
        fetchImpl,
        retryDelaysMs: [1],
        sleep: noDelay,
      },
    );

    expect(response.status).toBe(401);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("stops before issuing a request when its signal is aborted", async () => {
    const controller = new AbortController();
    controller.abort(new DOMException("Stopped", "AbortError"));
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(
      fetchWithTransientUpstreamRetry(
        "https://api.example.test/api/v1/session",
        { signal: controller.signal },
        { fetchImpl, retryDelaysMs: [1], sleep: noDelay },
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not replay a mutation that receives a gateway response", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 502 }));

    const response = await fetchWithTransientUpstreamRetry(
      "https://api.example.test/api/v1/tasks",
      { method: "POST", body: "{}" },
      { fetchImpl, retryDelaysMs: [1], sleep: noDelay },
    );

    expect(response.status).toBe(502);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
