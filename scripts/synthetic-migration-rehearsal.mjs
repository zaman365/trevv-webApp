#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const baselineMigration = "0004_workspace_domain_rename.sql";
const adminUrl = new URL(required("STAGING_DATABASE_ADMIN_URL"));
const databaseName = required("STAGING_FOUNDATION_UPGRADE_DATABASE");
const failureInjection =
  process.env.STAGING_FOUNDATION_FAILURE_INJECTION?.trim();

if (failureInjection && failureInjection !== "after_fixture")
  throw new Error(
    "STAGING_FOUNDATION_FAILURE_INJECTION supports only after_fixture.",
  );
if (!/^trevv_[a-z0-9_]{3,48}_synthetic_rehearsal$/u.test(databaseName))
  throw new Error(
    "STAGING_FOUNDATION_UPGRADE_DATABASE must be an isolated trevv_*_synthetic_rehearsal database.",
  );
if (adminUrl.pathname === `/${databaseName}`)
  throw new Error(
    "The admin URL must not point at the disposable target database.",
  );

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(scriptDirectory, "..");
const migrationsDirectory = join(repositoryRoot, "packages/db/migrations");
const fixturePath = join(
  repositoryRoot,
  "release/fixtures/synthetic-production-v0004.sql",
);
const fixture = await readFile(fixturePath, "utf8");
const fixtureSha256 = `sha256:${createHash("sha256").update(fixture).digest("hex")}`;
assertSyntheticFixture(fixture);

const migrationFiles = (await readdir(migrationsDirectory))
  .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/u.test(name))
  .sort();
const baselineIndex = migrationFiles.indexOf(baselineMigration);
if (baselineIndex < 0)
  throw new Error(`Baseline migration ${baselineMigration} does not exist.`);
if (baselineIndex === migrationFiles.length - 1)
  throw new Error("The rehearsal requires migrations newer than the baseline.");

const journal = JSON.parse(
  await readFile(join(migrationsDirectory, "meta/_journal.json"), "utf8"),
);
const journalFiles = journal.entries.map((entry) => `${entry.tag}.sql`);
if (JSON.stringify(journalFiles) !== JSON.stringify(migrationFiles))
  throw new Error(
    "The SQL migration files and Drizzle journal are not an exact ordered match.",
  );

const requireFromDatabasePackage = createRequire(
  new URL("../packages/db/package.json", import.meta.url),
);
const postgresEntry = requireFromDatabasePackage.resolve("postgres");
const drizzleEntry = requireFromDatabasePackage.resolve(
  "drizzle-orm/postgres-js",
);
const migratorEntry = requireFromDatabasePackage.resolve(
  "drizzle-orm/postgres-js/migrator",
);
const [{ default: postgres }, { drizzle }, { migrate }] = await Promise.all([
  import(pathToFileURL(postgresEntry).href),
  import(pathToFileURL(drizzleEntry).href),
  import(pathToFileURL(migratorEntry).href),
]);

const admin = postgres(adminUrl.toString(), { max: 1, prepare: false });
const targetUrl = new URL(adminUrl);
targetUrl.pathname = `/${databaseName}`;
let target;
let baselineDirectory;
let result;
let primaryError;

