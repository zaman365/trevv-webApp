const CACHE_PREFIX = "trevv-";
const STATIC_CACHE = "trevv-static-v5";
const OFFLINE_SHELL_URL = new URL(
  "/__trevv-offline-shell__",
  self.location.origin,
).toString();

const PRIVATE_PATH_PREFIXES = [
  "/app",
  "/api",
  "/auth",
  "/sign-in",
  "/sign-up",
  "/onboarding",
];
const SENSITIVE_PATH_PARTS = ["/export", "/messages", "/search", "/session"];
const PURGE_MESSAGE_TYPES = new Set([
  "TREVV_LOGOUT",
  "TREVV_SESSION_ENDED",
  "TREVV_PURGE_OFFLINE_DATA",
]);

function offlineResponse() {
  return new Response(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex">
    <title>TREVV is offline</title>
    <style>
      :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
      body { display: grid; min-height: 100vh; margin: 0; place-items: center; }
      main { max-width: 32rem; padding: 2rem; text-align: center; }
    </style>
  </head>
  <body>
    <main>
      <h1>You are offline</h1>
      <p>Reconnect to continue. TREVV does not store workspace data for offline access.</p>
    </main>
  </body>
</html>`,
    {
      status: 503,
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Type": "text/html; charset=utf-8",
      },
    },
  );
}

function isPrivateOrSensitivePath(pathname) {
  return (
    PRIVATE_PATH_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    ) || SENSITIVE_PATH_PARTS.some((part) => pathname.includes(part))
  );
}

function isSafeStaticRequest(request, url) {
  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return false;
  }

  if (isPrivateOrSensitivePath(url.pathname)) return false;

  // Next.js content-addresses this directory. Public files such as the
  // manifest or icon are deliberately excluded because their URLs are stable.
  return url.pathname.startsWith("/_next/static/");
}

function requestForbidsStorage(request) {
  const cacheControl = request.headers.get("cache-control") ?? "";
  return (
    request.cache === "no-store" || /(?:^|,)\s*no-store\b/i.test(cacheControl)
  );
}

function responseIsPublicAndImmutable(response) {
  if (!response.ok || response.type === "opaque") return false;

  const cacheControl = response.headers.get("cache-control") ?? "";
  const vary = response.headers.get("vary") ?? "";

  return (
    /(?:^|,)\s*public\b/i.test(cacheControl) &&
    /(?:^|,)\s*immutable\b/i.test(cacheControl) &&
    !/(?:^|,)\s*(?:no-store|private)\b/i.test(cacheControl) &&
    !/(?:^|,)\s*(?:cookie|authorization)\b/i.test(vary) &&
    !response.headers.has("set-cookie")
  );
}

async function seedOfflineShell() {
  const cache = await caches.open(STATIC_CACHE);
  await cache.put(OFFLINE_SHELL_URL, offlineResponse());
}

async function purgeManagedCaches({ restoreOfflineShell = true } = {}) {
  const keys = await caches.keys();
  await Promise.all(
    keys
      .filter((key) => key.startsWith(CACHE_PREFIX))
      .map((key) => caches.delete(key)),
  );

  if (restoreOfflineShell) await seedOfflineShell();
}

self.addEventListener("install", (event) => {
  event.waitUntil(seedOfflineShell());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) => key.startsWith(CACHE_PREFIX) && key !== STATIC_CACHE,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => seedOfflineShell())
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  const messageType = event.data?.type;
  if (!PURGE_MESSAGE_TYPES.has(messageType)) return;

  event.waitUntil(
    purgeManagedCaches().then(() => {
      event.source?.postMessage?.({
        type: "TREVV_OFFLINE_DATA_PURGED",
        reason: messageType,
      });
    }),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Documents are network-only. When offline, every navigation receives the
  // same content-free shell; no requested document is ever written to or read
  // from Cache Storage.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(
        async () =>
          (await caches.match(OFFLINE_SHELL_URL)) ?? offlineResponse(),
      ),
    );
    return;
  }

  // API, auth, app, exports, search, messages, and all other non-fingerprinted
  // resources bypass the worker completely.
  if (requestForbidsStorage(request) || !isSafeStaticRequest(request, url)) {
    return;
  }

  event.respondWith(
    caches.match(request).then(async (cached) => {
      if (cached) return cached;

      const response = await fetch(request);
      if (responseIsPublicAndImmutable(response)) {
        const cache = await caches.open(STATIC_CACHE);
        await cache.put(request, response.clone());
      }
      return response;
    }),
  );
});
