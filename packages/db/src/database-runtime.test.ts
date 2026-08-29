import { describe, expect, it } from "vitest";
import {
  readMigrationRuntimeConfiguration,
  validatePostgresDatabaseUrl,
} from "./database-runtime.js";

describe("PostgreSQL runtime configuration", () => {
  it("allows plaintext only for explicit development and test migrations", () => {
    expect(
      readMigrationRuntimeConfiguration({
        NODE_ENV: "test",
        DATABASE_URL: "postgresql://trevv:test@127.0.0.1:5432/trevv",
      }),
    ).toEqual({
      nodeEnvironment: "test",
      databaseUrl: "postgresql://trevv:test@127.0.0.1:5432/trevv",
    });
  });

  it("requires an explicit migration environment", () => {
    expect(() =>
      readMigrationRuntimeConfiguration({
        DATABASE_URL: "postgresql://trevv:test@127.0.0.1:5432/trevv",
      }),
    ).toThrow(/NODE_ENV must be explicitly set/);
  });

  it.each(["disable", "require", "verify-ca"])(
    "rejects production sslmode=%s because it does not guarantee certificate and hostname verification",
    (sslmode) => {
      expect(() =>
        readMigrationRuntimeConfiguration({
          NODE_ENV: "production",
          DATABASE_URL: `postgresql://trevv:test@db.trevv.test:5432/trevv?sslmode=${sslmode}`,
        }),
      ).toThrow(/sslmode=verify-full/);
    },
  );

  it("accepts exactly one production sslmode=verify-full", () => {
    expect(
      readMigrationRuntimeConfiguration({
        NODE_ENV: "production",
        DATABASE_URL:
          "postgresql://trevv:test@db.trevv.test:5432/trevv?sslmode=verify-full",
      }),
    ).toMatchObject({ nodeEnvironment: "production" });
  });

  it("rejects duplicate sslmode values instead of validating a different value than the driver uses", () => {
    expect(() =>
      validatePostgresDatabaseUrl(
        "postgresql://trevv:test@db.trevv.test:5432/trevv?sslmode=verify-full&sslmode=require",
        { production: true },
      ),
    ).toThrow(/exactly one sslmode=verify-full/);
  });
});