try {
  await dropDisposableDatabase(admin, databaseName);
  await admin.unsafe(`create database "${databaseName}"`);
  target = postgres(targetUrl.toString(), { max: 1, prepare: false });

  baselineDirectory = await createBaselineMigrationsDirectory();
  await migrate(drizzle(target), { migrationsFolder: baselineDirectory });
  await assertMigrationJournalCount(target, baselineIndex + 1);
  await target.unsafe(fixture);

  const before = await readInvariantCounts(target);
  assertExpectedCounts(before, "pre-migration");
  await assertFixtureShape(target);
  if (failureInjection === "after_fixture")
    throw new Error("Injected synthetic rehearsal failure after fixture load.");

  await migrate(drizzle(target), { migrationsFolder: migrationsDirectory });
  await assertMigrationJournalCount(target, migrationFiles.length);
  const journalBeforeNoop = await migrationJournalRows(target);
  await migrate(drizzle(target), { migrationsFolder: migrationsDirectory });
  const journalAfterNoop = await migrationJournalRows(target);
  if (JSON.stringify(journalAfterNoop) !== JSON.stringify(journalBeforeNoop))
    throw new Error("A second migration pass was not a no-op.");

  const after = await readInvariantCounts(target);
  assertExpectedCounts(after, "post-migration");
  if (JSON.stringify(after) !== JSON.stringify(before))
    throw new Error("A stable fixture row count changed during migration.");
  await assertCurrentSchema(target);
  await assertCrossTenantWriteRejected(target);

  result = {
    schemaVersion: 1,
    classification: "synthetic-non-production",
    releaseDecision: "NO_GO",
    status: "PASS",
    fixture: {
      path: "release/fixtures/synthetic-production-v0004.sql",
      sha256: fixtureSha256,
      fictionalDataOnly: true,
      tenantCount: 2,
    },
    migration: {
      baseline: baselineMigration.replace(/\.sql$/u, ""),
      current: migrationFiles.at(-1).replace(/\.sql$/u, ""),
      appliedCount: migrationFiles.length - baselineIndex - 1,
      journalEntries: journalAfterNoop.length,
      secondPass: "no-op",
      strategy: "additive-forward-only",
      downMigrationUsed: false,
    },
    invariants: {
      preMigration: before,
      postMigration: after,
      crossTenantWrite: "rejected-without-residue",
      sharedWorkspaceSlugPreservedPerTenant: true,
    },
    rollbackAndForwardFix: {
      disposableDatabaseCleanup: "required-and-fail-loud",
      injectedFailurePoint: "after_fixture",
      databaseRollbackMethod: "none; rehearsal target is discarded",
      productionDatabasePolicy:
        "forward-fix unless a separately verified restore decision is authorized",
      applicationRollbackPolicy:
        "roll Web, API, and worker as one previous-release cohort only after compatibility proof",
    },
    limitations: [
      "This is synthetic local/CI evidence, not a sanitized production backup.",
      "This does not prove production restore, availability, legal, security-review, or customer gates.",
      "This record cannot authorize a production release.",
    ],
  };
} catch (error) {
  primaryError = error;
}

const cleanupErrors = [];
if (target) {
  try {
    await target.end({ timeout: 5 });
  } catch (error) {
    cleanupErrors.push(
      new Error("Could not close the synthetic rehearsal connection.", {
        cause: error,
      }),
    );
  }
}
try {
  await dropDisposableDatabase(admin, databaseName);
} catch (error) {
  cleanupErrors.push(
    new Error(`Could not remove rehearsal database ${databaseName}.`, {
      cause: error,
    }),
  );
}
try {
  await admin.end({ timeout: 5 });
} catch (error) {
  cleanupErrors.push(
    new Error("Could not close the rehearsal admin connection.", {
      cause: error,
    }),
  );
}
if (baselineDirectory) {
  try {
    await rm(baselineDirectory, { recursive: true, force: true });
  } catch (error) {
    cleanupErrors.push(
      new Error("Could not remove the temporary migration journal.", {
        cause: error,
      }),
    );
  }
}

if (primaryError || cleanupErrors.length > 0) {
  const errors = [primaryError, ...cleanupErrors].filter(Boolean);
  if (errors.length === 1) throw errors[0];
  throw new AggregateError(errors, "Synthetic rehearsal or cleanup failed.");
}
process.stdout.write(`${JSON.stringify(result)}\n`);

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function assertSyntheticFixture(sql) {
  if (!sql.includes("Classification: synthetic non-production data"))
    throw new Error(
      "The fixture is missing its synthetic-data classification.",
    );
  if (!sql.includes("_synthetic_rehearsal"))
    throw new Error("The fixture is missing its disposable-database guard.");
  const emails = [...sql.matchAll(/'([^']+@[^']+)'/gu)].map(
    (match) => match[1],
  );
  if (
    emails.length === 0 ||
    emails.some((email) => !email.endsWith("@trevv.test"))
  )
    throw new Error(
      "Every fixture email must use the reserved trevv.test domain.",
    );
  for (const forbidden of [
    "encrypted_credentials",
    "provider_customer_id",
    "token_hash",
  ])
    if (sql.toLowerCase().includes(forbidden))
      throw new Error(`Synthetic fixture must not include ${forbidden}.`);
}

