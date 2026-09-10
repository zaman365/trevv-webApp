import { BlockList, isIP } from "node:net";
import { createRequire } from "node:module";

// Cloudflare GET /ips, verified 2026-09-10, etag 38f79d050aa027e3be3865e495dcc9bc.
// Refresh and verify this list when reviewing the deployment configuration.
const cloudflareNetworks = new BlockList();
for (const network of [
  "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22",
  "141.101.64.0/18", "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20",
  "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
  "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22", "2400:cb00::/32",
  "2606:4700::/32", "2803:f800::/32", "2405:b500::/32", "2405:8100::/32",
  "2a06:98c0::/29", "2c0f:f248::/32",
]) {
  const [address, prefix] = network.split("/");
  cloudflareNetworks.addSubnet(address, Number(prefix), isIP(address) === 4 ? "ipv4" : "ipv6");
}

const probes = new Set(["/api/v1/health", "/api/v1/readyz"]);
const ipHeaders = ["cf-connecting-ip", "cf-connecting-ipv6", "forwarded", "true-client-ip", "x-forwarded-for", "x-real-ip"];

export function northflankClientIp(headers) {
  // Northflank appends the connecting peer to X-Forwarded-For. Only its final
  // value belongs to that trusted hop; every preceding value is caller input.
  // This adapter must run exclusively behind Northflank's managed HTTP ingress.
  const chain = headers.get("x-forwarded-for");
  const peer = chain?.split(",").at(-1)?.trim();
  const family = peer ? isIP(peer) : 0;
  if (!family) throw new Error("Invalid Northflank ingress address.");
  if (!cloudflareNetworks.check(peer, family === 4 ? "ipv4" : "ipv6")) return peer;

  // A non-Cloudflare caller cannot choose this header. Cloudflare supplies it
  // for Worker requests to the non-Cloudflare code.run origin, even when the
  // frontend removes caller-supplied IP headers before making its subrequest.
  const client = headers.get("cf-connecting-ip")?.trim();
  if (!client || !isIP(client)) throw new Error("Invalid Cloudflare client address.");
  return client;
}

export function northflankFetch(applicationFetch) {
  return (request, ...arguments_) => {
    let client;
    try {
      client = northflankClientIp(request.headers);
    } catch {
      // Northflank's container probes do not pass through the public ingress.
      if ((request.method === "GET" || request.method === "HEAD") && probes.has(new URL(request.url).pathname))
        return applicationFetch(request, ...arguments_);
      return new Response(JSON.stringify({ error: "invalid_ingress" }), {
        status: 403,
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      });
    }
    const headers = new Headers(request.headers);
    for (const name of ipHeaders) headers.delete(name);
    headers.set("cf-connecting-ip", client);
    headers.set("x-forwarded-for", client);
    headers.set("x-real-ip", client);
    return applicationFetch(new Request(request, { headers }), ...arguments_);
  };
}

export async function startNorthflankApi() {
  const database = new URL(process.env.NF_TREVV_POSTGRES_POSTGRES_URI);
  database.searchParams.set("sslmode", "verify-full");
  process.env.DATABASE_URL = database.href;
  if (process.env.TRUSTED_CLIENT_IP_HEADER !== "cf-connecting-ip")
    throw new Error("Northflank's adapter requires TRUSTED_CLIENT_IP_HEADER=cf-connecting-ip.");

  const require = createRequire("/app/apps/api/package.json");
  const { serve } = require("@hono/node-server");
  const { createRuntimeApi } = await import("file:///app/apps/api/dist/app.js");
  const runtime = createRuntimeApi();
  const port = Number.parseInt(process.env.PORT ?? "8787", 10);
  const server = serve({ fetch: northflankFetch(runtime.app.fetch), port }, (info) => {
    console.log(JSON.stringify({ level: "info", message: "TREVV API ready", port: info.port, ingress: "northflank", release: runtime.releaseMetadata }));
  });
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => {
      server.close(() => { void runtime.close().finally(() => process.exit(0)); });
    });
  return server;
}
