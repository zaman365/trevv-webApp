import { describe, expect, it } from "vitest";
import {
  assertStagingMigrationAllowed,
  currentStagingMigrationHead,
  readStagingMigrationConfiguration,
  stagingMigrationConfirmation,
} from "./staging-migration.js";
import { stagingDatabaseComment } from "./staging-bootstrap.js";

const releaseId = "rehearsal-baseline-2026.08.30.1";
const allowed = {
  databaseName: "trevv_remote_staging_eu",
  databaseComment: stagingDatabaseComment,
} as const;
const environment = {
  TREV_RUNTIME_ENVIRONMENT: "staging",
  NODE_ENV: "production",
  DATABASE_URL:
    "postgresql://trevv:test@db.trevv.test:5432/trevv_remote_staging?sslmode=verify-full",
  RELEASE_ID: releaseId,
  TREV_STAGING_MIGRATION_CONFIRM: stagingMigrationConfirmation(
    allowed.databaseName,
    releaseId,
  ),
} as const;

describe("guarded staging migration", () => {
  it("reads an explicitly staging, production-mode migration cohort", () => {
    expect(readStagingMigrationConfiguration(environment)).toEqual({
      databaseUrl: environment.DATABASE_URL,
      releaseId,
      migrationHead: currentStagingMigrationHead,
      confirmation: environment.TREV_STAGING_MIGRATION_CONFIRM,
    });
  });

  it("rejects ambiguous runtime environments before database access", () => {
    for (const [name, candidate] of [
      [
        "missing staging runtime",
        { ...environment, TREV_RUNTIME_ENVIRONMENT: undefined },
      ],
      [
        "production runtime",
        { ...environment, TREV_RUNTIME_ENVIRONMENT: "production" },
      ],
      ["non-production artifact", { ...environment, NODE_ENV: "test" }],
    ] as const) {
      expect(() => readStagingMigrationConfiguration(candidate), name).toThrow(
        /staging|production-mode/u,
      );
    }
  });

  it("rejects invalid or missing cohort inputs", () => {
    expect(() =>
      readStagingMigrationConfiguration({
        ...environment,
        RELEASE_ID: "latest",
      }),
    ).toThrow(/immutable manifest-compatible/u);
    expect(() =>
      readStagingMigrationConfiguration({
        ...environment,
        TREV_STAGING_MIGRATION_CONFIRM: undefined,
      }),
    ).toThrow(/TREV_STAGING_MIGRATION_CONFIRM is required/u);
    expect(() =>
      readStagingMigrationConfiguration({
        ...environment,
        DATABASE_URL: environment.DATABASE_URL.replace(
          "sslmode=verify-full",
          "sslmode=require",
        ),
      }),
    ).toThrow(/must use exactly one sslmode=verify-full/u);
  });

  it("requires the actual staging-looking database name and persistent marker", () => {
    expect(() =>
      assertStagingMigrationAllowed(
        { ...allowed, databaseName: "trevv_production" },
        {
          releaseId,
          migrationHead: currentStagingMigrationHead,
          confirmation: stagingMigrationConfirmation(
            "trevv_production",
            releaseId,
          ),
        },
      ),
    ).toThrow(/actual name explicitly contains a staging segment/u);

    for (const databaseComment of [null, "staging", "trevv:environment=prod"])
      expect(() =>
        assertStagingMigrationAllowed(
          { ...allowed, databaseComment },
          {
            releaseId,
            migrationHead: currentStagingMigrationHead,
            confirmation: environment.TREV_STAGING_MIGRATION_CONFIRM,
          },
        ),
      ).toThrow(/exact persistent database comment/u);
  });

  it("binds confirmation to database, release, and packaged migration head", () => {
    for (const confirmation of [
      ` ${environment.TREV_STAGING_MIGRATION_CONFIRM}`,
      stagingMigrationConfirmation("another_staging", releaseId),
      stagingMigrationConfirmation(allowed.databaseName, "another-release"),
      stagingMigrationConfirmation(
        allowed.databaseName,
        releaseId,
        "9999_future_head",
      ),
    ])
      expect(() =>
        assertStagingMigrationAllowed(allowed, {
          releaseId,
          migrationHead: currentStagingMigrationHead,
          confirmation,
        }),
      ).toThrow(/must exactly bind/u);
  });
});
