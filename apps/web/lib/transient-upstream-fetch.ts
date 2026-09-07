const transientUpstreamStatuses = new Set([502, 503, 504]);

export const defaultTransientRetryDelaysMs = [
  1_000, 2_000, 4_000, 8_000, 10_000, 10_000, 10_000, 10_000,
] as const;

type RetryOptions = {
  fetchImpl?: typeof fetch;
  retryDelaysMs?: readonly number[];
  sleep?: (delayMs: number, signal?: AbortSignal | null) => Promise<void>;
  /** Deadline for acquiring a response, including retries (streaming bodies stay streaming). */
  timeoutMs?: number;
  attemptTimeoutMs?: number;
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

  const timeoutMs = options.timeoutMs ?? 5_000;
  const attemptTimeoutMs = options.attemptTimeoutMs ?? 2_500;
  const deadline = new AbortController();
  const totalTimer = setTimeout(
    () => deadline.abort(timeoutError()),
    timeoutMs,
  );
  const combined = signal
    ? AbortSignal.any([signal, deadline.signal])
    : deadline.signal;
  try {
    for (let attempt = 0; ; attempt += 1) {
      throwIfAborted(combined);
      const attemptController = new AbortController();
      const attemptTimer = setTimeout(
        () => attemptController.abort(timeoutError()),
        attemptTimeoutMs,
      );
      const attemptSignal = AbortSignal.any([
        combined,
        attemptController.signal,
      ]);
      try {
        // A signal also opts every attempt out of framework GET memoization,
        // which otherwise retains gateway errors throughout a server render.
        const response = await withAbort(
          fetchImpl(input, { ...init, signal: attemptSignal }),
          attemptSignal,
        );
        if (
          !transientUpstreamStatuses.has(response.status) ||
          attempt >= retryDelaysMs.length
        )
          return response;
        // Cancel without awaiting a potentially retained tee branch.
        void response.body?.cancel().catch(() => undefined);
      } catch (error) {
        if (attempt >= retryDelaysMs.length || combined.aborted) throw error;
      } finally {
        clearTimeout(attemptTimer);
      }
      await withAbort(sleep(retryDelaysMs[attempt] ?? 0, combined), combined);
    }
  } finally {
    clearTimeout(totalTimer);
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

function timeoutError() {
  return new DOMException(
    "The service did not respond in time. Please try again.",
    "TimeoutError",
  );
}

function withAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    // The operation may already have started before the signal was inspected.
    // Observe its rejection even though cancellation wins the race.
    void promise.catch(() => undefined);
    return Promise.reject(abortReason(signal));
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(abortReason(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", onAbort));
  });
}
