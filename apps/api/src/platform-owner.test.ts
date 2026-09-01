import { describe, expect, it } from "vitest";
import { readPlatformOwnerConfiguration } from "./platform-owner.js";

const environment = {
  TREV_RUNTIME_ENVIRONMENT: "staging",
  NODE_ENV: "production",
  DEMO_MODE: "false",
  DATABASE_URL:
    "postgresql://trevv:test@db.trevv.test:5432/trevv_remote_staging?sslmode=verify-full",
  REGISTRATION_MODE: "invite_only",
  RELEASE_ID: "release-2026.09.01.1",
  RELEASE_GIT_SHA: "a".repeat(40),
  RELEASE_IMAGE_ID: `sha256:${"b".repeat(64)}`,
  TREV_PLATFORM_OWNER_EMAIL: "Owner@Example.Test",
  TREV_STAGING_PLATFORM_OWNER_CONFIRM:
    "platform-owner:trevv_remote_staging:owner@example.test",
} as const;

describe("remote staging platform-owner configuration", () => {
  it("accepts only a live invite-only production artifact", () => {
    expect(readPlatformOwnerConfiguration(environment)).toEqual({
      databaseUrl: environment.DATABASE_URL,
      email: "Owner@Example.Test",
      confirmation: environment.TREV_STAGING_PLATFORM_OWNER_CONFIRM,
    });
  });

  it("rejects ambiguous, demo, public-registration, and mutable runtimes", () => {
    expect(() =>
      readPlatformOwnerConfiguration({
        ...environment,
        TREV_RUNTIME_ENVIRONMENT: undefined,
      }),
    ).toThrow(/explicitly equal staging/u);
    expect(() =>
      readPlatformOwnerConfiguration({ ...environment, DEMO_MODE: "true" }),
    ).toThrow(/DEMO_MODE=false/u);
    expect(() =>
      readPlatformOwnerConfiguration({
        ...environment,
        REGISTRATION_MODE: "public",
      }),
    ).toThrow(/invite[_-]only/u);
    expect(() =>
      readPlatformOwnerConfiguration({
        ...environment,
        RELEASE_IMAGE_ID: undefined,
      }),
    ).toThrow(/configured together|required/u);
    expect(() =>
      readPlatformOwnerConfiguration({
        ...environment,
        DATABASE_URL: environment.DATABASE_URL.replace(
          "sslmode=verify-full",
          "sslmode=require",
        ),
      }),
    ).toThrow(/sslmode=verify-full/u);
  });
});
