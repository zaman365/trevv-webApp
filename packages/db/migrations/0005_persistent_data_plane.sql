CREATE TABLE "idempotency_records" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"method" text NOT NULL,
	"route" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"result_type" text,
	"result_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "waiting_active_entity_unique";--> statement-breakpoint
ALTER TABLE "attention_signals" ADD COLUMN "version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD COLUMN "version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD COLUMN "converted_item_id" text;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD COLUMN "converted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "waiting_states" ADD COLUMN "version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN "schema_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN "actor_id" text;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN "request_id" text;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN "correlation_id" text;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN "dedup_key" text;--> statement-breakpoint
UPDATE "outbox_events"
SET "request_id" = 'legacy:' || "id",
	"dedup_key" = 'legacy:' || "id"
WHERE "request_id" IS NULL OR "dedup_key" IS NULL;--> statement-breakpoint
ALTER TABLE "outbox_events" ALTER COLUMN "request_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "outbox_events" ALTER COLUMN "dedup_key" SET NOT NULL;--> statement-breakpoint
CREATE FUNCTION "trevv_fill_legacy_outbox_metadata"() RETURNS trigger AS $$
BEGIN
	IF NEW."request_id" IS NULL THEN
		NEW."request_id" := 'legacy:' || NEW."id";
	END IF;
	IF NEW."dedup_key" IS NULL THEN
		NEW."dedup_key" := 'legacy:' || NEW."id";
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "trevv_fill_legacy_outbox_metadata_trigger"
	BEFORE INSERT ON "outbox_events"
	FOR EACH ROW EXECUTE FUNCTION "trevv_fill_legacy_outbox_metadata"();--> statement-breakpoint
ALTER TABLE "decision_outcomes" ADD COLUMN "workspace_id" text;--> statement-breakpoint
UPDATE "decision_outcomes" AS "decision"
SET "workspace_id" = "item"."workspace_id",
	"portfolio_id" = "workspace"."portfolio_id"
FROM "work_items" AS "item"
INNER JOIN "workspaces" AS "workspace"
	ON "workspace"."organization_id" = "item"."organization_id"
	AND "workspace"."id" = "item"."workspace_id"
WHERE "decision"."organization_id" = "item"."organization_id"
		AND "decision"."decision_item_id" = "item"."id";--> statement-breakpoint
ALTER TABLE "decision_outcomes" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
CREATE FUNCTION "trevv_scope_decision_outcome"() RETURNS trigger AS $$
DECLARE
	resolved_workspace_id text;
	resolved_portfolio_id text;
