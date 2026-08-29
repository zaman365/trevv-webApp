import { webApiOrigin } from "./web-runtime-config";
import { appendSetCookieHeaders } from "./response-cookies";

const allowedNamespaces = new Set(["auth", "v1"]);
const browserAuthOperations = new Set([
  "POST request-password-reset",
  "POST send-verification-email",
  "POST sign-in/email",
  "POST sign-up/email",
]);
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
  if (!browserApiOperationAllowed(segments, request.method)) {
    return notFoundResponse();
  }
  const incoming = new URL(request.url);
  const upstreamUrl = upstreamApiUrl(segments, incoming.search);
  if (!upstreamUrl) return notFoundResponse();

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
    signal: request.signal,
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
    segments[0] === "auth"
      ? await safeBrowserAuthBody(upstream, responseHeaders)
      : request.method === "HEAD" ||
          [101, 204, 205, 304].includes(upstream.status)
        ? null
        : upstream.body;
  return new Response(responseBody, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export function browserApiOperationAllowed(
  segments: readonly string[],
  method: string,
): boolean {
  if (segments[0] !== "auth") return segments[0] === "v1";
  return browserAuthOperations.has(
    `${method.toUpperCase()} ${segments.slice(1).join("/")}`,
  );
}

async function safeBrowserAuthBody(
  upstream: Response,
  responseHeaders: Headers,
): Promise<string | null> {
  if ([101, 204, 205, 304].includes(upstream.status)) return null;
  responseHeaders.set("content-type", "application/json; charset=utf-8");
  if (upstream.ok) return JSON.stringify({ ok: true });

  const value: unknown = await upstream.json().catch(() => null);
  const top = isRecord(value) ? value : {};
  const nested = isRecord(top.error) ? top.error : {};
  const code = firstString(top.code, nested.code);
  const message = firstString(
    top.message,
    nested.message,
    typeof top.error === "string" ? top.error : undefined,
  );
  return JSON.stringify({
    ...(code ? { code } : {}),
    message: message ?? "Authentication request failed.",
  });
}

function notFoundResponse(): Response {
  return Response.json(
    { error: { code: "not_found", message: "Endpoint not found." } },
    { status: 404, headers: { "cache-control": "no-store" } },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function firstString(...values: unknown[]): string | undefined {
  return values.find(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
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
