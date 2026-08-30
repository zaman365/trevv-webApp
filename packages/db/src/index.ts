import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export function createDatabase(databaseUrl: string) {
  const client = postgres(databaseUrl, { max: 10, prepare: false });
  return { db: drizzle(client, { schema }), close: () => client.end() };
}

export * from "./schema.js";
export * from "./repositories.js";
export * from "./identity-repositories.js";
export * from "./collaboration-repositories.js";
export * from "./privacy-repositories.js";
export * from "./worker-repositories.js";
export * from "./database-runtime.js";
export * from "./rate-limit-repository.js";
export * from "./staging-bootstrap.js";
export * from "./staging-migration.js";
