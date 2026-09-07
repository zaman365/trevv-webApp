CREATE TABLE "organization_snapshot_revisions" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"revision" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_snapshot_revisions" ADD CONSTRAINT "organization_snapshot_revisions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attention_org_snooze_boundary_idx" ON "attention_signals" USING btree ("organization_id","snoozed_until") WHERE "attention_signals"."snoozed_until" is not null;--> statement-breakpoint
-- Statement-level transition tables invalidate once per affected organization,
-- not once per item. Revisions commit/roll back with the data, including deletes.
CREATE FUNCTION trevv_snapshot_revision_changed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  changed_ids text[];
  affected_organizations text[];
  organization_key text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT array_agg(DISTINCT to_jsonb(changed) ->> TG_ARGV[0]) INTO changed_ids FROM new_rows changed;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT array_agg(DISTINCT to_jsonb(changed) ->> TG_ARGV[0]) INTO changed_ids FROM old_rows changed;
  ELSIF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'organizations' THEN
    -- Computation freshness is maintained for worker fairness, not snapshot content.
    SELECT array_agg(DISTINCT coalesce(after.id, before.id)) INTO changed_ids
      FROM old_rows before FULL JOIN new_rows after USING (id)
      WHERE (to_jsonb(before) - 'attention_computed_at') IS DISTINCT FROM
        (to_jsonb(after) - 'attention_computed_at');
  ELSIF TG_OP = 'UPDATE' THEN
    SELECT array_agg(DISTINCT id) INTO changed_ids FROM (
      SELECT to_jsonb(changed) ->> TG_ARGV[0] AS id FROM old_rows changed
      UNION SELECT to_jsonb(changed) ->> TG_ARGV[0] AS id FROM new_rows changed
    ) changed;
  ELSE
    EXECUTE format('SELECT array_agg(DISTINCT %I::text) FROM %I.%I', TG_ARGV[0], TG_TABLE_SCHEMA, TG_TABLE_NAME) INTO changed_ids;
  END IF;
  IF TG_ARGV[1] = 'user' THEN
    SELECT array_agg(DISTINCT organization_id) INTO affected_organizations
      FROM memberships WHERE user_id = ANY(changed_ids);
  ELSE
    affected_organizations := changed_ids;
  END IF;
  FOR organization_key IN
    SELECT DISTINCT id FROM organizations WHERE id = ANY(affected_organizations) ORDER BY id
  LOOP
    INSERT INTO organization_snapshot_revisions(organization_id, revision)
      VALUES (organization_key, 1)
      ON CONFLICT (organization_id) DO UPDATE
      SET revision = organization_snapshot_revisions.revision + 1;
  END LOOP;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
DO $$
DECLARE
  relation_name text;
  scope_column text;
  scope_kind text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'organizations', 'app_users', 'memberships', 'portfolio_members',
    'workspace_members', 'portfolios', 'workspaces', 'workspace_metrics',
    'workspace_updates', 'work_items', 'item_assignees', 'waiting_states',
    'attention_signals'
  ] LOOP
    scope_column := CASE WHEN relation_name IN ('organizations', 'app_users') THEN 'id' ELSE 'organization_id' END;
    scope_kind := CASE WHEN relation_name = 'app_users' THEN 'user' ELSE 'organization' END;
    EXECUTE format('CREATE TRIGGER trevv_snapshot_insert AFTER INSERT ON %I REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION trevv_snapshot_revision_changed(%L, %L)', relation_name, scope_column, scope_kind);
    EXECUTE format('CREATE TRIGGER trevv_snapshot_update AFTER UPDATE ON %I REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION trevv_snapshot_revision_changed(%L, %L)', relation_name, scope_column, scope_kind);
    EXECUTE format('CREATE TRIGGER trevv_snapshot_delete AFTER DELETE ON %I REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION trevv_snapshot_revision_changed(%L, %L)', relation_name, scope_column, scope_kind);
    EXECUTE format('CREATE TRIGGER trevv_snapshot_truncate BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION trevv_snapshot_revision_changed(%L, %L)', relation_name, scope_column, scope_kind);
  END LOOP;
END;
$$;
