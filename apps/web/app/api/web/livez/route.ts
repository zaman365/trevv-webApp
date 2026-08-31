export const dynamic = "force-dynamic";

const headers = {
  "cache-control": "no-store, max-age=0",
  pragma: "no-cache",
};

/**
 * Process-local liveness for platform supervision.
 *
 * Keep this response independent of runtime configuration, the API, and the
 * database. Dependency admission belongs to /api/web/readyz.
 */
export function GET() {
  return Response.json({ status: "ok", service: "trevv-web" }, { headers });
}
