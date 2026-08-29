export const dynamic = "force-dynamic";

const noStoreHeaders = {
  "cache-control": "no-store, max-age=0",
  "content-type": "application/json; charset=utf-8",
};

export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > 2_048)
    return Response.json(
      { status: "payload_too_large" },
      { status: 413, headers: noStoreHeaders },
    );
  const bounded = await readBoundedRequestBody(request, 2_048);
  if (bounded.status === "too_large")
    return Response.json(
      { status: "payload_too_large" },
      { status: 413, headers: noStoreHeaders },
    );
  const body = new TextDecoder().decode(bounded.bytes);
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return Response.json(
      { status: "invalid_report" },
      { status: 400, headers: noStoreHeaders },
    );
  }
  const report = parseReport(value);
  if (!report)
    return Response.json(
      { status: "invalid_report" },
      { status: 400, headers: noStoreHeaders },
    );
  writeStructuredWebLog({
    level: "error",
    service: "trevv-web",
    event: "client_render_error",
    requestId: boundedToken(request.headers.get("x-request-id"), 128),
    ...report,
  });
  return new Response(null, { status: 204, headers: noStoreHeaders });
}

function parseReport(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (input.surface !== "root-render" && input.surface !== "app-route")
    return null;
  const errorName = boundedToken(input.errorName, 64);
  const digest = boundedToken(input.digest, 128);
  if (!errorName) return null;
  return {
    surface: input.surface,
    errorName,
    ...(digest ? { digest } : {}),
  };
}

function boundedToken(value: unknown, maximumLength: number) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized &&
    normalized.length <= maximumLength &&
    /^[a-z0-9._:-]+$/iu.test(normalized)
    ? normalized
    : undefined;
}
import { readBoundedRequestBody } from "../../../../lib/bounded-request-body";
import { writeStructuredWebLog } from "../../../../lib/security-headers";
