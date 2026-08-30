import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { readMigrationRuntimeConfiguration } from "./database-runtime.js";
import { stagingDatabaseComment } from "./staging-bootstrap.js";

type RuntimeEnvironment = Readonly<Record<string, string | undefined>>;

export interface StagingMigrationConfiguration {
  databaseUrl: string;
  releaseId: string;
  migrationHead: string;
  confirmation: string;
}

export interface StagingMigrationInspection {
  databaseName: string;
  databaseComment: string | null;
}

export interface StagingMigrationResult {
  status: "migrated" | "no_op";
  environment: "staging";
  databaseName: string;
  releaseId: string;
  migrationHead: string;
  appliedMigrations: number;
  migrationCount: number;
}

const migrationLockName = "trevv:guarded-staging-migration";
const releaseIdPattern = /^[a-z0-9][a-z0-9._+-]{7,127}$/u;
const migrationHeadPattern = /^\d{4}_[a-z0-9_]+$/u;
const migrationsDirectory = fileURLToPath(
  new URL("../migrations", import.meta.url),
);

export const currentStagingMigrationHead = readCurrentMigrationHead();

export function stagingMigrationConfirmation(
  databaseName: string,
  releaseId: string,
  migrationHead = currentStagingMigrationHead,
): string {
  return `migrate:${databaseName}:${releaseId}:${migrationHead}`;
}

export function readStagingMigrationConfiguration(
  environment: RuntimeEnvironment = process.env,
): StagingMigrationConfiguration {
  if (environment.TREV_RUNTIME_ENVIRONMENT?.trim() !== "staging")
    throw new Error(
      "TREV_RUNTIME_ENVIRONMENT must explicitly equal staging for the guarded migration entrypoint.",
    );
  if (environment.NODE_ENV?.trim() !== "production")
    throw new Error(
      "The guarded staging migration must run the production-mode artifact.",
    );

  const { databaseUrl } = readMigrationRuntimeConfiguration(environment);
  const releaseId = required(environment, "RELEASE_ID");
  if (!releaseIdPattern.test(releaseId))
    throw new Error(
      "RELEASE_ID must be an immutable manifest-compatible release ID.",
    );

  return {
    databaseUrl,
    releaseId,
    migrationHead: currentStagingMigrationHead,
    confirmation: requiredExact(environment, "TREV_STAGING_MIGRATION_CONFIRM"),
  };
}

export function assertStagingMigrationAllowed(
  inspection: StagingMigrationInspection,
  configuration: Pick<
    StagingMigrationConfiguration,
    "releaseId" | "migrationHead" | "confirmation"
  >,
): void {
  if (!/(?:^|[_-])staging(?:[_-]|$)/iu.test(inspection.databaseName))
    throw new Error(
      "Guarded migration requires a database whose actual name explicitly contains a staging segment.",
    );
  if (inspection.databaseComment !== stagingDatabaseComment)
    throw new Error(
      `Guarded migration requires the exact persistent database comment ${stagingDatabaseComment}.`,
    );
  if (!releaseIdPattern.test(configuration.releaseId))
    throw new Error("The guarded migration release ID is invalid.");
  if (!migrationHeadPattern.test(configuration.migrationHead))
    throw new Error("The guarded migration head is invalid.");

  const expected = stagingMigrationConfirmation(
    inspection.databaseName,
    configuration.releaseId,
    configuration.migrationHead,
  );
  if (configuration.confirmation !== expected)
    throw new Error(
      "TREV_STAGING_MIGRATION_CONFIRM must exactly bind the actual database name, release ID, and packaged migration head.",
    );
}

/**
 * Applies the packaged Drizzle migrations only after a persistent, server-read
 * staging identity and an operator-supplied release confirmation agree. The
 * advisory lock serializes this guarded entrypoint across operator processes;
 * the identity is read and checked while that lock is held and before Drizzle
 * can create its journal or execute application DDL.
 */
export async function applyGuardedStagingMigrations(
  configuration: StagingMigrationConfiguration,
): Promise<StagingMigrationResult> {
  const guard = postgres(configuration.databaseUrl, {
    max: 1,
    prepare: false,
  });
  let locked = false;
  try {
    await guard`select pg_advisory_lock(hashtextextended(${migrationLockName}, 0))`;
    locked = true;
    const inspection = await inspectStagingMigrationDatabase(guard);
    assertStagingMigrationAllowed(inspection, configuration);

    const before = await migrationJournalCount(guard);
    const target = postgres(configuration.databaseUrl, {
      max: 1,
      prepare: false,
    });
    try {
      await migrate(drizzle(target), { migrationsFolder: migrationsDirectory });
    } finally {
      await target.end();
    }
    const after = await migrationJournalCount(guard);
    if (after < before)
      throw new Error(
        "The migration journal regressed during staging migration.",
      );

    return {
      status: after === before ? "no_op" : "migrated",
      environment: "staging",
      databaseName: inspection.databaseName,
      releaseId: configuration.releaseId,
      migrationHead: configuration.migrationHead,
      appliedMigrations: after - before,
      migrationCount: after,
    };
  } finally {
    if (locked)
      await guard`select pg_advisory_unlock(hashtextextended(${migrationLockName}, 0))`.catch(
        () => undefined,
      );
    await guard.end();
  }
}

async function inspectStagingMigrationDatabase(
  sql: postgres.Sql,
): Promise<StagingMigrationInspection> {
  const [identity] = await sql<
    { database_name: string; database_comment: string | null }[]
  >`
    select
      current_database() as database_name,
      shobj_description(oid, 'pg_database') as database_comment
    from pg_database
    where datname = current_database()
  `;
  if (!identity)
    throw new Error("The current PostgreSQL database identity is unavailable.");
  return {
    databaseName: identity.database_name,
    databaseComment: identity.database_comment,
  };
}

async function migrationJournalCount(sql: postgres.Sql): Promise<number> {
  const [identity] = await sql<{ relation_name: string | null }[]>`
    select to_regclass('drizzle.__drizzle_migrations')::text as relation_name
  `;
  if (!identity?.relation_name) return 0;
  const [count] = await sql<{ count: number }[]>`
    select count(*)::int as count from drizzle.__drizzle_migrations
  `;
  return count?.count ?? 0;
}

function readCurrentMigrationHead(): string {
  const journal = JSON.parse(
    readFileSync(
      fileURLToPath(
        new URL("../migrations/meta/_journal.json", import.meta.url),
      ),
      "utf8",
    ),
  ) as { entries?: { tag?: unknown }[] };
  const tag = journal.entries?.at(-1)?.tag;
  if (typeof tag !== "string" || !migrationHeadPattern.test(tag))
    throw new Error(
      "The packaged Drizzle migration journal has no valid head.",
    );
  return tag;
}

function required(environment: RuntimeEnvironment, name: string): string {
  const value = environment[name]?.trim();
  if (!value)
    throw new Error(`${name} is required for guarded staging migration.`);
  return value;
}

function requiredExact(environment: RuntimeEnvironment, name: string): string {
  const value = environment[name];
  if (!value?.trim())
    throw new Error(`${name} is required for guarded staging migration.`);
  return value;
}
