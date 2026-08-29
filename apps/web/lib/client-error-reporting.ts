"use client";

export type ClientErrorSurface = "root-render" | "app-route";

export function reportClientError(
  surface: ClientErrorSurface,
  error: Error & { digest?: string },
): void {
  const body = JSON.stringify({
    surface,
    errorName: safeErrorName(error.name),
    ...(safeDigest(error.digest) ? { digest: safeDigest(error.digest) } : {}),
  });
  void fetch("/api/web/client-error", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    cache: "no-store",
    keepalive: true,
  }).catch(() => undefined);
}

function safeDigest(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && /^[a-z0-9._:-]{6,128}$/iu.test(normalized)
    ? normalized
    : undefined;
}

function safeErrorName(value: string): string {
  return /^[a-z][a-z0-9._-]{0,63}$/iu.test(value) ? value : "Error";
}