BEGIN
	SELECT "item"."workspace_id", "workspace"."portfolio_id"
	INTO resolved_workspace_id, resolved_portfolio_id
	FROM "work_items" AS "item"
	INNER JOIN "workspaces" AS "workspace"
		ON "workspace"."organization_id" = "item"."organization_id"
		AND "workspace"."id" = "item"."workspace_id"
	WHERE "item"."organization_id" = NEW."organization_id"
		AND "item"."id" = NEW."decision_item_id";

	IF FOUND THEN
		IF NEW."workspace_id" IS NULL THEN
			NEW."workspace_id" := resolved_workspace_id;
		ELSIF NEW."workspace_id" <> resolved_workspace_id THEN
			RAISE foreign_key_violation USING MESSAGE = 'decision outcome Workspace does not match its item';
		END IF;
		IF NEW."portfolio_id" <> resolved_portfolio_id THEN
			RAISE foreign_key_violation USING MESSAGE = 'decision outcome Portfolio does not match its item';
		END IF;
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "trevv_scope_decision_outcome_trigger"
	BEFORE INSERT OR UPDATE OF "organization_id", "portfolio_id", "workspace_id", "decision_item_id"
	ON "decision_outcomes"
	FOR EACH ROW EXECUTE FUNCTION "trevv_scope_decision_outcome"();--> statement-breakpoint
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_org_membership_fk" FOREIGN KEY ("organization_id","user_id") REFERENCES "public"."memberships"("organization_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_scope_key_unique" ON "idempotency_records" USING btree ("organization_id","user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "idempotency_expiry_idx" ON "idempotency_records" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idempotency_result_idx" ON "idempotency_records" USING btree ("organization_id","result_type","result_id");--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_events_org_dedup_unique" ON "outbox_events" USING btree ("organization_id","dedup_key");--> statement-breakpoint
CREATE UNIQUE INDEX "board_groups_org_board_id_unique" ON "board_groups" USING btree ("organization_id","board_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "boards_org_id_unique" ON "boards" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "boards_org_workspace_id_unique" ON "boards" USING btree ("organization_id","workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "portfolios_org_id_unique" ON "portfolios" USING btree ("organization_id","id");--> statement-breakpoint
WITH "ranked_portfolios" AS (
	SELECT "id",
		row_number() OVER (
			PARTITION BY "organization_id"
			ORDER BY "is_default" DESC, "ordering", "id"
		) AS "default_rank"
	FROM "portfolios"
	WHERE "archived_at" IS NULL AND "deleted_at" IS NULL
)
UPDATE "portfolios" AS "portfolio"
SET "is_default" = ("ranked"."default_rank" = 1)
FROM "ranked_portfolios" AS "ranked"
WHERE "portfolio"."id" = "ranked"."id"
	AND "portfolio"."is_default" IS DISTINCT FROM ("ranked"."default_rank" = 1);--> statement-breakpoint
CREATE UNIQUE INDEX "portfolios_org_single_default_unique" ON "portfolios" USING btree ("organization_id") WHERE "portfolios"."is_default" = true and "portfolios"."archived_at" is null and "portfolios"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "statuses_org_board_id_unique" ON "statuses" USING btree ("organization_id","board_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "work_items_org_id_unique" ON "work_items" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "work_items_org_workspace_id_unique" ON "work_items" USING btree ("organization_id","workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspaces_org_id_unique" ON "workspaces" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspaces_org_portfolio_id_unique" ON "workspaces" USING btree ("organization_id","portfolio_id","id");--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_org_actor_membership_fk" FOREIGN KEY ("organization_id","actor_id") REFERENCES "public"."memberships"("organization_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attention_signals" ADD CONSTRAINT "attention_signals_org_portfolio_fk" FOREIGN KEY ("organization_id","portfolio_id") REFERENCES "public"."portfolios"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attention_signals" ADD CONSTRAINT "attention_signals_org_portfolio_workspace_fk" FOREIGN KEY ("organization_id","portfolio_id","workspace_id") REFERENCES "public"."workspaces"("organization_id","portfolio_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_org_actor_membership_fk" FOREIGN KEY ("organization_id","actor_id") REFERENCES "public"."memberships"("organization_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_groups" ADD CONSTRAINT "board_groups_org_board_fk" FOREIGN KEY ("organization_id","board_id") REFERENCES "public"."boards"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boards" ADD CONSTRAINT "boards_org_workspace_fk" FOREIGN KEY ("organization_id","workspace_id") REFERENCES "public"."workspaces"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_org_item_fk" FOREIGN KEY ("organization_id","item_id") REFERENCES "public"."work_items"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_org_author_membership_fk" FOREIGN KEY ("organization_id","author_id") REFERENCES "public"."memberships"("organization_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_outcomes" ADD CONSTRAINT "decision_outcomes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_outcomes" ADD CONSTRAINT "decision_outcomes_org_portfolio_workspace_fk" FOREIGN KEY ("organization_id","portfolio_id","workspace_id") REFERENCES "public"."workspaces"("organization_id","portfolio_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_outcomes" ADD CONSTRAINT "decision_outcomes_org_workspace_item_fk" FOREIGN KEY ("organization_id","workspace_id","decision_item_id") REFERENCES "public"."work_items"("organization_id","workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_outcomes" ADD CONSTRAINT "decision_outcomes_org_recorder_membership_fk" FOREIGN KEY ("organization_id","recorded_by") REFERENCES "public"."memberships"("organization_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_org_membership_fk" FOREIGN KEY ("organization_id","user_id") REFERENCES "public"."memberships"("organization_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_converted_item_id_work_items_id_fk" FOREIGN KEY ("converted_item_id") REFERENCES "public"."work_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_org_converted_item_fk" FOREIGN KEY ("organization_id","converted_item_id") REFERENCES "public"."work_items"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_assignees" ADD CONSTRAINT "item_assignees_org_item_fk" FOREIGN KEY ("organization_id","item_id") REFERENCES "public"."work_items"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_assignees" ADD CONSTRAINT "item_assignees_org_membership_fk" FOREIGN KEY ("organization_id","user_id") REFERENCES "public"."memberships"("organization_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_dependencies" ADD CONSTRAINT "item_dependencies_scoped_item_fk" FOREIGN KEY ("organization_id","item_id") REFERENCES "public"."work_items"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_dependencies" ADD CONSTRAINT "item_dependencies_scoped_dependency_fk" FOREIGN KEY ("organization_id","depends_on_item_id") REFERENCES "public"."work_items"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_actor_id_app_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_org_actor_membership_fk" FOREIGN KEY ("organization_id","actor_id") REFERENCES "public"."memberships"("organization_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_members" ADD CONSTRAINT "portfolio_members_org_portfolio_fk" FOREIGN KEY ("organization_id","portfolio_id") REFERENCES "public"."portfolios"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_members" ADD CONSTRAINT "portfolio_members_org_membership_fk" FOREIGN KEY ("organization_id","user_id") REFERENCES "public"."memberships"("organization_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_rituals" ADD CONSTRAINT "review_rituals_org_portfolio_fk" FOREIGN KEY ("organization_id","portfolio_id") REFERENCES "public"."portfolios"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_rituals" ADD CONSTRAINT "review_rituals_org_portfolio_workspace_fk" FOREIGN KEY ("organization_id","portfolio_id","workspace_id") REFERENCES "public"."workspaces"("organization_id","portfolio_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statuses" ADD CONSTRAINT "statuses_org_board_fk" FOREIGN KEY ("organization_id","board_id") REFERENCES "public"."boards"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiting_states" ADD CONSTRAINT "waiting_states_org_portfolio_workspace_fk" FOREIGN KEY ("organization_id","portfolio_id","workspace_id") REFERENCES "public"."workspaces"("organization_id","portfolio_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiting_states" ADD CONSTRAINT "waiting_states_org_owner_membership_fk" FOREIGN KEY ("organization_id","follow_up_owner_id") REFERENCES "public"."memberships"("organization_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiting_states" ADD CONSTRAINT "waiting_states_org_workspace_item_fk" FOREIGN KEY ("organization_id","workspace_id","entity_id") REFERENCES "public"."work_items"("organization_id","workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_org_workspace_fk" FOREIGN KEY ("organization_id","workspace_id") REFERENCES "public"."workspaces"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_org_workspace_board_fk" FOREIGN KEY ("organization_id","workspace_id","board_id") REFERENCES "public"."boards"("organization_id","workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_org_board_group_fk" FOREIGN KEY ("organization_id","board_id","group_id") REFERENCES "public"."board_groups"("organization_id","board_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_org_board_status_fk" FOREIGN KEY ("organization_id","board_id","status_id") REFERENCES "public"."statuses"("organization_id","board_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_org_creator_membership_fk" FOREIGN KEY ("organization_id","creator_id") REFERENCES "public"."memberships"("organization_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_org_workspace_parent_fk" FOREIGN KEY ("organization_id","workspace_id","parent_item_id") REFERENCES "public"."work_items"("organization_id","workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_org_workspace_fk" FOREIGN KEY ("organization_id","workspace_id") REFERENCES "public"."workspaces"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_org_membership_fk" FOREIGN KEY ("organization_id","user_id") REFERENCES "public"."memberships"("organization_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_snapshots" ADD CONSTRAINT "workspace_snapshots_org_portfolio_workspace_fk" FOREIGN KEY ("organization_id","portfolio_id","workspace_id") REFERENCES "public"."workspaces"("organization_id","portfolio_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_snapshots" ADD CONSTRAINT "workspace_snapshots_org_workspace_milestone_fk" FOREIGN KEY ("organization_id","workspace_id","next_milestone_id") REFERENCES "public"."work_items"("organization_id","workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_updates" ADD CONSTRAINT "workspace_updates_org_workspace_fk" FOREIGN KEY ("organization_id","workspace_id") REFERENCES "public"."workspaces"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_updates" ADD CONSTRAINT "workspace_updates_org_author_membership_fk" FOREIGN KEY ("organization_id","author_id") REFERENCES "public"."memberships"("organization_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_org_portfolio_fk" FOREIGN KEY ("organization_id","portfolio_id") REFERENCES "public"."portfolios"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_org_lead_membership_fk" FOREIGN KEY ("organization_id","lead_user_id") REFERENCES "public"."memberships"("organization_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "waiting_active_entity_unique" ON "waiting_states" USING btree ("organization_id","entity_type","entity_id") WHERE "waiting_states"."resolved_at" is null and "waiting_states"."deleted_at" is null;
