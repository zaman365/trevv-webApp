import {
  readinessSchema,
  type RuntimeReleaseMetadata,
} from "@founderhq/api-contract";
import {
  webApiOrigin,
  webReleaseMetadata,
  webRegistrationMode,
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
        registrationMode: "not_applicable",
        api: "not_required",
        release: null,
        apiRelease: null,
      },
      { headers },
    );
  }

  const registrationMode = webRegistrationMode();
  let release: RuntimeReleaseMetadata | null = null;
  try {
    release = webReleaseMetadata();
    const response = await fetch(new URL("/api/v1/readyz", webApiOrigin()), {
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
    });
    const parsed = readinessSchema.safeParse(await response.json());
    if (
      !response.ok ||
      !parsed.success ||
      parsed.data.status !== "ready" ||
      parsed.data.mode !== "live" ||
      parsed.data.registrationMode !== registrationMode ||
      parsed.data.database !== "ready" ||
      (process.env.NODE_ENV === "production" && parsed.data.release === null)
    ) {
      throw new Error("The live API is not ready.");
    }
    return Response.json(
      {
        status: "ready",
        service: "trevv-web",
        mode,
        registrationMode,
        api: "ready",
        release,
        apiRelease: parsed.data.release,
      },
      { headers },
    );
  } catch {
    return Response.json(
      {
        status: "unavailable",
        service: "trevv-web",
        mode,
        registrationMode,
        api: "unavailable",
        release,
        apiRelease: null,
      },
      { status: 503, headers },
    );
  }
}