async function createBaselineMigrationsDirectory() {
  const directory = await mkdtemp(
    join(tmpdir(), "trevv-foundation-migrations-"),
  );
  try {
    await mkdir(join(directory, "meta"));
    for (const name of migrationFiles.slice(0, baselineIndex + 1))
      await copyFile(join(migrationsDirectory, name), join(directory, name));
    await writeFile(
      join(directory, "meta/_journal.json"),
      `${JSON.stringify({ ...journal, entries: journal.entries.slice(0, baselineIndex + 1) }, null, 2)}\n`,
      "utf8",
    );
    return directory;
  } catch (error) {
    await rm(directory, { recursive: true, force: true }).catch(
      (cleanupError) => {
        throw new AggregateError(
          [error, cleanupError],
          "Could not construct or clean the baseline migration journal.",
        );
      },
    );
    throw error;
  }
}

async function readInvariantCounts(database) {
  const [counts] = await database`
    select
      (select count(*)::int from organizations where id like 'org-synthetic-%') as organizations,
      (select count(*)::int from app_users where id like 'user-synthetic-%') as users,
      (select count(*)::int from memberships where organization_id like 'org-synthetic-%') as memberships,
      (select count(*)::int from portfolios where organization_id like 'org-synthetic-%') as portfolios,
      (select count(*)::int from workspaces where organization_id like 'org-synthetic-%') as workspaces,
      (select count(*)::int from boards where organization_id like 'org-synthetic-%') as boards,
      (select count(*)::int from work_items where organization_id like 'org-synthetic-%') as work_items,
      (select count(*)::int from item_dependencies where organization_id like 'org-synthetic-%') as dependencies,
      (select count(*)::int from comments where organization_id like 'org-synthetic-%') as comments,
      (select count(*)::int from inbox_items where organization_id like 'org-synthetic-%') as inbox_items,
      (select count(*)::int from attention_signals where organization_id like 'org-synthetic-%') as attention_signals,
      (select count(*)::int from waiting_states where organization_id like 'org-synthetic-%') as waiting_states,
      (select count(*)::int from decision_outcomes where organization_id like 'org-synthetic-%') as decision_outcomes,
      (select count(*)::int from workspace_snapshots where organization_id like 'org-synthetic-%') as workspace_snapshots,
      (select count(*)::int from workspace_updates where organization_id like 'org-synthetic-%') as workspace_updates,
      (select count(*)::int from review_rituals where organization_id like 'org-synthetic-%') as review_rituals,
      (select count(*)::int from conversations where organization_id like 'org-synthetic-%') as conversations,
      (select count(*)::int from conversation_participants where organization_id like 'org-synthetic-%') as participants,
      (select count(*)::int from conversation_messages where organization_id like 'org-synthetic-%') as messages,
      (select count(*)::int from audit_logs where organization_id like 'org-synthetic-%') as audit_logs
  `;
  return counts;
}

function assertExpectedCounts(actual, stage) {
  const expected = {
    organizations: 2,
    users: 4,
    memberships: 4,
    portfolios: 2,
    workspaces: 2,
    boards: 2,
    work_items: 6,
    dependencies: 2,
    comments: 2,
    inbox_items: 2,
    attention_signals: 2,
    waiting_states: 2,
    decision_outcomes: 2,
    workspace_snapshots: 2,
    workspace_updates: 2,
    review_rituals: 2,
    conversations: 2,
    participants: 4,
    messages: 2,
    audit_logs: 2,
  };
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(
      `Unexpected ${stage} fixture counts: ${JSON.stringify(actual)}.`,
    );
}

