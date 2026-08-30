import type { RateLimitRepository } from "@founderhq/db";
import { isIP } from "node:net";

export interface RateLimitInput {
  bucket: string;
  key: string;
  limit: number;
  windowMs: number;
  now: Date;
}

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
}

export interface ApiRateLimitStore {
  readonly scope: "process" | "shared";
  consume(input: RateLimitInput): Promise<RateLimitDecision>;
}

export interface ApiLogger {
  write(record: Readonly<Record<string, unknown>>): void;
}

export interface ApiErrorReporter {
  capture(record: {
    service: "trevv-api";
    requestId: string;
    errorCode: string;
    errorName: string;
  }): void;
}

export interface ApiOperations {
  rateLimitStore?: ApiRateLimitStore;
  trustedClientIpHeader?: string;
  logger?: ApiLogger;
  errorReporter?: ApiErrorReporter;
  metrics?: ApiMetrics;
}

export interface RateLimitPolicy {
  bucket: string;
  limit: number;
  windowMs: number;
}

interface MemoryWindow {
  count: number;
  resetAtMs: number;
}

interface RequestMetric {
  count: number;
  durationMs: number;
  buckets: number[];
}

const sensitiveKey =
  /(?:authorization|cookie|credential|email|password|secret|session|token)/iu;
const safeRequestId = /^[a-z0-9][a-z0-9._:-]{7,127}$/iu;
const safeTrustedClientIpHeaderName =
  /^(?:cf-connecting-ip|x-[a-z0-9-]{1,62})$/u;
const durationBucketsMs = [25, 50, 100, 250, 500, 1_000, 2_500, 5_000];
const maximumRequestSeries = 512;
const metricMethods = new Set([
  "DELETE",
  "GET",
  "HEAD",
  "OPTIONS",
  "PATCH",
  "POST",
  "PUT",
]);
const apiV1RouteFamilies = new Set([
  "attention",
  "blueprints",
  "boards",
  "change-radar",
  "conversations",
  "entitlements",
  "events",
  "export",
  "health",
  "import",
  "inbox",
  "insights",
  "invitations",
  "items",
  "management-memory",
  "memberships",
  "onboarding",
  "operations",
  "portfolios",
  "privacy",
  "readyz",
  "reviews",
  "search",
  "session",
  "team-pressure",
  "teams",
  "waiting",
  "workspaces",
]);
const operationalPaths = new Set([
  "/api/v1/health",
  "/api/v1/readyz",
  "/internal/livez",
  "/internal/metrics",
  "/openapi.json",
]);

export interface ApiMetrics {
  recordRequest(input: {
    method: string;
    path: string;
    status: number;
    durationMs: number;
  }): void;
  recordRateLimitRejection(bucket: string): void;
  recordRateLimitStoreError(): void;
  recordUnhandledError(): void;
  render(): string;
}

