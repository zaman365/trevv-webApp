import { describe, expect, it } from "vitest";
import { readStagingBootstrapConfiguration } from "./staging-bootstrap.js";

const productionEnvironment = {
  TREV_RUNTIME_ENVIRONMENT: "staging",
  NODE_ENV: "production",
  DEMO_MODE: "false",
  DATABASE_URL:
    "postgresql://trevv:test@db.trevv.test:5432/trevv_remote_staging?sslmode=verify-full",
  BETTER_AUTH_URL: "https://staging.trevv.test",
  BETTER_AUTH_SECRET: "secure-staging-auth-material-with-32-characters",
  WEB_ORIGIN: "https://staging.trevv.test",
  REGISTRATION_MODE: "invite_only",
  MAIL_FROM: "no-reply@staging.trevv.test",
  SMTP_HOST: "smtp.staging.trevv.test",
  SMTP_PORT: "587",
  SMTP_SECURE: "false",
  SMTP_REQUIRE_TLS: "true",
  SMTP_USERNAME: "staging-mailer",
  SMTP_PASSWORD: "test-fixture-not-a-real-credential",
  RATE_LIMIT_BACKEND: "postgres",
  RATE_LIMIT_HASH_SECRET: "staging-rate-limit-material-with-32-characters",
  TRUSTED_CLIENT_IP_HEADER: "x-trevv-client-ip",
  ERROR_REPORTING_MODE: "disabled",
  RELEASE_ID: "rehearsal-baseline-2026.08.30.1",
  RELEASE_GIT_SHA: "a".repeat(40),
  RELEASE_IMAGE_ID: `sha256:${"b".repeat(64)}`,
  TREV_BOOTSTRAP_OWNER_NAME: "Staging Owner",
  TREV_BOOTSTRAP_OWNER_EMAIL: "Owner@Staging.Trevv.Test",
  TREV_BOOTSTRAP_OWNER_PASSWORD: "fixture-password-1234",
  TREV_BOOTSTRAP_ORGANIZATION_NAME: "TREVV Staging",
  TREV_BOOTSTRAP_ORGANIZATION_SLUG: "trevv-staging",
  TREV_BOOTSTRAP_WORKSPACE_NAME: "Staging Operations",
  TREV_BOOTSTRAP_WORKSPACE_SLUG: "staging-operations",
  TREV_STAGING_BOOTSTRAP_CONFIRM:
    "bootstrap:trevv_remote_staging:owner@staging.trevv.test",
} as const;

describe("remote staging owner bootstrap configuration", () => {
  it("accepts a complete production-mode, invite-only staging configuration", () => {
    expect(
      readStagingBootstrapConfiguration(productionEnvironment),
    ).toMatchObject({
      releaseId: "rehearsal-baseline-2026.08.30.1",
      cookiePrefix: "trevv",
      owner: {
        name: "Staging Owner",
        email: "owner@staging.trevv.test",
      },
      onboarding: {
        step: 5,
        organizationSlug: "trevv-staging",
        workspaceType: "business",
        workspaceColor: "#315c75",
        blueprintKey: "blank",
      },
    });
  });

  it("rejects ambiguous environments and non-production artifacts", () => {
    expect(() =>
      readStagingBootstrapConfiguration({
        ...productionEnvironment,
        TREV_RUNTIME_ENVIRONMENT: undefined,
      }),
    ).toThrow(/explicitly equal staging/u);
    expect(() =>
      readStagingBootstrapConfiguration({
        ...productionEnvironment,
        NODE_ENV: "test",
      }),
    ).toThrow(/production-mode artifact/u);
  });

  it("never opens public registration or accepts test bootstrap configuration", () => {
    expect(() =>
      readStagingBootstrapConfiguration({
        ...productionEnvironment,
        REGISTRATION_MODE: "public",
      }),
    ).toThrow(/closed or invite_only/u);
    expect(() =>
      readStagingBootstrapConfiguration({
        ...productionEnvironment,
        TEST_REGISTRATION_BOOTSTRAP_SECRET:
          "test-only-header-bootstrap-material-with-32-characters",
      }),
    ).toThrow(/allowed only when NODE_ENV=test/u);
  });

  it("does not trim the owner password and validates onboarding through the shared contract", () => {
    const password = " leading-and-trailing-secret ";
    expect(
      readStagingBootstrapConfiguration({
        ...productionEnvironment,
        TREV_BOOTSTRAP_OWNER_PASSWORD: password,
      }).owner.password,
    ).toBe(password);
    expect(() =>
      readStagingBootstrapConfiguration({
        ...productionEnvironment,
        TREV_BOOTSTRAP_WORKSPACE_COLOR: "blue",
      }),
    ).toThrow();
  });
});
