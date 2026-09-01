import { readRuntimeReleaseMetadata } from "@founderhq/api-contract";
import {
  assignSinglePlatformOwner,
  createDatabase,
  validatePostgresDatabaseUrl,
} from "@founderhq/db";
import { pathToFileURL } from "node:url";

type Environment = Readonly<Record<string, string | undefined>>;

export interface PlatformOwnerConfiguration {
  databaseUrl: string;
  email: string;
  confirmation: string;
}

export function readPlatformOwnerConfiguration(
  environment: Environment = process.env,
): PlatformOwnerConfiguration {
  if (environment.TREV_RUNTIME_ENVIRONMENT?.trim() !== "staging")
    throw new Error(
      "TREV_RUNTIME_ENVIRONMENT must explicitly equal staging for platform-owner assignment.",
    );
  if (environment.NODE_ENV?.trim() !== "production")
    throw new Error(
      "Platform-owner assignment must run the production-mode artifact.",
    );
  if (environment.DEMO_MODE?.trim() !== "false")
    throw new Error(
      "Platform-owner assignment requires DEMO_MODE=false for the live runtime.",
    );
  if (environment.REGISTRATION_MODE?.trim() !== "invite_only")
    throw new Error(
      "Platform-owner assignment requires the live invite-only runtime.",
    );
  readRuntimeReleaseMetadata(environment, { required: true });
  const databaseUrl = required(environment, "DATABASE_URL");
  validatePostgresDatabaseUrl(databaseUrl, { production: true });
  return {
    databaseUrl,
    email: required(environment, "TREV_PLATFORM_OWNER_EMAIL"),
    confirmation: required(environment, "TREV_STAGING_PLATFORM_OWNER_CONFIRM"),
  };
}

export async function assignRemoteStagingPlatformOwner(
  configuration: PlatformOwnerConfiguration,
) {
  const database = createDatabase(configuration.databaseUrl);
  try {
    return await assignSinglePlatformOwner(database.db, {
      email: configuration.email,
      confirmation: configuration.confirmation,
    });
  } finally {
    await database.close();
  }
}

function required(environment: Environment, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function main() {
  const result = await assignRemoteStagingPlatformOwner(
    readPlatformOwnerConfiguration(),
  );
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

const isExecutable =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isExecutable)
  main().catch((error: unknown) => {
    process.stderr.write(
      `${JSON.stringify({
        status: "failed",
        operation: "remote-staging-platform-owner-assignment",
        error:
          error instanceof Error
            ? error.message
            : "Unknown platform-owner assignment error.",
      })}\n`,
    );
    process.exitCode = 1;
  });
