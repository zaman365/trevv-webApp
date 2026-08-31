const defaultReadinessAttempts = 24;
const defaultReadinessRequestTimeoutMs = 4_000;
const defaultReadinessPollDelayMs = 1_000;

type FetchImplementation = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type LiveApiReadinessOptions = {
  attempts?: number;
  fetchImpl?: FetchImplementation;
  pollDelayMs?: number;
  requestTimeoutMs?: number;
  wait?: (delayMs: number) => Promise<void>;
};

let readinessInFlight: Promise<boolean> | null = null;

/**
 * Wake the dependency-aware Web/API readiness boundary before a mutation.
 * Every request and the overall retry count are bounded so a sleeping or
 * unavailable free-preview dependency cannot strand the browser indefinitely.
 */
export async function waitForLiveApiReadiness({
  attempts = defaultReadinessAttempts,
  fetchImpl = fetch,
  pollDelayMs = defaultReadinessPollDelayMs,
  requestTimeoutMs = defaultReadinessRequestTimeoutMs,
  wait = delay,
}: LiveApiReadinessOptions = {}): Promise<boolean> {
  if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > 60)
    throw new Error("Live API readiness attempts must be between 1 and 60.");
  if (
    !Number.isFinite(requestTimeoutMs) ||
    requestTimeoutMs < 1 ||
    requestTimeoutMs > 10_000
  )
    throw new Error(
      "Live API readiness request timeout must be between 1 and 10000 milliseconds.",
    );
  if (!Number.isFinite(pollDelayMs) || pollDelayMs < 0 || pollDelayMs > 10_000)
    throw new Error(
      "Live API readiness poll delay must be between 0 and 10000 milliseconds.",
    );

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(
      () => controller.abort(),
      requestTimeoutMs,
    );
    try {
      const response = await fetchImpl("/api/web/readyz", {
        cache: "no-store",
        credentials: "omit",
        signal: controller.signal,
      });
      const body: unknown = await response.json().catch(() => null);
      if (
        response.ok &&
        body &&
        typeof body === "object" &&
        (body as { status?: unknown }).status === "ready" &&
        (body as { mode?: unknown }).mode === "live" &&
        (body as { api?: unknown }).api === "ready"
      )
        return true;
    } catch {
      // Cold or unavailable dependencies are expected during this bounded
      // preflight. Callers must not mutate unless readiness succeeds.
    } finally {
      globalThis.clearTimeout(timeout);
    }
    if (attempt + 1 < attempts) await wait(pollDelayMs);
  }
  return false;
}

/** Share one in-flight warm-up across page load and an immediate form submit. */
export function warmLiveApiReadiness(): Promise<boolean> {
  if (readinessInFlight) return readinessInFlight;
  const current = waitForLiveApiReadiness();
  readinessInFlight = current;
  void current.finally(() => {
    if (readinessInFlight === current) readinessInFlight = null;
  });
  return current;
}

function delay(delayMs: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, delayMs));
}
