export type CspMode = "report-only" | "enforce";

type Environment = Record<string, string | undefined>;

export interface WebSecurityHeader {
  key: string;
  value: string;
}

const safeRequestId = /^[a-z0-9][a-z0-9._:-]{7,127}$/iu;
const publicTelemetryPaths = new Set([
  "forgot-password",
  "invite",
  "onboarding",
  "privacy",
  "reset-password",
  "select-organization",
  "sign-in",
  "sign-up",
  "terms",
  "verify-email",
]);
const appTelemetryPaths = new Set(["account", "portfolio"]);
const webApiTelemetryPaths = new Set(["client-error", "csp-report", "readyz"]);

export function webRequestId(
  candidate: string | null,
  generate: () => string = () => crypto.randomUUID(),
): string {
  const normalized = candidate?.trim();
  return normalized && safeRequestId.test(normalized) ? normalized : generate();
}

export function webTelemetryPath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "app" && parts[1] === "workspaces")
    return parts.length > 3
      ? "/app/workspaces/:workspace/:view"
      : "/app/workspaces/:workspace";
  if (parts[0] === "app")
    return parts[1] && appTelemetryPaths.has(parts[1])
      ? `/app/${parts[1]}`
      : "/app/:unmatched";
  if (parts[0] === "api" && parts[1] === "auth") return "/api/auth/:operation";
  if (parts[0] === "api" && parts[1] === "v1") return "/api/v1/:operation";
  if (parts[0] === "api" && parts[1] === "web")
    return parts[2] && webApiTelemetryPaths.has(parts[2])
      ? `/api/web/${parts[2]}`
      : "/api/web/:unmatched";
  if (!parts[0]) return "/";
  return publicTelemetryPaths.has(parts[0]) ? `/${parts[0]}` : "/:unmatched";
}

export function writeStructuredWebLog(
  record: Readonly<Record<string, unknown>>,
  write: (line: string) => void = (line) => process.stdout.write(line),
): void {
  try {
    write(`${JSON.stringify(record)}\n`);
  } catch {
    // Telemetry is best effort and must never replace an application response.
  }
}

export function cspMode(environment: Environment = process.env): CspMode {
  const value = environment.CSP_MODE?.trim() || "report-only";
  if (value !== "report-only" && value !== "enforce")
    throw new Error("CSP_MODE must be report-only or enforce.");
  return value;
}

export function webSecurityHeaders(
  environment: Environment = process.env,
): WebSecurityHeader[] {
  const mode = cspMode(environment);
  const development = environment.NODE_ENV === "development";
  const policy = [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    `script-src 'self' 'unsafe-inline'${development ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "media-src 'self'",
    "frame-src 'none'",
    ...(development ? [] : ["upgrade-insecure-requests"]),
    "report-uri /api/web/csp-report",
  ].join("; ");
  return [
    {
      key:
        mode === "enforce"
          ? "Content-Security-Policy"
          : "Content-Security-Policy-Report-Only",
      value: policy,
    },
    ...(environment.HSTS_ENABLED === "false"
      ? []
      : [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
        ]),
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value:
        "camera=(), display-capture=(), geolocation=(), microphone=(), payment=(), publickey-credentials-get=(self), usb=()",
    },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
    { key: "Origin-Agent-Cluster", value: "?1" },
    { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  ];
}

export function sanitizedCspReport(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object") return {};
  const root = input as Record<string, unknown>;
  const report =
    root["csp-report"] && typeof root["csp-report"] === "object"
      ? (root["csp-report"] as Record<string, unknown>)
      : root;
  const output: Record<string, string> = {};
  copyToken(report, output, "effective-directive", "effectiveDirective");
  copyToken(report, output, "violated-directive", "violatedDirective");
  copyToken(report, output, "disposition", "disposition");
  copyToken(report, output, "status-code", "statusCode");
  copyOrigin(report, output, "document-uri", "documentOrigin");
  copyOrigin(report, output, "blocked-uri", "blockedOrigin");
  return output;
}

function copyToken(
  source: Record<string, unknown>,
  destination: Record<string, string>,
  sourceKey: string,
  destinationKey: string,
): void {
  const value = source[sourceKey];
  if (typeof value !== "string" && typeof value !== "number") return;
  const token = String(value).slice(0, 128);
  if (/^[a-z0-9'._:/ -]+$/iu.test(token)) destination[destinationKey] = token;
}

function copyOrigin(
  source: Record<string, unknown>,
  destination: Record<string, string>,
  sourceKey: string,
  destinationKey: string,
): void {
  const value = source[sourceKey];
  if (typeof value !== "string") return;
  if (new Set(["inline", "eval", "self", "data", "blob"]).has(value)) {
    destination[destinationKey] = value;
    return;
  }
  try {
    const parsed = new URL(value);
    if (new Set(["http:", "https:"]).has(parsed.protocol))
      destination[destinationKey] = parsed.origin;
  } catch {
    // Malformed browser reports are ignored rather than reflected into logs.
  }
}
