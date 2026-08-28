const CACHE = "trevv-v3";
const SHELL = [
  "/",
  "/app/portfolio",
  "/app/my-work",
  "/app/inbox",
  "/app/messages",
  "/manifest.webmanifest",
  "/icon",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  const isDocument = request.mode === "navigate";
  const isLocalAsset =
    url.origin === self.location.origin &&
    ["style", "script", "font", "image", "manifest"].includes(
      request.destination,
    );
  const isApiRead =
    url.pathname.startsWith("/api/v1/") ||
    ["portfolio", "hubs", "items"].some((part) =>
      url.pathname.endsWith(`/api/v1/${part}`),
    );
  if (!isDocument && !isLocalAsset && !isApiRead) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          void caches.open(CACHE).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(
        async () =>
          (await caches.match(request)) ??
          (isDocument ? caches.match("/app/portfolio") : undefined) ??
          new Response("Offline", { status: 503 }),
      ),
  );
});
