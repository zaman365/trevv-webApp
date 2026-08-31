import type {
  AuthCookiePrefix,
  RegistrationMode,
  SmtpMailConfiguration,
} from "@founderhq/auth-server";
import { resolveAuthCookiePrefix } from "@founderhq/auth-server";
import {
  readRuntimeReleaseMetadata,
  runtimeReleaseMetadataRequired,
  type RuntimeReleaseMetadata,
} from "@founderhq/api-contract";
import { validatePostgresDatabaseUrl } from "@founderhq/db";
import { tmpdir } from "node:os";
import { isAbsolute, relative, resolve, sep } from "node:path";

export type RuntimeConfiguration =
  | { mode: "demo" }
  | {
      mode: "live";
      databaseUrl: string;
      authBaseUrl: string;
      authSecret: string;
      webOrigin: string;
      cookiePrefix: AuthCookiePrefix;
      registrationMode: RegistrationMode;
      releaseMetadata: RuntimeReleaseMetadata | null;
      mailFrom: string;
      mailTransport:
        | { kind: "smtp"; configuration: SmtpMailConfiguration }
        | { kind: "test_file"; filePath: string };
      cookieDomain?: string;
      rateLimitBackend: "memory" | "postgres";
      rateLimitHashSecret?: string;
      trustedClientIpHeader?: string;
      errorReportingMode: "disabled" | "external";
      internalMetricsEnabled: boolean;
      testRegistrationBootstrapSecret?: string;
    };

type RuntimeEnvironment = Readonly<Record<string, string | undefined>>;

