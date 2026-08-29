import type { SmtpMailConfiguration } from "@founderhq/auth-server";
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
      mailFrom: string;
      mailTransport:
        | { kind: "smtp"; configuration: SmtpMailConfiguration }
        | { kind: "test_file"; filePath: string };
      cookieDomain?: string;
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
  validateAuthSecret(authSecret);
  validatePostgresDatabaseUrl(databaseUrl, { production });

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

  return {
    mode: "live",
    databaseUrl,
    authBaseUrl,
    authSecret,
    webOrigin,
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

function validateCookieTopology(
  authBaseUrl: string,
  webOrigin: string,
  cookieDomain: string | undefined,
  production: boolean,
): void {
  const authHost = new URL(authBaseUrl).hostname;
  const webHost = new URL(webOrigin).hostname;
  if (!cookieDomain) {
    if (production && authHost !== webHost)
      throw new Error(
        "AUTH_COOKIE_DOMAIN is required when production Web and auth use different hosts.",
      );
    return;
  }
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
