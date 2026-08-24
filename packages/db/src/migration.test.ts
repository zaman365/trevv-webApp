import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(
  new URL("../migrations/0002_trevv_commercial_delta.sql", import.meta.url),
);

describe("TREVV commercial migration", () => {
  const migration = readFileSync(migrationPath, "utf8");

  it("backfills a default Portfolio before making Hub ownership required", () => {
    const insertPortfolio = migration.indexOf('INSERT INTO "portfolios"');
    const attachHubs = migration.indexOf('UPDATE "hubs" h');
    const requirePortfolio = migration.indexOf(
      'ALTER TABLE "hubs" ALTER COLUMN "portfolio_id" SET NOT NULL',
    );

    expect(insertPortfolio).toBeGreaterThan(-1);
    expect(attachHubs).toBeGreaterThan(insertPortfolio);
    expect(requirePortfolio).toBeGreaterThan(attachHubs);
  });

  it("preserves existing Organization memberships at Portfolio scope", () => {
    expect(migration).toContain('INSERT INTO "portfolio_members"');
    expect(migration).toContain('FROM "memberships" m');
  });
});
