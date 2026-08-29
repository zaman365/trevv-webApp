import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { createDatabase } from "../src/index.js";

export interface TemporaryDatabase {
  url: string;
  drop: () => Promise<void>;
}

export function requireIntegrationDatabaseUrl(): string {
  const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl)
    throw new Error(
      "PostgreSQL integration tests require TEST_DATABASE_URL or DATABASE_URL.",
    );
  return databaseUrl;
}

export async function createTemporaryDatabase(
  sourceUrl = requireIntegrationDatabaseUrl(),
): Promise<TemporaryDatabase> {
  const databaseName = `trevv_it_${process.pid}_${randomBytes(6).toString("hex")}`;
  const adminUrl = new URL(sourceUrl);
  adminUrl.pathname = "/postgres";
  const targetUrl = new URL(sourceUrl);
  targetUrl.pathname = `/${databaseName}`;
  const admin = postgres(adminUrl.toString(), { max: 1, prepare: false });
  await admin.unsafe(`CREATE DATABASE "${databaseName}"`);
  return {
    url: targetUrl.toString(),
    async drop() {
      await admin`
        select pg_terminate_backend(pid)
        from pg_stat_activity
        where datname = ${databaseName}
          and pid <> pg_backend_pid()
      `;
      await admin.unsafe(`DROP DATABASE IF EXISTS "${databaseName}"`);
      await admin.end();
    },
  };
}

export async function migrateCurrent(databaseUrl: string): Promise<void> {
  const { db, close } = createDatabase(databaseUrl);
  try {
    await migrate(db, {
      migrationsFolder: fileURLToPath(
        new URL("../migrations", import.meta.url),
      ),
    });
  } finally {
    await close();
  }
}

export async function applyMigrationFiles(
  databaseUrl: string,
  names: string[],
): Promise<void> {
  const client = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    for (const name of names) {
      const source = await readFile(
        fileURLToPath(new URL(`../migrations/${name}`, import.meta.url)),
        "utf8",
      );
      for (const statement of source.split("--> statement-breakpoint")) {
        const sql = statement.trim();
        if (sql) await client.unsafe(sql);
      }
    }
  } finally {
    await client.end();
  }
}