export function readRuntimeConfiguration(
  environment: RuntimeEnvironment = process.env,
): RuntimeConfiguration {
  const mode = environment.DEMO_MODE?.trim();
  const nodeEnvironment = environment.NODE_ENV?.trim();
  const production = nodeEnvironment === "production";
  if (mode !== "true" && mode !== "false")
    throw new Error("DEMO_MODE must be explicitly set to true or false.");
  if (mode === "true") {
    if (production)
      throw new Error("Production cannot start with DEMO_MODE=true.");
    return { mode: "demo" };
  }
  if (
    !new Set(["development", "test", "production"]).has(nodeEnvironment ?? "")
  )
    throw new Error(
      "NODE_ENV must be explicitly set to development, test, or production when DEMO_MODE=false.",
    );

  const releaseMetadata = readRuntimeReleaseMetadata(environment, {
    required: runtimeReleaseMetadataRequired(environment, production),
  });

  const databaseUrl = required(environment, "DATABASE_URL");
  const authBaseUrl = canonicalOrigin(
    "BETTER_AUTH_URL",
    required(environment, "BETTER_AUTH_URL"),
    production,
  );
  const webOrigin = canonicalOrigin(
    "WEB_ORIGIN",
    required(environment, "WEB_ORIGIN"),
    production,
  );
  const authSecret = required(environment, "BETTER_AUTH_SECRET");
  const cookiePrefix = resolveAuthCookiePrefix(
    optional(environment, "AUTH_COOKIE_PREFIX"),
    [webOrigin],
  );
  validateAuthSecret(authSecret);
  validatePostgresDatabaseUrl(databaseUrl, { production });
  const registrationMode = enumValue(
    environment,
    "REGISTRATION_MODE",
    ["closed", "invite_only", "public"] as const,
    "invite_only",
  );
  if (production && registrationMode === "public")
    throw new Error(
      "Production REGISTRATION_MODE must be closed or invite_only until public-release gates pass.",
    );
  const testRegistrationBootstrapSecret = optional(
    environment,
    "TEST_REGISTRATION_BOOTSTRAP_SECRET",
  );
  if (testRegistrationBootstrapSecret && nodeEnvironment !== "test")
    throw new Error(
      "TEST_REGISTRATION_BOOTSTRAP_SECRET is allowed only when NODE_ENV=test.",
    );
  if (
    testRegistrationBootstrapSecret &&
    testRegistrationBootstrapSecret.length < 32
  )
    throw new Error(
      "TEST_REGISTRATION_BOOTSTRAP_SECRET must contain at least 32 characters.",
    );

  const cookieDomain = optional(environment, "AUTH_COOKIE_DOMAIN");
  validateCookieTopology(authBaseUrl, webOrigin, cookieDomain, production);

  const testMailSinkFile = optional(environment, "MAIL_SINK_FILE");
  if (production && testMailSinkFile)
    throw new Error("Production cannot use MAIL_SINK_FILE.");
  if (testMailSinkFile) validateTestMailSinkPath(testMailSinkFile);
  if (
    testMailSinkFile &&
    [
      "SMTP_HOST",
      "SMTP_PORT",
      "SMTP_SECURE",
      "SMTP_REQUIRE_TLS",
      "SMTP_USERNAME",
      "SMTP_PASSWORD",
    ].some((name) => optional(environment, name))
  )
    throw new Error(
      "MAIL_SINK_FILE and SMTP configuration are mutually exclusive.",
    );

  const smtpSecure = testMailSinkFile
    ? false
    : strictBoolean(environment, "SMTP_SECURE");
  const smtpRequireTls = testMailSinkFile
    ? false
    : strictBoolean(environment, "SMTP_REQUIRE_TLS");
  const smtpUsername = optional(environment, "SMTP_USERNAME");
  const smtpPassword = optional(environment, "SMTP_PASSWORD");
  if (Boolean(smtpUsername) !== Boolean(smtpPassword))
    throw new Error(
      "SMTP_USERNAME and SMTP_PASSWORD must either both be set or both be omitted.",
    );
  if (production && !testMailSinkFile && (!smtpUsername || !smtpPassword))
    throw new Error("Production SMTP requires authenticated credentials.");
  if (production && !testMailSinkFile && !smtpSecure && !smtpRequireTls)
    throw new Error("Production SMTP transport must require TLS.");

  const mailFrom = required(environment, "MAIL_FROM");
  if (!/^[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+$/u.test(mailFrom))
    throw new Error("MAIL_FROM must be a plain email address.");

  const rateLimitBackend = enumValue(
    environment,
    "RATE_LIMIT_BACKEND",
    ["memory", "postgres"] as const,
    production ? undefined : "memory",
  );
  if (production && rateLimitBackend !== "postgres")
    throw new Error(
      "Production requires RATE_LIMIT_BACKEND=postgres for cross-instance enforcement.",
    );
  const rateLimitHashSecret =
    rateLimitBackend === "postgres"
      ? required(environment, "RATE_LIMIT_HASH_SECRET")
      : undefined;
  if (rateLimitHashSecret) validateRateLimitHashSecret(rateLimitHashSecret);
  const trustedClientIpHeader = optional(
    environment,
    "TRUSTED_CLIENT_IP_HEADER",
  )?.toLowerCase();
  if (production && !trustedClientIpHeader)
    throw new Error("TRUSTED_CLIENT_IP_HEADER is required in production.");
  if (
    trustedClientIpHeader &&
    !/^(?:cf-connecting-ip|x-[a-z0-9-]{1,62})$/u.test(trustedClientIpHeader)
  )
    throw new Error(
      "TRUSTED_CLIENT_IP_HEADER must name an explicitly allowed edge header.",
    );
  const errorReportingMode = enumValue(
    environment,
    "ERROR_REPORTING_MODE",
    ["disabled", "external"] as const,
    "disabled",
  );
  const internalMetricsEnabled =
    enumValue(
      environment,
      "INTERNAL_METRICS_ENABLED",
      ["true", "false"] as const,
      production ? "false" : "true",
    ) === "true";
  if (production && internalMetricsEnabled)
    throw new Error(
      "Production INTERNAL_METRICS_ENABLED must remain false until the metrics endpoint is isolated on a private telemetry boundary.",
    );

  return {
    mode: "live",
    databaseUrl,
    authBaseUrl,
    authSecret,
    webOrigin,
    cookiePrefix,
    registrationMode,
    releaseMetadata,
    ...(testRegistrationBootstrapSecret
      ? { testRegistrationBootstrapSecret }
      : {}),
    mailFrom,
    mailTransport: testMailSinkFile
      ? { kind: "test_file", filePath: testMailSinkFile }
      : {
          kind: "smtp",
          configuration: {
            host: required(environment, "SMTP_HOST"),
            port: positiveInteger(environment, "SMTP_PORT"),
            secure: smtpSecure,
            requireTls: smtpRequireTls,
            ...(smtpUsername && smtpPassword
              ? { username: smtpUsername, password: smtpPassword }
              : {}),
          },
        },
    ...(cookieDomain ? { cookieDomain } : {}),
    rateLimitBackend,
    ...(rateLimitHashSecret ? { rateLimitHashSecret } : {}),
    ...(trustedClientIpHeader ? { trustedClientIpHeader } : {}),
    errorReportingMode,
    internalMetricsEnabled,
  };
}

function required(environment: RuntimeEnvironment, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required when DEMO_MODE=false.`);
  return value;
}

function optional(
  environment: RuntimeEnvironment,
  name: string,
): string | undefined {
  return environment[name]?.trim() || undefined;
}

function strictBoolean(environment: RuntimeEnvironment, name: string): boolean {
  const value = required(environment, name);
  if (value !== "true" && value !== "false")
    throw new Error(`${name} must be explicitly set to true or false.`);
  return value === "true";
}

function positiveInteger(
  environment: RuntimeEnvironment,
  name: string,
): number {
  const raw = required(environment, name);
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 65_535)
    throw new Error(`${name} must be an integer between 1 and 65535.`);
  return parsed;
}

function enumValue<const T extends readonly string[]>(
  environment: RuntimeEnvironment,
  name: string,
  choices: T,
  fallback?: T[number],
): T[number] {
  const value = optional(environment, name) ?? fallback;
  if (!value || !choices.includes(value))
    throw new Error(`${name} must be one of: ${choices.join(", ")}.`);
  return value;
}

function canonicalOrigin(
  name: string,
  value: string,
  requireHttps: boolean,
): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute HTTP(S) origin.`);
  }
  if (!new Set(["http:", "https:"]).has(parsed.protocol))
    throw new Error(`${name} must be an absolute HTTP(S) origin.`);
  if (
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  )
    throw new Error(`${name} must contain an origin only, without a path.`);
  if (requireHttps && parsed.protocol !== "https:")
    throw new Error(`${name} must use HTTPS in production.`);
  return parsed.origin;
}