export function createApiMetrics(): ApiMetrics {
  const requests = new Map<string, RequestMetric>();
  const rateLimitRejections = new Map<string, number>();
  let rateLimitStoreErrors = 0;
  let unhandledErrors = 0;
  return {
    recordRequest(input) {
      const candidateMethod = input.method.toUpperCase();
      const method = metricMethods.has(candidateMethod)
        ? candidateMethod
        : "OTHER";
      const path = safeMetricLabel(input.path);
      const statusClass =
        Number.isInteger(input.status) &&
        input.status >= 100 &&
        input.status < 600
          ? `${Math.floor(input.status / 100)}xx`
          : "other";
      let key = JSON.stringify([method, path, statusClass]);
      if (!requests.has(key) && requests.size >= maximumRequestSeries)
        key = JSON.stringify(["OTHER", "/:overflow", "other"]);
      const metric = requests.get(key) ?? {
        count: 0,
        durationMs: 0,
        buckets: durationBucketsMs.map(() => 0),
      };
      metric.count += 1;
      metric.durationMs += Math.max(0, input.durationMs);
      durationBucketsMs.forEach((boundary, index) => {
        if (input.durationMs <= boundary) metric.buckets[index]! += 1;
      });
      requests.set(key, metric);
    },
    recordRateLimitRejection(bucket) {
      rateLimitRejections.set(
        safeMetricLabel(bucket),
        (rateLimitRejections.get(safeMetricLabel(bucket)) ?? 0) + 1,
      );
    },
    recordRateLimitStoreError() {
      rateLimitStoreErrors += 1;
    },
    recordUnhandledError() {
      unhandledErrors += 1;
    },
    render() {
      const lines = [
        "# HELP trevv_api_up API process scrape health.",
        "# TYPE trevv_api_up gauge",
        "trevv_api_up 1",
        "# HELP trevv_api_http_requests_total Completed API requests.",
        "# TYPE trevv_api_http_requests_total counter",
      ];
      for (const [key, metric] of [...requests].sort(([a], [b]) =>
        a.localeCompare(b),
      )) {
        const [method, path, statusClass] = JSON.parse(key) as string[];
        const labels = `method="${method}",route="${path}",status_class="${statusClass}"`;
        lines.push(
          `trevv_api_http_requests_total{${labels}} ${metric.count}`,
          `trevv_api_http_request_duration_milliseconds_sum{${labels}} ${metric.durationMs}`,
          `trevv_api_http_request_duration_milliseconds_count{${labels}} ${metric.count}`,
        );
        metric.buckets.forEach((count, index) =>
          lines.push(
            `trevv_api_http_request_duration_milliseconds_bucket{${labels},le="${durationBucketsMs[index]}"} ${count}`,
          ),
        );
        lines.push(
          `trevv_api_http_request_duration_milliseconds_bucket{${labels},le="+Inf"} ${metric.count}`,
        );
      }
      lines.push(
        "# HELP trevv_api_rate_limit_rejections_total Requests rejected by policy.",
        "# TYPE trevv_api_rate_limit_rejections_total counter",
      );
      for (const [bucket, count] of [...rateLimitRejections].sort(([a], [b]) =>
        a.localeCompare(b),
      ))
        lines.push(
          `trevv_api_rate_limit_rejections_total{bucket="${bucket}"} ${count}`,
        );
      lines.push(
        "# HELP trevv_api_rate_limit_store_errors_total Shared limiter failures.",
        "# TYPE trevv_api_rate_limit_store_errors_total counter",
        `trevv_api_rate_limit_store_errors_total ${rateLimitStoreErrors}`,
        "# HELP trevv_api_unhandled_errors_total Unhandled request failures.",
        "# TYPE trevv_api_unhandled_errors_total counter",
        `trevv_api_unhandled_errors_total ${unhandledErrors}`,
      );
      return `${lines.join("\n")}\n`;
    },
  };
}

export function acceptedRequestId(
  candidate: string | undefined,
  generate: () => string,
): string {
  const normalized = candidate?.trim();
  return normalized && safeRequestId.test(normalized) ? normalized : generate();
}

export function trustedClientKey(
  headers: Headers,
  trustedClientIpHeader: string | undefined,
): string {
  if (trustedClientIpHeader) {
    const normalizedHeader = trustedClientIpHeader.trim().toLowerCase();
    if (!safeTrustedClientIpHeaderName.test(normalizedHeader))
      throw new Error(
        "The trusted client IP header must be an explicitly allowed edge header name.",
      );
    const value = headers.get(normalizedHeader)?.trim();
    if (value && isIP(value) > 0) return `ip:${value}`;
    throw new Error("The trusted client IP header is missing or invalid.");
  }
  return "client:unresolved";
}

