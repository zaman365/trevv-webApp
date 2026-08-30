import postgres from "postgres";

export const stagingDatabaseComment = "trevv:environment=staging";

export interface StagingBootstrapInspection {
  databaseName: string;
  databaseComment: string | null;
  nonEmptyTables: readonly { name: string; rows: number }[];
}

export interface StagingBootstrapGuardInput {
  ownerEmail: string;
  confirmation: string;
}

const bootstrapLockName = "trevv:remote-staging-initial-owner";

export function stagingBootstrapConfirmation(
  databaseName: string,
  ownerEmail: string,
): string {
  return `bootstrap:${databaseName}:${ownerEmail.trim().toLowerCase()}`;
}

export function assertStagingBootstrapAllowed(
  inspection: StagingBootstrapInspection,
  input: StagingBootstrapGuardInput,
): void {
  assertStagingBootstrapIdentityAllowed(inspection, input);
  if (inspection.nonEmptyTables.length > 0)
    throw new Error(
      `Initial-owner bootstrap requires an empty application database; non-empty tables: ${inspection.nonEmptyTables
        .map(({ name }) => name)
        .sort()
        .join(", ")}.`,
    );
}

function assertStagingBootstrapIdentityAllowed(
  inspection: Pick<
    StagingBootstrapInspection,
    "databaseName" | "databaseComment"
  >,
  input: StagingBootstrapGuardInput,
): void {
  if (!/(?:^|[_-])staging(?:[_-]|$)/iu.test(inspection.databaseName))
    throw new Error(
      "Initial-owner bootstrap requires a database whose name explicitly contains a staging segment.",
    );
  if (inspection.databaseComment !== stagingDatabaseComment)
    throw new Error(
      `Initial-owner bootstrap requires the exact database comment ${stagingDatabaseComment}.`,
    );
  const expected = stagingBootstrapConfirmation(
    inspection.databaseName,
    input.ownerEmail,
  );
  if (input.confirmation !== expected)
    throw new Error(
      "TREV_STAGING_BOOTSTRAP_CONFIRM must exactly match the actual database name and normalized owner email.",
    );
}

/**
 * Serializes the one-time initial-owner operation and re-checks its persistent
 * staging marker plus complete application-table emptiness while the lock is
 * held. The callback may use other database pools; every invocation of this
 * helper competes for the same PostgreSQL advisory lock first.
 */
export async function withEmptyMarkedStagingDatabase<T>(
  databaseUrl: string,
  input: StagingBootstrapGuardInput,
  operation: (inspection: StagingBootstrapInspection) => Promise<T>,
): Promise<T> {
  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  let locked = false;
  try {
    await sql`select pg_advisory_lock(hashtextextended(${bootstrapLockName}, 0))`;
    locked = true;
    const inspection = await inspectStagingBootstrapDatabase(sql, input);
    assertStagingBootstrapAllowed(inspection, input);
    return await operation(inspection);
  } finally {
    if (locked)
      await sql`select pg_advisory_unlock(hashtextextended(${bootstrapLockName}, 0))`.catch(
        () => undefined,
      );
    await sql.end();
  }
}

async function inspectStagingBootstrapDatabase(
  sql: postgres.Sql,
  input: StagingBootstrapGuardInput,
): Promise<StagingBootstrapInspection> {
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
  // Reject a wrong database before reading any application table. This keeps a
  // mistaken production URL both fail-closed and cheap.
  assertStagingBootstrapIdentityAllowed(
    {
      databaseName: identity.database_name,
      databaseComment: identity.database_comment,
    },
    input,
  );

  const tables = await sql<{ table_name: string }[]>`
    select table_name
    from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
    order by table_name
  `;
  const nonEmptyTables: { name: string; rows: number }[] = [];
  for (const { table_name: tableName } of tables) {
    const quoted = `"${tableName.replaceAll('"', '""')}"`;
    const [row] = await sql.unsafe<{ rows: number }[]>(
      `select 1::int as rows from public.${quoted} limit 1`,
    );
    if (row) nonEmptyTables.push({ name: tableName, rows: 1 });
  }

  return {
    databaseName: identity.database_name,
    databaseComment: identity.database_comment,
    nonEmptyTables,
  };
}
