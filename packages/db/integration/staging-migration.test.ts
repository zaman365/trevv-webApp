import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  applyGuardedStagingMigrations,
  currentStagingMigrationHead,
  stagingDatabaseComment,
  stagingMigrationConfirmation,
} from "../src/index.js";
import {
  createTemporaryDatabase,
  requireIntegrationDatabaseUrl,
  type TemporaryDatabase,
} from "./database-test-helper.js";

const releaseId = "rehearsal-baseline-2026.08.30.1";

describe("guarded staging migration database entrypoint", () => {
  let staging: TemporaryDatabase;
  let productionLooking: TemporaryDatabase;
  let stagingName: string;
  let productionLookingName: string;

  beforeAll(async () => {
    const source = requireIntegrationDatabaseUrl();
    staging = await createTemporaryDatabase(source, {
      namePrefix: "trevv_staging_migrate_it",
    });
    productionLooking = await createTemporaryDatabase(source, {
      namePrefix: "trevv_prod_migrate_it",
    });
    stagingName = databaseName(staging.url);
    productionLookingName = databaseName(productionLooking.url);
  });

  afterAll(async () => {
    await Promise.all([staging?.drop(), productionLooking?.drop()]);
  });

  it("rejects a wrongly marked database before creating the migration journal", async () => {
    await setDatabaseComment(
      staging.url,
      stagingName,
      "trevv:environment=production",
    );
    await expect(
      applyGuardedStagingMigrations(configuration(staging.url, stagingName)),
    ).rejects.toThrow(/exact persistent database comment/u);
    await expect(migrationJournalExists(staging.url)).resolves.toBe(false);
  });

  it("rejects a production-looking database even with a staging marker", async () => {
    await markAsStaging(productionLooking.url, productionLookingName);
    await expect(
      applyGuardedStagingMigrations(
        configuration(productionLooking.url, productionLookingName),
      ),
    ).rejects.toThrow(/actual name explicitly contains a staging segment/u);
    await expect(migrationJournalExists(productionLooking.url)).resolves.toBe(
      false,
    );
  });

  it("rejects a wrong cohort confirmation before creating the migration journal", async () => {
    await markAsStaging(staging.url, stagingName);
    await expect(
      applyGuardedStagingMigrations({
        ...configuration(staging.url, stagingName),
        confirmation: `migrate:${stagingName}:another-release:${currentStagingMigrationHead}`,
      }),
    ).rejects.toThrow(/must exactly bind/u);
    await expect(migrationJournalExists(staging.url)).resolves.toBe(false);
  });

  it("migrates a clean marked staging database and is a no-op on rerun", async () => {
    const input = configuration(staging.url, stagingName);
    const first = await applyGuardedStagingMigrations(input);
    expect(first).toMatchObject({
      status: "migrated",
      environment: "staging",
      databaseName: stagingName,
      releaseId,
      migrationHead: currentStagingMigrationHead,
    });
    expect(first.appliedMigrations).toBeGreaterThan(0);
    expect(first.migrationCount).toBe(first.appliedMigrations);

    const second = await applyGuardedStagingMigrations(input);
    expect(second).toEqual({
      ...first,
      status: "no_op",
      appliedMigrations: 0,
    });
  });
});

function configuration(databaseUrl: string, actualDatabaseName: string) {
  return {
    databaseUrl,
    releaseId,
    migrationHead: currentStagingMigrationHead,
    confirmation: stagingMigrationConfirmation(actualDatabaseName, releaseId),
  };
}

function databaseName(databaseUrl: string): string {
  return decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
}

async function markAsStaging(
  databaseUrl: string,
  actualDatabaseName: string,
): Promise<void> {
  await setDatabaseComment(
    databaseUrl,
    actualDatabaseName,
    stagingDatabaseComment,
  );
}

async function setDatabaseComment(
  databaseUrl: string,
  actualDatabaseName: string,
  comment: string,
): Promise<void> {
  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    await sql.unsafe(
      `comment on database "${actualDatabaseName}" is '${comment}'`,
    );
  } finally {
    await sql.end();
  }
}

async function migrationJournalExists(databaseUrl: string): Promise<boolean> {
  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    const [result] = await sql<{ exists: boolean }[]>`
      select to_regclass('drizzle.__drizzle_migrations') is not null as exists
    `;
    return result?.exists ?? false;
  } finally {
    await sql.end();
  }
}
