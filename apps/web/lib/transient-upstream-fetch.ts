const transientUpstreamStatuses = new Set([502, 503, 504]);

export const defaultTransientRetryDelaysMs = [
  1_000, 2_000, 4_000, 8_000, 10_000, 10_000, 10_000, 10_000,
] as const;

type RetryOptions = {
  fetchImpl?: typeof fetch;
  retryDelaysMs?: readonly number[];
  sleep?: (delayMs: number, signal?: AbortSignal | null) => Promise<void>;
};

/**
 * Render Free can return a short-lived gateway response while a sleeping API
 * wakes. Retry only safe reads; mutations must always remain single-attempt.
 */
export async function fetchWithTransientUpstreamRetry(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: RetryOptions = {},
): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const retryDelaysMs = options.retryDelaysMs ?? defaultTransientRetryDelaysMs;
  const sleep = options.sleep ?? sleepWithAbort;
  const method = requestMethod(input, init);
  const signal =
    init.signal !== undefined
      ? init.signal
      : input instanceof Request
        ? input.signal
        : undefined;

  if (method !== "GET" && method !== "HEAD") {
    return fetchImpl(input, init);
  }

  for (let attempt = 0; ; attempt += 1) {
    throwIfAborted(signal);

    try {
      // Framework request memoization also covers no-store GETs. In Vinext it
      // can retain a transient gateway response for the life of this render.
      // A signal opts subsequent attempts out, so a retry contacts the upstream
      // instead of replaying the original 503 for the entire backoff window.
      const retryInit =
        attempt === 0
          ? init
          : {
              ...init,
              signal: signal ?? new AbortController().signal,
            };
      const response = await fetchImpl(input, retryInit);
      if (
        !transientUpstreamStatuses.has(response.status) ||
        attempt >= retryDelaysMs.length
      ) {
        return response;
      }
      // A memoized response may be one branch of a tee. Awaiting cancellation
      // waits for the retained branch as well and can strand the retry forever.
      void response.body?.cancel().catch(() => undefined);
    } catch (error) {
      if (attempt >= retryDelaysMs.length || signal?.aborted) throw error;
    }

    await sleep(retryDelaysMs[attempt] ?? 0, signal);
  }
}

function requestMethod(input: RequestInfo | URL, init: RequestInit): string {
  if (init.method) return init.method.toUpperCase();
  if (typeof Request !== "undefined" && input instanceof Request)
    return input.method.toUpperCase();
  return "GET";
}

function throwIfAborted(signal: AbortSignal | null | undefined): void {
  if (!signal?.aborted) return;
  throw abortReason(signal);
}

function sleepWithAbort(
  delayMs: number,
  signal?: AbortSignal | null,
): Promise<void> {
  if (!signal) {
    return new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  if (signal.aborted) return Promise.reject(abortReason(signal));

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", onAbort);
      reject(abortReason(signal));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException("The request was aborted.", "AbortError");
}
