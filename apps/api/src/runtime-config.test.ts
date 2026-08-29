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
    });
  });

  it("requires an explicit runtime environment for live mode", () => {
    expect(() =>
      readRuntimeConfiguration({
        ...validLiveEnvironment,
        NODE_ENV: undefined,
      }),
    ).toThrow(/NODE_ENV must be explicitly set/);
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

  it("requires a valid shared cookie domain for split production hosts", () => {
    expect(() =>
      readRuntimeConfiguration({
        ...productionEnvironment(),
        AUTH_COOKIE_DOMAIN: undefined,
      }),
    ).toThrow(/AUTH_COOKIE_DOMAIN is required/);

    expect(() =>
      readRuntimeConfiguration({
        ...productionEnvironment(),
        AUTH_COOKIE_DOMAIN: "example.com",
      }),
    ).toThrow(/contain both/);

    expect(() =>
      readRuntimeConfiguration({
        ...productionEnvironment(),
        AUTH_COOKIE_DOMAIN: "de",
      }),
    ).toThrow(/registrable DNS domain/);

    expect(readRuntimeConfiguration(productionEnvironment())).toMatchObject({
      mode: "live",
      cookieDomain: "trevv.de",
    });
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
    AUTH_COOKIE_DOMAIN: "trevv.de",
    SMTP_HOST: "smtp.trevv.de",
    SMTP_PORT: "587",
    SMTP_REQUIRE_TLS: "true",
    SMTP_USERNAME: "trevv-mailer",
    SMTP_PASSWORD: "not-a-real-credential",
  } as const;
}
