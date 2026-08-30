export interface WebVitalsRateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

interface WindowEntry {
  count: number;
  expiresAt: number;
}

/**
 * Per-instance abuse backstop for the public RUM endpoint. Production still
 * requires a shared edge limit; this keeps one process bounded and testable.
 */
export function createWebVitalsRateLimiter({
  limit = 120,
  windowMs = 60_000,
  maximumClients = 4_096,
}: {
  limit?: number;
  windowMs?: number;
  maximumClients?: number;
} = {}) {
  const windows = new Map<string, WindowEntry>();

  return {
    consume(clientKey: string, now = Date.now()): WebVitalsRateLimitDecision {
      const current = windows.get(clientKey);
      if (!current || current.expiresAt <= now) {
        if (windows.size >= maximumClients) pruneExpired(windows, now);
        if (windows.size >= maximumClients) {
          const oldestKey = windows.keys().next().value as string | undefined;
          if (oldestKey) windows.delete(oldestKey);
        }
        windows.set(clientKey, { count: 1, expiresAt: now + windowMs });
        return { allowed: true, retryAfterSeconds: 0 };
      }
      if (current.count >= limit)
        return {
          allowed: false,
          retryAfterSeconds: Math.max(
            1,
            Math.ceil((current.expiresAt - now) / 1_000),
          ),
        };
      current.count += 1;
      return { allowed: true, retryAfterSeconds: 0 };
    },
  };
}

function pruneExpired(windows: Map<string, WindowEntry>, now: number): void {
  for (const [key, entry] of windows)
    if (entry.expiresAt <= now) windows.delete(key);
}
