import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(
  new URL("../migrations/0002_trevv_commercial_delta.sql", import.meta.url),
);
const workspaceRenameMigrationPath = fileURLToPath(
  new URL("../migrations/0004_workspace_domain_rename.sql", import.meta.url),
);
const persistentDataPlaneMigrationPath = fileURLToPath(
  new URL("../migrations/0005_persistent_data_plane.sql", import.meta.url),
);
const normalizedIdentityEmailMigrationPath = fileURLToPath(
  new URL("../migrations/0007_normalized_app_user_email.sql", import.meta.url),
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

describe("Workspace domain rename migration", () => {
  const migration = readFileSync(workspaceRenameMigrationPath, "utf8");

  it("renames the existing domain objects without dropping their data", () => {
    expect(migration).toContain('ALTER TABLE "hubs" RENAME TO "workspaces"');
    expect(migration).toContain(
      'ALTER TABLE "work_items" RENAME COLUMN "hub_id" TO "workspace_id"',
    );
    expect(migration).toContain(
      `ALTER TYPE "public"."conversation_kind" RENAME VALUE 'hub' TO 'workspace'`,
    );
    expect(migration).toContain(
      `ALTER TYPE "public"."membership_role" RENAME VALUE 'hub_lead' TO 'workspace_lead'`,
    );
    expect(migration).not.toContain('DROP TABLE "hubs"');
    expect(migration).not.toContain('DROP TYPE "public"."conversation_kind"');
    expect(migration).not.toContain('DROP TYPE "public"."membership_role"');
  });
});

describe("Persistent data plane migration", () => {
  const migration = readFileSync(persistentDataPlaneMigrationPath, "utf8");

  it("creates durable version and idempotency state without rewriting history", () => {
    expect(migration).toContain(
      'ALTER TABLE "attention_signals" ADD COLUMN "version" integer DEFAULT 0 NOT NULL',
    );
    expect(migration).toContain(
      'ALTER TABLE "waiting_states" ADD COLUMN "version" integer DEFAULT 0 NOT NULL',
    );
    expect(migration).toContain(
      'ALTER TABLE "inbox_items" ADD COLUMN "version" integer DEFAULT 0 NOT NULL',
    );
    expect(migration).toContain('CREATE TABLE "idempotency_records"');
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "idempotency_scope_key_unique"',
    );
    expect(migration).toContain(
      '("organization_id","user_id","idempotency_key")',
    );
  });

  it("keeps previous outbox and decision writers compatible while enforcing the new scope", () => {
    expect(migration).toContain(
      'CREATE TRIGGER "trevv_fill_legacy_outbox_metadata_trigger"',
    );
    expect(migration).toContain(
      'CREATE TRIGGER "trevv_scope_decision_outcome_trigger"',
    );
    expect(migration).toContain('NEW."workspace_id" := resolved_workspace_id');
  });

  it("creates referenced composite keys before tenant foreign keys", () => {
    const portfolioKey = migration.indexOf(
      'CREATE UNIQUE INDEX "portfolios_org_id_unique"',
    );
    const workspaceForeignKey = migration.indexOf(
      'ADD CONSTRAINT "workspaces_org_portfolio_fk"',
    );
    const boardKey = migration.indexOf(
      'CREATE UNIQUE INDEX "boards_org_workspace_id_unique"',
    );
    const itemForeignKey = migration.indexOf(
      'ADD CONSTRAINT "work_items_org_workspace_board_fk"',
    );
    expect(portfolioKey).toBeGreaterThan(-1);
    expect(workspaceForeignKey).toBeGreaterThan(portfolioKey);
    expect(boardKey).toBeGreaterThan(-1);
    expect(itemForeignKey).toBeGreaterThan(boardKey);
  });

  it("allows same-organization cross-Workspace dependencies while scoping both endpoints", () => {
    expect(migration).toContain(
      'ADD CONSTRAINT "item_dependencies_scoped_item_fk" FOREIGN KEY ("organization_id","item_id")',
    );
    expect(migration).toContain(
      'ADD CONSTRAINT "item_dependencies_scoped_dependency_fk" FOREIGN KEY ("organization_id","depends_on_item_id")',
    );
    expect(migration).not.toContain(
      'ALTER TABLE "item_dependencies" ADD COLUMN "workspace_id"',
    );
  });

  it("enforces one unresolved Waiting state per tenant entity", () => {
    expect(migration).toContain('DROP INDEX "waiting_active_entity_unique"');
    expect(migration).toContain(
      'WHERE "waiting_states"."resolved_at" is null and "waiting_states"."deleted_at" is null',
    );
    expect(migration).toContain(
      'ADD CONSTRAINT "waiting_states_org_workspace_item_fk" FOREIGN KEY ("organization_id","workspace_id","entity_id")',
    );
  });
});

describe("Normalized identity email migration", () => {
  const migration = readFileSync(normalizedIdentityEmailMigrationPath, "utf8");

  it("fails closed on legacy collisions before adding normalized uniqueness", () => {
    const collisionCheck = migration.indexOf(
      "active case-insensitive duplicates exist",
    );
    const normalizedIndex = migration.indexOf(
      'CREATE UNIQUE INDEX "app_users_active_email_normalized_unique"',
    );

    expect(collisionCheck).toBeGreaterThan(-1);
    expect(normalizedIndex).toBeGreaterThan(collisionCheck);
    expect(migration).toContain('GROUP BY lower("email")');
    expect(migration).not.toContain('DELETE FROM "app_users"');
  });
});
