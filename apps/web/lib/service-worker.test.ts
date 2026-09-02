import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

import { describe, expect, it, vi } from "vitest";

const workerSource = readFileSync(
  new URL("../public/sw.js", import.meta.url),
  "utf8",
);

const ORIGIN = "https://trevv.test";
const STATIC_CACHE = "trevv-static-v6";
const OFFLINE_SHELL = `${ORIGIN}/__trevv-offline-shell__`;

type WorkerRequest = {
  cache?: RequestCache;
  destination?: RequestDestination;
  headers?: Headers;
  method?: string;
  mode?: RequestMode;
  url: string;
};

type WorkerEvent = {
  data?: { type: string };
  request?: WorkerRequest;
  respondWith?: (response: Promise<Response> | Response) => void;
  source?: { postMessage: ReturnType<typeof vi.fn> };
  waitUntil?: (work: Promise<unknown>) => void;
};

type WorkerListener = (event: WorkerEvent) => void;

function request(
  path: string,
  options: Omit<WorkerRequest, "url"> = {},
): WorkerRequest {
  return {
    cache: "default",
    destination: "",
    headers: new Headers(),
    method: "GET",
    mode: "cors",
    url: new URL(path, ORIGIN).toString(),
    ...options,
  };
}

function cacheKey(value: string | WorkerRequest | Request) {
  const raw = typeof value === "string" ? value : value.url;
  return new URL(raw, ORIGIN).toString();
}

class MemoryCache {
  readonly entries = new Map<string, Response>();

  async match(value: string | WorkerRequest | Request) {
    return this.entries.get(cacheKey(value))?.clone();
  }

  async put(value: string | WorkerRequest | Request, response: Response) {
    this.entries.set(cacheKey(value), response.clone());
  }
}

function createHarness() {
  const listeners = new Map<string, WorkerListener>();
  const stores = new Map<string, MemoryCache>();
  const deleted: string[] = [];
  const fetchMock = vi.fn<(input: WorkerRequest) => Promise<Response>>();

  const caches = {
    async delete(name: string) {
      deleted.push(name);
      return stores.delete(name);
    },
    async keys() {
      return [...stores.keys()];
    },
    async match(value: string | WorkerRequest | Request) {
      for (const cache of stores.values()) {
        const match = await cache.match(value);
        if (match) return match;
      }
      return undefined;
    },
    async open(name: string) {
      const existing = stores.get(name);
      if (existing) return existing;
      const cache = new MemoryCache();
      stores.set(name, cache);
      return cache;
    },
  };

  const self = {
    addEventListener(type: string, listener: WorkerListener) {
      listeners.set(type, listener);
    },
    clients: { claim: vi.fn(async () => undefined) },
    location: { origin: ORIGIN },
    skipWaiting: vi.fn(),
  };

  runInNewContext(workerSource, {
    Headers,
    Promise,
    Response,
    Set,
    URL,
    caches,
    fetch: fetchMock,
    self,
  });

  async function dispatchLifecycle(type: "activate" | "install") {
    let work: Promise<unknown> | undefined;
    listeners.get(type)?.({ waitUntil: (promise) => (work = promise) });
    await work;
  }

  async function dispatchFetch(workerRequest: WorkerRequest) {
    let response: Promise<Response> | undefined;
    listeners.get("fetch")?.({
      request: workerRequest,
      respondWith: (value) => (response = Promise.resolve(value)),
    });
    return response;
  }

  async function dispatchMessage(type: string) {
    let work: Promise<unknown> | undefined;
    const postMessage = vi.fn();
    listeners.get("message")?.({
      data: { type },
      source: { postMessage },
      waitUntil: (promise) => (work = promise),
    });
    await work;
    return postMessage;
  }

  return {
    caches,
    deleted,
    dispatchFetch,
    dispatchLifecycle,
    dispatchMessage,
    fetchMock,
    self,
    stores,
  };
}