async function assertFixtureShape(database) {
  const [shape] = await database`
    select
      count(distinct organization_id)::int as tenant_count,
      count(*) filter (where slug = 'launch')::int as shared_slug_count
    from workspaces
    where organization_id like 'org-synthetic-%'
  `;
  if (shape?.tenant_count !== 2 || shape?.shared_slug_count !== 2)
    throw new Error(
      "The fixture does not preserve overlapping tenant-local slugs.",
    );
}

async function assertCurrentSchema(database) {
  const [state] = await database`
    select
      to_regclass('public.hubs')::text as retired_hubs,
      to_regclass('public.teams')::text as teams,
      to_regclass('public.team_rooms')::text as team_rooms,
      to_regclass('public.collaboration_events')::text as collaboration_events,
      to_regclass('public.data_lifecycle_requests')::text as lifecycle_requests,
      to_regclass('public.api_rate_limit_windows')::text as rate_limits,
      to_regclass('public.registration_invitation_claims')::text as invitation_claims,
      (
        select count(*)::int from decision_outcomes
        where organization_id like 'org-synthetic-%' and workspace_id is not null
      ) as scoped_decisions,
      (
        select count(*)::int from conversation_messages
        where organization_id like 'org-synthetic-%'
          and workspace_id is not null
          and client_message_id is not null
          and expires_at is not null
      ) as migrated_messages,
      (
        select count(*)::int from outbox_events
        where id in ('outbox-synthetic-alpha', 'outbox-synthetic-beta')
          and request_id = 'legacy:' || id
          and dedup_key = 'legacy:' || id
      ) as migrated_outbox
  `;
  if (
    state?.retired_hubs !== null ||
    state?.teams !== "teams" ||
    state?.team_rooms !== "team_rooms" ||
    state?.collaboration_events !== "collaboration_events" ||
    state?.lifecycle_requests !== "data_lifecycle_requests" ||
    state?.rate_limits !== "api_rate_limit_windows" ||
    state?.invitation_claims !== "registration_invitation_claims" ||
    state?.scoped_decisions !== 2 ||
    state?.migrated_messages !== 2 ||
    state?.migrated_outbox !== 2
  )
    throw new Error(
      `Current-schema invariant failed: ${JSON.stringify(state)}.`,
    );
}

async function assertCrossTenantWriteRejected(database) {
  let rejected = false;
  try {
    await database.begin(async (transaction) => {
      await transaction`
        insert into item_dependencies (
          organization_id, item_id, depends_on_item_id, relation
        ) values (
          'org-synthetic-alpha', 'item-synthetic-alpha-task',
          'item-synthetic-beta-task', 'depends_on'
        )
      `;
    });
  } catch (error) {
    rejected = error instanceof Error;
  }
  if (!rejected)
    throw new Error("A cross-tenant dependency write unexpectedly succeeded.");
  const [residue] = await database`
    select count(*)::int as count
    from item_dependencies
    where organization_id = 'org-synthetic-alpha'
      and depends_on_item_id = 'item-synthetic-beta-task'
  `;
  if (residue?.count !== 0)
    throw new Error("The rejected cross-tenant write left database residue.");
}

async function assertMigrationJournalCount(database, expected) {
  const rows = await migrationJournalRows(database);
  if (rows.length !== expected)
    throw new Error(
      `Expected ${expected} migration journal entries, received ${rows.length}.`,
    );
}

async function migrationJournalRows(database) {
  return database`
    select id, hash, created_at
    from drizzle.__drizzle_migrations
    order by id
  `;
}

async function dropDisposableDatabase(database, targetName) {
  if (!/^trevv_[a-z0-9_]{3,48}_synthetic_rehearsal$/u.test(targetName))
    throw new Error(`Refusing to drop non-rehearsal database ${targetName}.`);
  await database.unsafe(
    `select pg_terminate_backend(pid) from pg_stat_activity where datname = '${targetName}' and pid <> pg_backend_pid()`,
  );
  await database.unsafe(`drop database if exists "${targetName}"`);
}
