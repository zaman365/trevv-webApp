import { describe, expect, it } from "vitest";
import {
  assertStagingBootstrapAllowed,
  stagingBootstrapConfirmation,
  stagingDatabaseComment,
} from "./staging-bootstrap.js";

const allowed = {
  databaseName: "trevv_remote_staging_eu",
  databaseComment: stagingDatabaseComment,
  nonEmptyTables: [],
} as const;

describe("remote staging bootstrap guard", () => {
  it("requires a persistent staging identity, empty tables, and exact operator confirmation", () => {
    expect(() =>
      assertStagingBootstrapAllowed(allowed, {
        ownerEmail: "Owner@Example.test",
        confirmation: stagingBootstrapConfirmation(
          allowed.databaseName,
          "owner@example.test",
        ),
      }),
    ).not.toThrow();
  });

  it("rejects a production-looking database even when the caller labels it staging", () => {
    expect(() =>
      assertStagingBootstrapAllowed(
        { ...allowed, databaseName: "trevv_production" },
        {
          ownerEmail: "owner@example.test",
          confirmation: "bootstrap:trevv_production:owner@example.test",
        },
      ),
    ).toThrow(/name explicitly contains a staging segment/u);
  });

  it("rejects a missing or misleading persistent database marker", () => {
    for (const databaseComment of [null, "staging", "trevv:environment=prod"])
      expect(() =>
        assertStagingBootstrapAllowed(
          { ...allowed, databaseComment },
          {
            ownerEmail: "owner@example.test",
            confirmation: stagingBootstrapConfirmation(
              allowed.databaseName,
              "owner@example.test",
            ),
          },
        ),
      ).toThrow(/exact database comment/u);
  });

  it("rejects any non-empty application table", () => {
    expect(() =>
      assertStagingBootstrapAllowed(
        {
          ...allowed,
          nonEmptyTables: [{ name: "user", rows: 1 }],
        },
        {
          ownerEmail: "owner@example.test",
          confirmation: stagingBootstrapConfirmation(
            allowed.databaseName,
            "owner@example.test",
          ),
        },
      ),
    ).toThrow(/non-empty tables: user/u);
  });

  it("binds confirmation to the actual database and normalized owner email", () => {
    expect(() =>
      assertStagingBootstrapAllowed(allowed, {
        ownerEmail: "another-owner@example.test",
        confirmation: stagingBootstrapConfirmation(
          allowed.databaseName,
          "owner@example.test",
        ),
      }),
    ).toThrow(/must exactly match/u);
  });
});
