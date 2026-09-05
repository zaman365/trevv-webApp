import { describe, expect, it, vi } from "vitest";
import { fetchWithTransientUpstreamRetry } from "./transient-upstream-fetch";

const noDelay = vi.fn(async () => undefined);

describe("transient upstream fetch", () => {
  it("honors cancellation supplied on the Request object", async () => {
    const controller = new AbortController();
    const input = new Request("https://api.example.test/session", {
      signal: controller.signal,
    });
    controller.abort();
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(
      fetchWithTransientUpstreamRetry(input, {}, { fetchImpl }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not wait for a retained response branch to cancel before retrying", async () => {
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(new ReadableStream({ cancel }), { status: 503 }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const response = await fetchWithTransientUpstreamRetry(
      "https://api.example.test/session",
      {},
      { fetchImpl, retryDelaysMs: [1], sleep: async () => {} },
    );
    expect(response.status).toBe(200);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("bypasses a renderer's cached gateway error when retrying a safe read", async () => {
    let upstreamCalls = 0;
    let memoized: Response | undefined;
    const fetchImpl: typeof fetch = async (_input, init) => {
      if (!init?.signal && memoized) return memoized.clone();
      upstreamCalls++;
      const response = new Response(null, {
        status: upstreamCalls === 1 ? 503 : 200,
      });
      if (!init?.signal) memoized = response.clone();
      return response;
    };
    const response = await fetchWithTransientUpstreamRetry(
      "https://api.example.test/session",
      { cache: "no-store" },
      { fetchImpl, retryDelaysMs: [1, 2], sleep: async () => {} },
    );
    expect(response.status).toBe(200);
    expect(upstreamCalls).toBe(2);
  });

  it("preserves the caller's cancellation signal through a retry", async () => {
    const controller = new AbortController();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    await fetchWithTransientUpstreamRetry(
      "https://api.example.test/session",
      { signal: controller.signal },
      { fetchImpl, retryDelaysMs: [1], sleep: async () => {} },
    );
    expect(fetchImpl.mock.calls[1]?.[1]?.signal).toBe(controller.signal);
  });

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
