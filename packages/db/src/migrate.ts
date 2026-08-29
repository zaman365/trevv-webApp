import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDatabase } from "./index.js";
import { readMigrationRuntimeConfiguration } from "./database-runtime.js";

const { databaseUrl } = readMigrationRuntimeConfiguration();
const { db, close } = createDatabase(databaseUrl);
try {
  await migrate(db, {
    migrationsFolder: new URL("../migrations", import.meta.url).pathname,
  });
} finally {
  await close();
}
