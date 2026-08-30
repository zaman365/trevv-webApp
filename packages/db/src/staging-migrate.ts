import {
  applyGuardedStagingMigrations,
  readStagingMigrationConfiguration,
} from "./staging-migration.js";

const result = await applyGuardedStagingMigrations(
  readStagingMigrationConfiguration(),
);

process.stdout.write(`${JSON.stringify(result)}\n`);
