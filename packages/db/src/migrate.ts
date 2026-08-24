import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDatabase } from "./index.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl)
  throw new Error("DATABASE_URL is required to migrate FounderHQ.");
const { db, close } = createDatabase(databaseUrl);
await migrate(db, {
  migrationsFolder: new URL("../migrations", import.meta.url).pathname,
});
await close();
