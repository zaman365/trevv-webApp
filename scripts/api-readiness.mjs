const apiOrigin = new URL(
  process.env.API_HEALTH_ORIGIN?.trim() || "http://127.0.0.1:8787",
);
const response = await fetch(new URL("/api/v1/readyz", apiOrigin), {
  cache: "no-store",
  signal: AbortSignal.timeout(3_000),
});
if (!response.ok)
  throw new Error(`API readiness returned HTTP ${response.status}.`);
const body = await response.json();
if (
  body?.status !== "ready" ||
  body?.mode !== "live" ||
  body?.database !== "ready" ||
  body?.release?.releaseId !== process.env.RELEASE_ID ||
  body?.release?.gitSha !== process.env.RELEASE_GIT_SHA?.toLowerCase() ||
  body?.release?.imageId !== process.env.RELEASE_IMAGE_ID?.toLowerCase()
)
  throw new Error("API data plane or packaged release identity is not ready.");
