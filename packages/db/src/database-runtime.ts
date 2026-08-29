export type DatabaseRuntimeEnvironment = "development" | "test" | "production";

type RuntimeEnvironment = Readonly<Record<string, string | undefined>>;

export interface MigrationRuntimeConfiguration {
  databaseUrl: string;
  nodeEnvironment: DatabaseRuntimeEnvironment;
}

export function validatePostgresDatabaseUrl(
  value: string,
  options: {
    production: boolean;
    label?: string;
  },
): void {
  const label = options.label ?? "DATABASE_URL";
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid PostgreSQL URL.`);
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:")
    throw new Error(`${label} must use the postgres protocol.`);

  if (!options.production) return;

  const sslModes = parsed.searchParams.getAll("sslmode");
  if (sslModes.length !== 1 || sslModes[0] !== "verify-full")
    throw new Error(
      `Production ${label} must use exactly one sslmode=verify-full so PostgreSQL verifies the server certificate and hostname; sslmode=require is not sufficient.`,
    );
}

export function readMigrationRuntimeConfiguration(
  environment: RuntimeEnvironment = process.env,
): MigrationRuntimeConfiguration {
  const databaseUrl = required(environment, "DATABASE_URL");
  const nodeEnvironment = environment.NODE_ENV?.trim();
  if (!nodeEnvironment || !isDatabaseRuntimeEnvironment(nodeEnvironment))
    throw new Error(
      "NODE_ENV must be explicitly set to development, test, or production before running migrations.",
    );
  validatePostgresDatabaseUrl(databaseUrl, {
    production: nodeEnvironment === "production",
  });
  return { databaseUrl, nodeEnvironment };
}

function required(environment: RuntimeEnvironment, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required to migrate TREVV.`);
  return value;
}

function isDatabaseRuntimeEnvironment(
  value: string,
): value is DatabaseRuntimeEnvironment {
  return value === "development" || value === "test" || value === "production";
}
