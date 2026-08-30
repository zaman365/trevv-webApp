import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  stagingBootstrapConfirmation,
  stagingDatabaseComment,
  withEmptyMarkedStagingDatabase,
} from "../src/index.js";
import {
  createTemporaryDatabase,
  migrateCurrent,
  requireIntegrationDatabaseUrl,
  type TemporaryDatabase,
} from "./database-test-helper.js";

describe("remote staging bootstrap database guard", () => {
  let temporary: TemporaryDatabase;
  let databaseName: string;

  beforeAll(async () => {
    temporary = await createTemporaryDatabase(requireIntegrationDatabaseUrl(), {
      namePrefix: "trevv_staging_it",
    });
    databaseName = decodeURIComponent(new URL(temporary.url).pathname.slice(1));
    await migrateCurrent(temporary.url);
    const sql = postgres(temporary.url, { max: 1, prepare: false });
    try {
      await sql.unsafe(
        `comment on database "${databaseName}" is '${stagingDatabaseComment}'`,
      );
    } finally {
      await sql.end();
    }
  });

  afterAll(async () => temporary?.drop());

  it("allows one empty marked staging operation, then rejects persistent data", async () => {
    const ownerEmail = "initial-owner@staging.trevv.test";
    const input = {
      ownerEmail,
      confirmation: stagingBootstrapConfirmation(databaseName, ownerEmail),
    };

    await expect(
      withEmptyMarkedStagingDatabase(
        temporary.url,
        input,
        async (inspection) => {
          expect(inspection.databaseName).toBe(databaseName);
          const sql = postgres(temporary.url, { max: 1, prepare: false });
          try {
            await sql.unsafe(
              "create table public.staging_bootstrap_guard_probe (id integer primary key)",
            );
            await sql.unsafe(
              "insert into public.staging_bootstrap_guard_probe (id) values (1)",
            );
          } finally {
            await sql.end();
          }
        },
      ),
    ).resolves.toBeUndefined();

    await expect(
      withEmptyMarkedStagingDatabase(temporary.url, input, async () => {
        throw new Error("the guarded callback must not run twice");
      }),
    ).rejects.toThrow(/non-empty tables: staging_bootstrap_guard_probe/u);
  });
});
