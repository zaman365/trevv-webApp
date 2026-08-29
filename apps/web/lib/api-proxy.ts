import { webApiOrigin } from "./web-runtime-config";
import { appendSetCookieHeaders } from "./response-cookies";

const allowedNamespaces = new Set(["auth", "v1"]);
const strippedRequestHeaders = new Set([
  "connection",
  "content-length",
  "host",
  "transfer-encoding",
]);
const strippedResponseHeaders = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "transfer-encoding",
]);

export function upstreamApiUrl(
  segments: readonly string[],
  search: string,
): URL | null {
  if (!segments[0] || !allowedNamespaces.has(segments[0])) return null;
  const url = new URL(
    `/api/${segments.map(encodeURIComponent).join("/")}`,
    webApiOrigin(),
  );
  url.search = search;
  return url;
}

export async function proxyApiRequest(
  request: Request,
  segments: readonly string[],
): Promise<Response> {
  const incoming = new URL(request.url);
  const upstreamUrl = upstreamApiUrl(segments, incoming.search);
  if (!upstreamUrl) {
    return Response.json(
      { error: { code: "not_found", message: "Endpoint not found." } },
      { status: 404, headers: { "cache-control": "no-store" } },
    );
  }

  const headers = new Headers(request.headers);
  for (const name of strippedRequestHeaders) headers.delete(name);
  headers.set("x-forwarded-host", incoming.host);
  headers.set("x-forwarded-proto", incoming.protocol.replace(":", ""));

  const body =
    request.method === "GET" || request.method === "HEAD"
      ? null
      : await request.arrayBuffer();
  const upstream = await fetch(upstreamUrl, {
    method: request.method,
    headers,
    ...(body ? { body } : {}),
    cache: "no-store",
    redirect: "manual",
  });
  const responseHeaders = copyResponseHeaders(upstream.headers);
  responseHeaders.set("cache-control", "private, no-store, max-age=0");
  responseHeaders.set("pragma", "no-cache");

  const location = responseHeaders.get("location");
  if (location) {
    const target = new URL(location, upstreamUrl);
    if (target.origin === upstreamUrl.origin) {
      responseHeaders.set(
        "location",
        `${incoming.origin}${target.pathname}${target.search}${target.hash}`,
      );
    }
  }

  const responseBody =
    request.method === "HEAD" || [101, 204, 205, 304].includes(upstream.status)
      ? null
      : upstream.body;
  return new Response(responseBody, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

function copyResponseHeaders(source: Headers): Headers {
  const result = new Headers();
  source.forEach((value, name) => {
    if (
      !strippedResponseHeaders.has(name.toLowerCase()) &&
      name !== "set-cookie"
    )
      result.append(name, value);
  });
  appendSetCookieHeaders(source, result);
  return result;
}
