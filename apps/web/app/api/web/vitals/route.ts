import { readBoundedRequestBody } from "../../../../lib/bounded-request-body";
import {
  webRequestId,
  writeStructuredWebLog,
} from "../../../../lib/security-headers";
import { parseWebVitalReport } from "../../../../lib/web-vitals";
import { createWebVitalsRateLimiter } from "../../../../lib/web-vitals-rate-limit";

export const dynamic = "force-dynamic";

const noStoreHeaders = {
  "cache-control": "no-store, max-age=0",
  "content-type": "application/json; charset=utf-8",
};
const limiter = createWebVitalsRateLimiter();

export async function POST(request: Request) {
  if (process.env.WEB_VITALS_INGEST_ENABLED !== "true")
    return Response.json(
      { status: "not_found" },
      { status: 404, headers: noStoreHeaders },
    );
  const rateLimit = limiter.consume(clientKey(request));
  if (!rateLimit.allowed)
    return Response.json(
      { status: "rate_limited" },
      {
        status: 429,
        headers: {
          ...noStoreHeaders,
          "retry-after": String(rateLimit.retryAfterSeconds),
        },
      },
    );
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > 1_024)
    return Response.json(
      { status: "payload_too_large" },
      { status: 413, headers: noStoreHeaders },
    );
  const bounded = await readBoundedRequestBody(request, 1_024);
  if (bounded.status === "too_large")
    return Response.json(
      { status: "payload_too_large" },
      { status: 413, headers: noStoreHeaders },
    );
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bounded.bytes));
  } catch {
    return invalidReport();
  }
  const report = parseWebVitalReport(value);
  if (!report) return invalidReport();
  writeStructuredWebLog({
    level: report.rating === "poor" ? "warn" : "info",
    service: "trevv-web",
    event: "web_vital_observed",
    requestId: webRequestId(request.headers.get("x-request-id")),
    ...report,
  });
  return new Response(null, { status: 204, headers: noStoreHeaders });
}

function clientKey(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim() ||
    "unknown"
  ).slice(0, 128);
}

function invalidReport() {
  return Response.json(
    { status: "invalid_report" },
    { status: 400, headers: noStoreHeaders },
  );
}
