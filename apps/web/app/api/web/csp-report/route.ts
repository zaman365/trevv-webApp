import {
  sanitizedCspReport,
  webRequestId,
  writeStructuredWebLog,
} from "../../../../lib/security-headers";
import { readBoundedRequestBody } from "../../../../lib/bounded-request-body";

export const dynamic = "force-dynamic";

const maximumReportBytes = 16 * 1_024;
const responseHeaders = {
  "cache-control": "no-store, max-age=0",
  "content-type": "application/json; charset=utf-8",
};

export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maximumReportBytes)
    return Response.json(
      { status: "payload_too_large" },
      { status: 413, headers: responseHeaders },
    );
  const bounded = await readBoundedRequestBody(request, maximumReportBytes);
  if (bounded.status === "too_large")
    return Response.json(
      { status: "payload_too_large" },
      { status: 413, headers: responseHeaders },
    );
  const body = new TextDecoder().decode(bounded.bytes);
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return Response.json(
      { status: "invalid_report" },
      { status: 400, headers: responseHeaders },
    );
  }
  writeStructuredWebLog({
    level: "info",
    service: "trevv-web",
    event: "csp_violation",
    requestId: webRequestId(request.headers.get("x-request-id")),
    ...sanitizedCspReport(parsed),
  });
  return new Response(null, { status: 204, headers: responseHeaders });
}
