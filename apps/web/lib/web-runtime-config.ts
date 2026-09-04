import {
  readRuntimeReleaseMetadata,
  runtimeReleaseMetadataRequired,
  type RuntimeReleaseMetadata,
} from "@founderhq/api-contract";
import { cspMode, hstsEnabled } from "./security-headers";

export type WebRuntimeMode = "demo" | "live";
export type WebRegistrationMode = "closed" | "invite_only" | "public";

type Environment = Record<string, string | undefined>;

const localCanonicalUrl = "http://127.0.0.1:3100";
const localApiOrigin = "http://127.0.0.1:8787";
const alphaCanonicalOrigin = "https://alpha.trevv.de";
const defaultAuthCookiePrefix = "trevv";
const alphaAuthCookiePrefix = "trevv_alpha";

export type WebAuthCookiePrefix =
  typeof defaultAuthCookiePrefix | typeof alphaAuthCookiePrefix;

export function webRuntimeMode(
  environment: Environment = process.env,
): WebRuntimeMode {
  if (environment.DEMO_MODE === "false") return "live";
  if (environment.DEMO_MODE === "true" && environment.NODE_ENV !== "production")
    return "demo";
  throw new Error(
    environment.NODE_ENV === "production"
      ? "DEMO_MODE must be explicitly false for a production Web runtime."
      : "DEMO_MODE must be explicitly set to true or false.",
  );
}

export function webRegistrationMode(
  environment: Environment = process.env,
): WebRegistrationMode {
  const mode = environment.REGISTRATION_MODE?.trim() || "invite_only";
  if (mode !== "closed" && mode !== "invite_only" && mode !== "public")
    throw new Error(
      "REGISTRATION_MODE must be one of: closed, invite_only, public.",
    );
  if (environment.NODE_ENV === "production" && mode === "public")
    throw new Error(
      "Production REGISTRATION_MODE must be closed or invite_only until public-release gates pass.",
    );
  return mode;
}

export function webReleaseMetadata(
  environment: Environment = process.env,
): RuntimeReleaseMetadata | null {
  return readRuntimeReleaseMetadata(environment, {
    required: runtimeReleaseMetadataRequired(
      environment,
      environment.NODE_ENV === "production",
    ),
  });
}

export function webCanonicalUrl(environment: Environment = process.env): URL {
  return validatedUrl(
    "NEXT_PUBLIC_APP_URL",
    environment.NEXT_PUBLIC_APP_URL ?? localCanonicalUrl,
    environment,
  );
}

export function webApiOrigin(environment: Environment = process.env): URL {
  const legacyApiUrl = environment.NEXT_PUBLIC_API_URL?.replace(
    /\/api\/v1\/?$/,
    "",
  );
  const url = validatedUrl(
    "API_ORIGIN",
    environment.API_ORIGIN ?? legacyApiUrl ?? localApiOrigin,
    environment,
  );
  if (url.pathname !== "/") {
    throw new Error("API_ORIGIN must contain an origin without a path.");
  }
  return url;
}

export function webAuthCookiePrefix(
  environment: Environment = process.env,
): WebAuthCookiePrefix {
  const configured = environment.AUTH_COOKIE_PREFIX?.trim();
  const alphaOrigin =
    webCanonicalUrl(environment).origin === alphaCanonicalOrigin;
  // Unset keeps deriving the name from the canonical origin, so a deployment
  // that never configured a prefix behaves exactly as it did before.
  if (!configured)
    return alphaOrigin ? alphaAuthCookiePrefix : defaultAuthCookiePrefix;
  if (
    configured !== defaultAuthCookiePrefix &&
    configured !== alphaAuthCookiePrefix
  )
    throw new Error(
      `AUTH_COOKIE_PREFIX must be ${defaultAuthCookiePrefix} or ${alphaAuthCookiePrefix}.`,
    );
  // An explicit value wins. One API issues one cookie name across every Web
  // origin it trusts, and a Web build cannot see that list, so the operator
  // states the shared name rather than having it inferred from this origin.
  return configured;
}

export function webSessionCookieNames(
  environment: Environment = process.env,
): readonly [string, string] {
  const prefix = webAuthCookiePrefix(environment);
  return [`${prefix}.session_token`, `__Secure-${prefix}.session_token`];
}

export function validateProductionWebConfiguration(
  environment: Environment = process.env,
): void {
  if (environment.NODE_ENV !== "production") return;
  webRuntimeMode(environment);
  webRegistrationMode(environment);
  requireConfigured("NEXT_PUBLIC_APP_URL", environment);
  requireConfigured("API_ORIGIN", environment);
  requireConfigured("CSP_MODE", environment);
  requireConfigured("HSTS_ENABLED", environment);
  cspMode(environment);
  hstsEnabled(environment);

  const canonical = webCanonicalUrl(environment);
  webApiOrigin(environment);
  webAuthCookiePrefix(environment);

  if (canonical.pathname !== "/") {
    throw new Error(
      "NEXT_PUBLIC_APP_URL must contain an origin without a path.",
    );
  }
}

export function safeReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/app/portfolio";
  }
  try {
    const parsed = new URL(value, "https://trevv.invalid");
    if (parsed.origin !== "https://trevv.invalid") return "/app/portfolio";
    const allowed =
      parsed.pathname.startsWith("/app/") ||
      parsed.pathname === "/onboarding" ||
      parsed.pathname === "/invite/accept" ||
      parsed.pathname === "/select-organization";
    if (!allowed) return "/app/portfolio";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/app/portfolio";
  }
}

function requireConfigured(name: string, environment: Environment): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required in production.`);
  return value;
}

function validatedUrl(
  name: string,
  value: string,
  environment: Environment,
): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute URL.`);
  }
  if (url.username || url.password || url.hash || url.search) {
    throw new Error(`${name} cannot contain credentials, a query, or a hash.`);
  }
  if (environment.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error(`${name} must use HTTPS in production.`);
  }
  if (!new Set(["http:", "https:"]).has(url.protocol)) {
    throw new Error(`${name} must use HTTP or HTTPS.`);
  }
  return url;
}
