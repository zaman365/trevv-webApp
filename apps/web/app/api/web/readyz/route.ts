import {
  webApiOrigin,
  webRuntimeMode,
} from "../../../../lib/web-runtime-config";

export const dynamic = "force-dynamic";

const headers = {
  "cache-control": "no-store, max-age=0",
  pragma: "no-cache",
};

export async function GET() {
  const mode = webRuntimeMode();
  if (mode === "demo") {
    return Response.json(
      {
        status: "ready",
        service: "trevv-web",
        mode,
        api: "not_required",
      },
      { headers },
    );
  }

  try {
    const response = await fetch(new URL("/api/v1/readyz", webApiOrigin()), {
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
    });
    const body: unknown = await response.json();
    if (
      !response.ok ||
      !body ||
      typeof body !== "object" ||
      (body as { status?: unknown }).status !== "ready" ||
      (body as { mode?: unknown }).mode !== "live" ||
      (body as { database?: unknown }).database !== "ready"
    ) {
      throw new Error("The live API is not ready.");
    }
    return Response.json(
      {
        status: "ready",
        service: "trevv-web",
        mode,
        api: "ready",
      },
      { headers },
    );
  } catch {
    return Response.json(
      {
        status: "unavailable",
        service: "trevv-web",
        mode,
        api: "unavailable",
      },
      { status: 503, headers },
    );
  }
}