function validateAuthSecret(secret: string): void {
  if (secret.length < 32)
    throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters.");
  if (/replace-with|change-me|example|password/i.test(secret))
    throw new Error("BETTER_AUTH_SECRET must not be a placeholder value.");
}

function validateRateLimitHashSecret(secret: string): void {
  if (secret.length < 32)
    throw new Error(
      "RATE_LIMIT_HASH_SECRET must contain at least 32 characters.",
    );
  if (/replace-with|change-me|example|password/i.test(secret))
    throw new Error("RATE_LIMIT_HASH_SECRET must not be a placeholder value.");
}

function validateCookieTopology(
  authBaseUrl: string,
  webOrigin: string,
  cookieDomain: string | undefined,
  production: boolean,
): void {
  const authHost = new URL(authBaseUrl).hostname;
  const webHost = new URL(webOrigin).hostname;
  if (!cookieDomain) return;
  if (production)
    throw new Error(
      "AUTH_COOKIE_DOMAIN must be unset in production; browser authentication uses host-only cookies through the same-origin Web API boundary.",
    );
  if (
    cookieDomain.includes("://") ||
    cookieDomain.includes("/") ||
    cookieDomain.includes(":")
  )
    throw new Error("AUTH_COOKIE_DOMAIN must be a bare DNS domain.");
  const normalized = cookieDomain.replace(/^\./, "").toLowerCase();
  if (
    !normalized.includes(".") ||
    !normalized
      .split(".")
      .every((label) => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(label))
  )
    throw new Error("AUTH_COOKIE_DOMAIN must be a registrable DNS domain.");
  if (
    !hostBelongsToDomain(authHost, normalized) ||
    !hostBelongsToDomain(webHost, normalized)
  )
    throw new Error(
      "AUTH_COOKIE_DOMAIN must contain both the Web and auth hosts.",
    );
}

function hostBelongsToDomain(host: string, domain: string): boolean {
  const normalizedHost = host.toLowerCase();
  return normalizedHost === domain || normalizedHost.endsWith(`.${domain}`);
}

function validateTestMailSinkPath(filePath: string): void {
  if (!isAbsolute(filePath))
    throw new Error("MAIL_SINK_FILE must be an absolute temporary path.");
  const temporaryRoot = resolve(tmpdir());
  const candidate = resolve(filePath);
  const pathFromTemporaryRoot = relative(temporaryRoot, candidate);
  if (
    pathFromTemporaryRoot === "" ||
    pathFromTemporaryRoot === ".." ||
    pathFromTemporaryRoot.startsWith(`..${sep}`)
  )
    throw new Error(
      "MAIL_SINK_FILE must be inside the system temporary directory.",
    );
}