export function rateLimitPolicy(
  method: string,
  path: string,
): RateLimitPolicy | null {
  if (
    method === "OPTIONS" ||
    path === "/api/v1/health" ||
    path === "/api/v1/readyz" ||
    path === "/openapi.json"
  )
    return null;
  if (path.startsWith("/api/auth/"))
    return method === "GET"
      ? { bucket: "auth-read", limit: 120, windowMs: 60_000 }
      : { bucket: "auth-sensitive", limit: 10, windowMs: 15 * 60_000 };
  if (path.startsWith("/api/v1/"))
    return new Set(["POST", "PUT", "PATCH", "DELETE"]).has(method)
      ? { bucket: "api-mutation", limit: 120, windowMs: 60_000 }
      : { bucket: "api-read", limit: 600, windowMs: 60_000 };
  return null;
}

export function telemetryPath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  if (
    parts[0] === "api" &&
    parts[1] === "v1" &&
    parts[2] &&
    apiV1RouteFamilies.has(parts[2])
  )
    return `/api/v1/${parts[2]}${parts.length > 3 ? "/:resource" : ""}`;
  if (parts[0] === "api" && parts[1] === "v1") return "/api/v1/:unmatched";
  if (parts[0] === "api" && parts[1] === "auth") return "/api/auth/:operation";
  if (path === "/internal/livez" || path === "/internal/metrics") return path;
  if (path === "/openapi.json") return path;
  return "/:unmatched";
}

export function isOperationalTelemetryPath(path: string): boolean {
  return operationalPaths.has(path);
}

export function createMemoryRateLimitStore(): ApiRateLimitStore {
  const windows = new Map<string, MemoryWindow>();
  return {
    scope: "process",
    async consume(input) {
      const id = `${input.bucket}:${input.key}`;
      const nowMs = input.now.getTime();
      const existing = windows.get(id);
      const window =
        !existing || existing.resetAtMs <= nowMs
          ? { count: 0, resetAtMs: nowMs + input.windowMs }
          : existing;
      window.count += 1;
      windows.set(id, window);
      return {
        allowed: window.count <= input.limit,
        limit: input.limit,
        remaining: Math.max(0, input.limit - window.count),
        resetAt: new Date(window.resetAtMs),
      };
    },
  };
}

export function createPostgresRateLimitStore(
  repository: RateLimitRepository,
  options: { onCleanupError?: () => void } = {},
): ApiRateLimitStore {
  let nextCleanupAtMs = Number.NEGATIVE_INFINITY;
  return {
    scope: "shared",
    async consume(input) {
      const window = await repository.consume({
        bucket: input.bucket,
        clientKey: input.key,
        windowMs: input.windowMs,
        now: input.now,
      });
      if (input.now.getTime() >= nextCleanupAtMs) {
        nextCleanupAtMs = input.now.getTime() + 5 * 60_000;
        try {
          await repository.pruneExpired(input.now);
        } catch {
          nextCleanupAtMs = input.now.getTime() + 60_000;
          options.onCleanupError?.();
        }
      }
      return {
        allowed: window.count <= input.limit,
        limit: input.limit,
        remaining: Math.max(0, input.limit - window.count),
        resetAt: window.resetAt,
      };
    },
  };
}

export function createJsonLogger(
  write: (line: string) => void = (line) => process.stdout.write(line),
): ApiLogger {
  return {
    write(record) {
      write(`${JSON.stringify(redactLogValue(record))}\n`);
    },
  };
}

export function redactLogValue(value: unknown, key = "", depth = 0): unknown {
  if (sensitiveKey.test(key)) return "[redacted]";
  if (depth >= 5) return "[truncated]";
  if (Array.isArray(value))
    return value
      .slice(0, 20)
      .map((entry) => redactLogValue(entry, "", depth + 1));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(
        ([entryKey, entry]) => [
          entryKey,
          redactLogValue(entry, entryKey, depth + 1),
        ],
      ),
    );
  if (typeof value === "string") return value.slice(0, 1_024);
  return value;
}

function safeMetricLabel(value: string): string {
  return value.replace(/[^a-z0-9._:/-]/giu, "_").slice(0, 160);
}
