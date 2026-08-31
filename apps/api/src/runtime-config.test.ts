import { describe, expect, it } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readRuntimeConfiguration } from "./runtime-config.js";

const validLiveEnvironment = {
  DEMO_MODE: "false",
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://trevv:test@127.0.0.1:5432/trevv",
  BETTER_AUTH_URL: "http://127.0.0.1:8787",
  BETTER_AUTH_SECRET: "a-secure-random-value-with-more-than-32-characters",
  WEB_ORIGIN: "http://127.0.0.1:3100",
  MAIL_FROM: "no-reply@trevv.test",
  SMTP_HOST: "127.0.0.1",
  SMTP_PORT: "1025",
  SMTP_SECURE: "false",
  SMTP_REQUIRE_TLS: "false",
} as const;
const releaseEnvironment = {
  RELEASE_ID: "release-2026.08.30.1",
  RELEASE_GIT_SHA: "a".repeat(40),
  RELEASE_IMAGE_ID: `sha256:${"b".repeat(64)}`,
} as const;

describe("live runtime configuration", () => {
  it("requires an explicit mode and rejects demo production", () => {
    expect(() => readRuntimeConfiguration({})).toThrow(/DEMO_MODE/);
    expect(() =>
      readRuntimeConfiguration({ DEMO_MODE: "true", NODE_ENV: "production" }),
    ).toThrow("Production cannot start with DEMO_MODE=true.");
    expect(
      readRuntimeConfiguration({ DEMO_MODE: "true", NODE_ENV: "test" }),
    ).toEqual({ mode: "demo" });
  });

  it("accepts explicit development PostgreSQL and mail-sink transport", () => {
    expect(readRuntimeConfiguration(validLiveEnvironment)).toMatchObject({
      mode: "live",
      authBaseUrl: "http://127.0.0.1:8787",
      webOrigin: "http://127.0.0.1:3100",
      mailTransport: {
        kind: "smtp",
        configuration: {
          host: "127.0.0.1",
          port: 1025,
          secure: false,
          requireTls: false,
        },
      },
      rateLimitBackend: "memory",
      errorReportingMode: "disabled",
      internalMetricsEnabled: true,
      registrationMode: "invite_only",
      cookiePrefix: "trevv",
    });
  });

  it("defaults to invite-only, permits an explicit close, and never permits public production registration", () => {
    expect(readRuntimeConfiguration(validLiveEnvironment)).toMatchObject({
      mode: "live",
      registrationMode: "invite_only",
    });
    expect(
      readRuntimeConfiguration({
        ...validLiveEnvironment,
        REGISTRATION_MODE: "closed",
      }),
    ).toMatchObject({ mode: "live", registrationMode: "closed" });
    expect(
      readRuntimeConfiguration({
        ...validLiveEnvironment,
        REGISTRATION_MODE: "public",
      }),
    ).toMatchObject({ mode: "live", registrationMode: "public" });
    expect(
      readRuntimeConfiguration({
        ...validLiveEnvironment,
        REGISTRATION_MODE: "invite_only",
      }),
    ).toMatchObject({ mode: "live", registrationMode: "invite_only" });
    expect(() =>
      readRuntimeConfiguration({
        ...productionEnvironment(),
        REGISTRATION_MODE: "public",
      }),
    ).toThrow(/must be closed or invite_only/);
  });

  it("allows the first-owner smoke bootstrap secret only in test mode", () => {
    const secret = "test-topology-registration-bootstrap-secret";
    expect(
      readRuntimeConfiguration({
        ...validLiveEnvironment,
        NODE_ENV: "test",
        TEST_REGISTRATION_BOOTSTRAP_SECRET: secret,
      }),
    ).toMatchObject({
      mode: "live",
      registrationMode: "invite_only",
      testRegistrationBootstrapSecret: secret,
    });
    expect(() =>
      readRuntimeConfiguration({
        ...validLiveEnvironment,
        TEST_REGISTRATION_BOOTSTRAP_SECRET: secret,
      }),
    ).toThrow(/allowed only when NODE_ENV=test/);
    expect(() =>
      readRuntimeConfiguration({
        ...validLiveEnvironment,
        NODE_ENV: "test",
        TEST_REGISTRATION_BOOTSTRAP_SECRET: "too-short",
      }),
    ).toThrow(/at least 32 characters/);
  });

  it("requires an explicit runtime environment for live mode", () => {
    expect(() =>
      readRuntimeConfiguration({
        ...validLiveEnvironment,
        NODE_ENV: undefined,
      }),
    ).toThrow(/NODE_ENV must be explicitly set/);
  });

  it("enforces release identity for production-shaped test topology", () => {
    expect(() =>
      readRuntimeConfiguration({
        ...validLiveEnvironment,
        RELEASE_METADATA_REQUIRED: "true",
      }),
    ).toThrow(/RELEASE_ID.*required for this runtime/);
    expect(
      readRuntimeConfiguration({
        ...validLiveEnvironment,
        RELEASE_METADATA_REQUIRED: "true",
        RELEASE_ID: "release-2026.08.30.1",
        RELEASE_GIT_SHA: "a".repeat(40),
        RELEASE_IMAGE_ID: `sha256:${"b".repeat(64)}`,
      }),
    ).toMatchObject({
      mode: "live",
      releaseMetadata: { releaseId: "release-2026.08.30.1" },
    });
    expect(() =>
      readRuntimeConfiguration({
        ...productionEnvironment(),
        RELEASE_ID: undefined,
        RELEASE_GIT_SHA: undefined,
        RELEASE_IMAGE_ID: undefined,
      }),
    ).toThrow(/RELEASE_ID.*required for this runtime/);
  });

  it("rejects weak or placeholder authentication secrets", () => {
    expect(() =>
      readRuntimeConfiguration({
        ...validLiveEnvironment,
        BETTER_AUTH_SECRET: "too-short",
      }),
    ).toThrow(/at least 32/);
    expect(() =>
      readRuntimeConfiguration({
        ...validLiveEnvironment,
        BETTER_AUTH_SECRET: "replace-with-at-least-32-random-characters-please",
      }),
    ).toThrow(/placeholder/);
  });

  it("requires canonical HTTPS and encrypted transports in production", () => {
    expect(() =>
      readRuntimeConfiguration({
        ...validLiveEnvironment,
        NODE_ENV: "production",
        ...releaseEnvironment,
      }),
    ).toThrow(/BETTER_AUTH_URL must use HTTPS/);

    expect(() =>
      readRuntimeConfiguration({
        ...productionEnvironment(),
        DATABASE_URL: "postgresql://trevv:test@db.trevv.de:5432/trevv",
      }),
    ).toThrow(/sslmode=verify-full/);

    for (const sslmode of ["require", "verify-ca"]) {
      expect(() =>
        readRuntimeConfiguration({
          ...productionEnvironment(),
          DATABASE_URL: `postgresql://trevv:test@db.trevv.de:5432/trevv?sslmode=${sslmode}`,
        }),
      ).toThrow(/sslmode=verify-full/);
    }

    expect(() =>
      readRuntimeConfiguration({
        ...productionEnvironment(),
        SMTP_REQUIRE_TLS: "false",
      }),
    ).toThrow(/must require TLS/);
  });

  it("requires host-only cookies for split production hosts", () => {
    expect(
      readRuntimeConfiguration({
        ...productionEnvironment(),
        AUTH_COOKIE_DOMAIN: undefined,
      }),
    ).toMatchObject({
      mode: "live",
      rateLimitBackend: "postgres",
      rateLimitHashSecret: "private-rate-limit-hmac-material-2026",
      trustedClientIpHeader: "x-trevv-client-ip",
      registrationMode: "invite_only",
      internalMetricsEnabled: false,
    });

    expect(() =>
      readRuntimeConfiguration({
        ...productionEnvironment(),
        AUTH_COOKIE_DOMAIN: "trevv.de",
      }),
    ).toThrow(/must be unset in production/);

    expect(() =>
      readRuntimeConfiguration({
        ...validLiveEnvironment,
        AUTH_COOKIE_DOMAIN: "de",
      }),
    ).toThrow(/registrable DNS domain/);
  });

  it("isolates the alpha cookie namespace from every other Web origin", () => {
    expect(
      readRuntimeConfiguration({
        ...productionEnvironment(),
        WEB_ORIGIN: "https://alpha.trevv.de",
        AUTH_COOKIE_PREFIX: "trevv_alpha",
      }),
    ).toMatchObject({
      mode: "live",
      webOrigin: "https://alpha.trevv.de",
      cookiePrefix: "trevv_alpha",
    });

    expect(() =>
      readRuntimeConfiguration({
        ...productionEnvironment(),
        WEB_ORIGIN: "https://alpha.trevv.de",
        AUTH_COOKIE_PREFIX: undefined,
      }),
    ).toThrow(/must explicitly equal trevv_alpha/u);
    expect(() =>
      readRuntimeConfiguration({
        ...productionEnvironment(),
        WEB_ORIGIN: "https://alpha.trevv.de",
        AUTH_COOKIE_PREFIX: "trevv",
      }),
    ).toThrow(/must explicitly equal trevv_alpha/u);
    expect(() =>
      readRuntimeConfiguration({
        ...productionEnvironment(),
        AUTH_COOKIE_PREFIX: "trevv_alpha",
      }),
    ).toThrow(/reserved for https:\/\/alpha\.trevv\.de/u);
    expect(() =>
      readRuntimeConfiguration({
        ...validLiveEnvironment,
        AUTH_COOKIE_PREFIX: "trevv-alpha",
      }),
    ).toThrow(/must be trevv or trevv_alpha/u);
  });

  it("requires honest, complete SMTP configuration", () => {
    expect(() =>
      readRuntimeConfiguration({
        ...validLiveEnvironment,
        SMTP_PORT: "70000",
      }),
    ).toThrow(/between 1 and 65535/);
    expect(() =>
      readRuntimeConfiguration({
        ...validLiveEnvironment,
        SMTP_USERNAME: "trevv",
      }),
    ).toThrow(/both be set/);
    expect(() =>
      readRuntimeConfiguration({
        ...validLiveEnvironment,
        SMTP_SECURE: "sometimes",
      }),
    ).toThrow(/true or false/);
    expect(() =>
      readRuntimeConfiguration({
        ...validLiveEnvironment,
        MAIL_FROM: "not-an-email-address",
      }),
    ).toThrow(/plain email address/);
  });

  it("keeps the public metrics endpoint disabled in production", () => {
    expect(readRuntimeConfiguration(productionEnvironment())).toMatchObject({
      mode: "live",
      internalMetricsEnabled: false,
    });
    expect(() =>
      readRuntimeConfiguration({
        ...productionEnvironment(),
        INTERNAL_METRICS_ENABLED: "true",
      }),
    ).toThrow(/private telemetry boundary/u);
  });

  it("requires shared request protection in production", () => {
    expect(
      readRuntimeConfiguration({
        ...productionEnvironment(),
        TRUSTED_CLIENT_IP_HEADER: "cf-connecting-ip",
      }),
    ).toMatchObject({
      mode: "live",
      trustedClientIpHeader: "cf-connecting-ip",
    });
    expect(() =>
      readRuntimeConfiguration({
        ...productionEnvironment(),
        RATE_LIMIT_BACKEND: "memory",
      }),
    ).toThrow(/cross-instance enforcement/);
    expect(() =>
      readRuntimeConfiguration({
        ...productionEnvironment(),
        TRUSTED_CLIENT_IP_HEADER: undefined,
      }),
    ).toThrow(/TRUSTED_CLIENT_IP_HEADER is required/);
    expect(() =>
      readRuntimeConfiguration({
        ...productionEnvironment(),
        RATE_LIMIT_HASH_SECRET: undefined,
      }),
    ).toThrow(/RATE_LIMIT_HASH_SECRET is required/);
    expect(() =>
      readRuntimeConfiguration({
        ...productionEnvironment(),
        RATE_LIMIT_HASH_SECRET: "short",
      }),
    ).toThrow(/at least 32/);
    expect(() =>
      readRuntimeConfiguration({
        ...productionEnvironment(),
        TRUSTED_CLIENT_IP_HEADER: "forwarded",
      }),
    ).toThrow(/allowed edge header/);
    expect(() =>
      readRuntimeConfiguration({
        ...productionEnvironment(),
        ERROR_REPORTING_MODE: "sometimes",
      }),
    ).toThrow(/ERROR_REPORTING_MODE/);
  });

  it("permits only an explicit private temporary mail sink outside production", () => {
    const testSinkPath = join(tmpdir(), "trevv-auth-mail.jsonl");
    expect(
      readRuntimeConfiguration({
        ...validLiveEnvironment,
        SMTP_HOST: undefined,
        SMTP_PORT: undefined,
        SMTP_SECURE: undefined,
        SMTP_REQUIRE_TLS: undefined,
        MAIL_SINK_FILE: testSinkPath,
      }),
    ).toMatchObject({
      mode: "live",
      mailTransport: {
        kind: "test_file",
        filePath: testSinkPath,
      },
    });
    expect(() =>
      readRuntimeConfiguration({
        ...validLiveEnvironment,
        MAIL_SINK_FILE: "relative-mail.jsonl",
      }),
    ).toThrow(/absolute temporary path/);
    expect(() =>
      readRuntimeConfiguration({
        ...validLiveEnvironment,
        MAIL_SINK_FILE: testSinkPath,
      }),
    ).toThrow(/mutually exclusive/);
    expect(() =>
      readRuntimeConfiguration({
        ...productionEnvironment(),
        MAIL_SINK_FILE: testSinkPath,
      }),
    ).toThrow(/Production cannot use/);
  });
});

function productionEnvironment() {
  return {
    ...validLiveEnvironment,
    NODE_ENV: "production",
    DATABASE_URL:
      "postgresql://trevv:test@db.trevv.de:5432/trevv?sslmode=verify-full",
    BETTER_AUTH_URL: "https://api.trevv.de",
    WEB_ORIGIN: "https://trevv.de",
    SMTP_HOST: "smtp.trevv.de",
    SMTP_PORT: "587",
    SMTP_REQUIRE_TLS: "true",
    SMTP_USERNAME: "trevv-mailer",
    SMTP_PASSWORD: "not-a-real-credential",
    RATE_LIMIT_BACKEND: "postgres",
    RATE_LIMIT_HASH_SECRET: "private-rate-limit-hmac-material-2026",
    TRUSTED_CLIENT_IP_HEADER: "x-trevv-client-ip",
    ERROR_REPORTING_MODE: "disabled",
    ...releaseEnvironment,
  } as const;
}