describe("service worker cache safety", () => {
  it("installs only a content-free public offline shell", async () => {
    const harness = createHarness();

    await harness.dispatchLifecycle("install");

    expect([...harness.stores.keys()]).toEqual([STATIC_CACHE]);
    expect([
      ...(harness.stores.get(STATIC_CACHE)?.entries.keys() ?? []),
    ]).toEqual([OFFLINE_SHELL]);
    const shell = await harness.caches.match(OFFLINE_SHELL);
    await expect(shell?.text()).resolves.toContain(
      "does not store workspace data for offline access",
    );
    expect(harness.self.skipWaiting).toHaveBeenCalledOnce();
  });

  it.each([
    "/api/v1/portfolio",
    "/api/auth/session",
    "/app/portfolio",
    "/app/workspaces/centralops/messages",
    "/app/search",
    "/app/settings/export",
    "/auth/callback",
    "/sign-in",
  ])("does not intercept or cache private request %s", async (path) => {
    const harness = createHarness();
    await harness.dispatchLifecycle("install");

    const response = await harness.dispatchFetch(request(path));

    expect(response).toBeUndefined();
    expect(harness.fetchMock).not.toHaveBeenCalled();
    expect([
      ...(harness.stores.get(STATIC_CACHE)?.entries.keys() ?? []),
    ]).toEqual([OFFLINE_SHELL]);
  });

  it("never stores private documents and uses only the generic shell offline", async () => {
    const harness = createHarness();
    await harness.dispatchLifecycle("install");
    const appRequest = request("/app/portfolio", { mode: "navigate" });

    harness.fetchMock.mockResolvedValueOnce(
      new Response("<h1>Private portfolio for user A</h1>", {
        headers: { "Cache-Control": "public, immutable" },
      }),
    );
    const online = await harness.dispatchFetch(appRequest);
    await expect(online?.text()).resolves.toContain("user A");
    expect(await harness.caches.match(appRequest)).toBeUndefined();

    harness.fetchMock.mockRejectedValueOnce(new Error("offline"));
    const offline = await harness.dispatchFetch(appRequest);
    const offlineBody = await offline?.text();
    expect(offline?.status).toBe(503);
    expect(offlineBody).toContain("You are offline");
    expect(offlineBody).not.toContain("user A");
    expect(await harness.caches.match(appRequest)).toBeUndefined();
  });

  it("caches only same-origin Next.js assets marked public and immutable", async () => {
    const harness = createHarness();
    await harness.dispatchLifecycle("install");
    const assetRequest = request("/_next/static/chunks/app-a1b2c3.js", {
      destination: "script",
    });
    harness.fetchMock.mockResolvedValueOnce(
      new Response("console.log('safe')", {
        headers: {
          "Cache-Control": "public, max-age=31536000, immutable",
          "Content-Type": "text/javascript",
        },
      }),
    );

    const first = await harness.dispatchFetch(assetRequest);
    await expect(first?.text()).resolves.toContain("safe");
    expect(await harness.caches.match(assetRequest)).toBeDefined();

    const second = await harness.dispatchFetch(assetRequest);
    await expect(second?.text()).resolves.toContain("safe");
    expect(harness.fetchMock).toHaveBeenCalledOnce();
  });

  it("never reads a matching asset from a foreign origin cache", async () => {
    const harness = createHarness();
    const assetRequest = request("/_next/static/chunks/app-a1b2c3.js", {
      destination: "script",
    });
    const foreign = await harness.caches.open("foreign-storefront-cache");
    await foreign.put(assetRequest, new Response("foreign storefront asset"));
    await harness.dispatchLifecycle("install");
    harness.fetchMock.mockResolvedValueOnce(
      new Response("console.log('trevv')", {
        headers: {
          "Cache-Control": "public, max-age=31536000, immutable",
          "Content-Type": "text/javascript",
        },
      }),
    );

    const response = await harness.dispatchFetch(assetRequest);

    await expect(response?.text()).resolves.toContain("trevv");
    expect(harness.fetchMock).toHaveBeenCalledOnce();
  });

  it.each([
    ["no-store response", {}, "public, immutable, no-store"],
    ["private response", {}, "private, immutable"],
    ["non-immutable response", {}, "public, max-age=3600"],
    [
      "no-store request",
      { cache: "no-store" as RequestCache },
      "public, immutable",
    ],
  ])("does not cache a %s", async (_name, options, cacheControl) => {
    const harness = createHarness();
    await harness.dispatchLifecycle("install");
    const assetRequest = request("/_next/static/chunks/safety-a1b2c3.js", {
      destination: "script",
      ...options,
    });
    harness.fetchMock.mockResolvedValueOnce(
      new Response("asset", {
        headers: { "Cache-Control": cacheControl },
      }),
    );

    await harness.dispatchFetch(assetRequest);

    expect(await harness.caches.match(assetRequest)).toBeUndefined();
  });

  it("removes every legacy or foreign cache on activation", async () => {
    const harness = createHarness();
    const legacy = await harness.caches.open("trevv-v4");
    await legacy.put(
      request("/api/v1/portfolio"),
      new Response('{"owner":"user-a"}'),
    );
    const foreign = await harness.caches.open("foreign-storefront-cache");
    await foreign.put(
      request("/sign-in", { mode: "navigate" }),
      new Response("Foreign storefront document"),
    );

    await harness.dispatchLifecycle("activate");

    expect(harness.deleted).toContain("trevv-v4");
    expect(harness.deleted).toContain("foreign-storefront-cache");
    expect(harness.stores.has("trevv-v4")).toBe(false);
    expect(harness.stores.has("foreign-storefront-cache")).toBe(false);
    expect(await harness.caches.match("/api/v1/portfolio")).toBeUndefined();
    expect(await harness.caches.match("/sign-in")).toBeUndefined();
    expect(harness.self.clients.claim).toHaveBeenCalledOnce();
  });

  it.each(["TREVV_LOGOUT", "TREVV_SESSION_ENDED", "TREVV_PURGE_OFFLINE_DATA"])(
    "purges every managed cache for %s and restores only the offline shell",
    async (messageType) => {
      const harness = createHarness();
      const legacy = await harness.caches.open("trevv-v4");
      await legacy.put(
        request("/app/portfolio"),
        new Response("Private user A document"),
      );
      const current = await harness.caches.open(STATIC_CACHE);
      await current.put(
        request("/_next/static/chunks/old-a1b2c3.js"),
        new Response("old asset"),
      );

      const postMessage = await harness.dispatchMessage(messageType);

      expect(await harness.caches.match("/app/portfolio")).toBeUndefined();
      expect([
        ...(harness.stores.get(STATIC_CACHE)?.entries.keys() ?? []),
      ]).toEqual([OFFLINE_SHELL]);
      expect(postMessage).toHaveBeenCalledWith({
        type: "TREVV_OFFLINE_DATA_PURGED",
        reason: messageType,
      });
    },
  );
});
