CREATE TYPE "public"."attention_severity" AS ENUM('info', 'low', 'medium', 'high', 'critical');--> statement-breakpoint
ALTER TYPE "public"."progress_mode" ADD VALUE 'weighted_work_items' BEFORE 'weighted_milestones';--> statement-breakpoint
ALTER TYPE "public"."progress_mode" ADD VALUE 'milestone_completion' BEFORE 'weighted_milestones';--> statement-breakpoint
CREATE TABLE "attention_signals" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"portfolio_id" text NOT NULL,
	"hub_id" text,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"signal_type" text NOT NULL,
	"severity" "attention_severity" NOT NULL,
	"impact" integer NOT NULL,
	"urgency" integer NOT NULL,
	"responsibility" real DEFAULT 1 NOT NULL,
	"reason" text NOT NULL,
	"recommended_action" text,
	"resolved_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	"snoozed_until" timestamp with time zone,
	"action_reason" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_events" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"provider" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blueprint_instances" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"blueprint_id" text NOT NULL,
	"blueprint_version_id" text NOT NULL,
	"hub_id" text NOT NULL,
	"board_id" text NOT NULL,
	"local_overrides" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"detached_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "blueprint_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"blueprint_id" text NOT NULL,
	"version" integer NOT NULL,
	"summary" text NOT NULL,
	"definition" jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blueprints" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"current_version_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "decision_outcomes" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"portfolio_id" text NOT NULL,
	"decision_item_id" text NOT NULL,
	"outcome" text NOT NULL,
	"learning" text NOT NULL,
	"would_repeat" boolean,
	"recorded_by" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entitlements" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"subscription_id" text,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"source" text DEFAULT 'plan' NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "hub_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"portfolio_id" text NOT NULL,
	"hub_id" text NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"health" "hub_health" NOT NULL,
	"progress" real,
	"open_count" integer NOT NULL,
	"overdue_count" integer NOT NULL,
	"blocked_count" integer NOT NULL,
	"decision_count" integer NOT NULL,
	"attention_count" integer NOT NULL,
	"next_milestone_id" text,
	"next_milestone_status" text,
	"latest_update_at" timestamp with time zone,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"portfolio_id" text NOT NULL,
	"hub_id" text,
	"preset" text NOT NULL,
	"status" text NOT NULL,
	"dry_run" boolean DEFAULT true NOT NULL,
	"field_mapping" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status_mapping" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"owner_mapping" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"report" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" text NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "inbox_items" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"resource" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"done_at" timestamp with time zone,
	"snoozed_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insight_links" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"insight_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insights" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"portfolio_id" text NOT NULL,
	"hub_id" text,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"source_type" text NOT NULL,
	"source_url" text,
	"impact" text,
	"labels" text[] DEFAULT '{}' NOT NULL,
	"captured_by" text NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "portfolio_members" (
	"organization_id" text NOT NULL,
	"portfolio_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "membership_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "portfolio_members_portfolio_id_user_id_pk" PRIMARY KEY("portfolio_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "portfolios" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"ordering" real DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "review_rituals" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"portfolio_id" text NOT NULL,
	"hub_id" text,
	"type" text NOT NULL,
	"cadence" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"next_due_at" timestamp with time zone,
	"reminder_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "stakeholder_exposures" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"hub_id" text NOT NULL,
	"principal_id" text NOT NULL,
	"show_health" boolean DEFAULT false NOT NULL,
	"show_latest_update" boolean DEFAULT false NOT NULL,
	"show_milestones" boolean DEFAULT false NOT NULL,
	"selected_work_item_ids" text[] DEFAULT '{}' NOT NULL,
	"selected_resource_ids" text[] DEFAULT '{}' NOT NULL,
	"approval_item_ids" text[] DEFAULT '{}' NOT NULL,
	"decision_item_ids" text[] DEFAULT '{}' NOT NULL,
	"show_internal_comments" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"status" text NOT NULL,
	"provider" text,
	"provider_customer_id" text,
	"provider_subscription_id" text,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "usage_counters" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"key" text NOT NULL,
	"value" real DEFAULT 0 NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user_seen_checkpoints" (
	"organization_id" text NOT NULL,
	"portfolio_id" text NOT NULL,
	"user_id" text NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "user_seen_checkpoints_portfolio_id_user_id_pk" PRIMARY KEY("portfolio_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "waiting_states" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"portfolio_id" text NOT NULL,
	"hub_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"waiting_type" text NOT NULL,
	"waiting_reference_id" text,
	"waiting_label" text,
	"waiting_since" timestamp with time zone NOT NULL,
	"expected_by" date,
	"follow_up_owner_id" text NOT NULL,
	"next_follow_up" date,
	"waiting_note" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "hubs" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."hub_type";--> statement-breakpoint
CREATE TYPE "public"."hub_type" AS ENUM('business', 'brand', 'client', 'product', 'department', 'venture', 'initiative', 'investment', 'campaign', 'program', 'project', 'shared_function', 'client_program', 'journey', 'other');--> statement-breakpoint
ALTER TABLE "hubs" ALTER COLUMN "type" SET DATA TYPE "public"."hub_type" USING "type"::"public"."hub_type";--> statement-breakpoint
DROP INDEX "hubs_org_slug_unique";--> statement-breakpoint
-- Add one default Portfolio per existing Organization without requiring any
-- user action. Stable text ids keep the migration deterministic on retries.
INSERT INTO "portfolios" (
	"id",
	"organization_id",
	"name",
	"slug",
	"description",
	"is_default",
	"ordering"
)
SELECT
	'portfolio-default-' || md5("id"),
	"id",
	'Main Portfolio',
	'main',
	'Automatically created during the TREVV multi-Portfolio migration.',
	true,
	0
FROM "organizations"
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "portfolio_members" (
	"organization_id",
	"portfolio_id",
	"user_id",
	"role"
)
SELECT
	m."organization_id",
	p."id",
	m."user_id",
	m."role"
FROM "memberships" m
JOIN "portfolios" p
	ON p."organization_id" = m."organization_id"
	AND p."is_default" = true
ON CONFLICT DO NOTHING;--> statement-breakpoint
ALTER TABLE "hubs" ADD COLUMN "portfolio_id" text;--> statement-breakpoint
UPDATE "hubs" h
SET "portfolio_id" = p."id"
FROM "portfolios" p
WHERE p."organization_id" = h."organization_id"
	AND p."is_default" = true;--> statement-breakpoint
ALTER TABLE "hubs" ALTER COLUMN "portfolio_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "hubs" ADD COLUMN "progress_mode" "progress_mode" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "hubs" ADD COLUMN "manual_progress_value" integer;--> statement-breakpoint
ALTER TABLE "item_dependencies" ADD COLUMN "relation" text DEFAULT 'depends_on' NOT NULL;--> statement-breakpoint
ALTER TABLE "attention_signals" ADD CONSTRAINT "attention_signals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attention_signals" ADD CONSTRAINT "attention_signals_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attention_signals" ADD CONSTRAINT "attention_signals_hub_id_hubs_id_fk" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blueprint_instances" ADD CONSTRAINT "blueprint_instances_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blueprint_instances" ADD CONSTRAINT "blueprint_instances_blueprint_id_blueprints_id_fk" FOREIGN KEY ("blueprint_id") REFERENCES "public"."blueprints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blueprint_instances" ADD CONSTRAINT "blueprint_instances_blueprint_version_id_blueprint_versions_id_fk" FOREIGN KEY ("blueprint_version_id") REFERENCES "public"."blueprint_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blueprint_instances" ADD CONSTRAINT "blueprint_instances_hub_id_hubs_id_fk" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blueprint_instances" ADD CONSTRAINT "blueprint_instances_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blueprint_versions" ADD CONSTRAINT "blueprint_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blueprint_versions" ADD CONSTRAINT "blueprint_versions_blueprint_id_blueprints_id_fk" FOREIGN KEY ("blueprint_id") REFERENCES "public"."blueprints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blueprint_versions" ADD CONSTRAINT "blueprint_versions_created_by_app_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blueprints" ADD CONSTRAINT "blueprints_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_outcomes" ADD CONSTRAINT "decision_outcomes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_outcomes" ADD CONSTRAINT "decision_outcomes_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_outcomes" ADD CONSTRAINT "decision_outcomes_decision_item_id_work_items_id_fk" FOREIGN KEY ("decision_item_id") REFERENCES "public"."work_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_outcomes" ADD CONSTRAINT "decision_outcomes_recorded_by_app_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_snapshots" ADD CONSTRAINT "hub_snapshots_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_snapshots" ADD CONSTRAINT "hub_snapshots_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_snapshots" ADD CONSTRAINT "hub_snapshots_hub_id_hubs_id_fk" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_snapshots" ADD CONSTRAINT "hub_snapshots_next_milestone_id_work_items_id_fk" FOREIGN KEY ("next_milestone_id") REFERENCES "public"."work_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_runs" ADD CONSTRAINT "import_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_runs" ADD CONSTRAINT "import_runs_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_runs" ADD CONSTRAINT "import_runs_hub_id_hubs_id_fk" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_runs" ADD CONSTRAINT "import_runs_created_by_app_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insight_links" ADD CONSTRAINT "insight_links_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insight_links" ADD CONSTRAINT "insight_links_insight_id_insights_id_fk" FOREIGN KEY ("insight_id") REFERENCES "public"."insights"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_hub_id_hubs_id_fk" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_captured_by_app_users_id_fk" FOREIGN KEY ("captured_by") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_members" ADD CONSTRAINT "portfolio_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_members" ADD CONSTRAINT "portfolio_members_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_members" ADD CONSTRAINT "portfolio_members_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_rituals" ADD CONSTRAINT "review_rituals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_rituals" ADD CONSTRAINT "review_rituals_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_rituals" ADD CONSTRAINT "review_rituals_hub_id_hubs_id_fk" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stakeholder_exposures" ADD CONSTRAINT "stakeholder_exposures_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stakeholder_exposures" ADD CONSTRAINT "stakeholder_exposures_hub_id_hubs_id_fk" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stakeholder_exposures" ADD CONSTRAINT "stakeholder_exposures_principal_id_app_users_id_fk" FOREIGN KEY ("principal_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_seen_checkpoints" ADD CONSTRAINT "user_seen_checkpoints_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_seen_checkpoints" ADD CONSTRAINT "user_seen_checkpoints_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_seen_checkpoints" ADD CONSTRAINT "user_seen_checkpoints_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiting_states" ADD CONSTRAINT "waiting_states_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiting_states" ADD CONSTRAINT "waiting_states_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiting_states" ADD CONSTRAINT "waiting_states_hub_id_hubs_id_fk" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiting_states" ADD CONSTRAINT "waiting_states_follow_up_owner_id_app_users_id_fk" FOREIGN KEY ("follow_up_owner_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attention_org_portfolio_active_idx" ON "attention_signals" USING btree ("organization_id","portfolio_id","resolved_at","dismissed_at");--> statement-breakpoint
CREATE INDEX "attention_entity_idx" ON "attention_signals" USING btree ("organization_id","entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_events_provider_event_unique" ON "billing_events" USING btree ("provider","provider_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "blueprint_instances_board_unique" ON "blueprint_instances" USING btree ("board_id");--> statement-breakpoint
CREATE INDEX "blueprint_instances_update_idx" ON "blueprint_instances" USING btree ("organization_id","blueprint_id","detached_at");--> statement-breakpoint
CREATE UNIQUE INDEX "blueprint_versions_number_unique" ON "blueprint_versions" USING btree ("blueprint_id","version");--> statement-breakpoint
CREATE INDEX "blueprints_org_idx" ON "blueprints" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "decision_outcomes_decision_idx" ON "decision_outcomes" USING btree ("organization_id","decision_item_id","recorded_at");--> statement-breakpoint
CREATE UNIQUE INDEX "entitlements_org_key_source_unique" ON "entitlements" USING btree ("organization_id","key","source");--> statement-breakpoint
CREATE INDEX "entitlements_org_effective_idx" ON "entitlements" USING btree ("organization_id","effective_until");--> statement-breakpoint
CREATE UNIQUE INDEX "hub_snapshots_hub_captured_unique" ON "hub_snapshots" USING btree ("hub_id","captured_at");--> statement-breakpoint
CREATE INDEX "hub_snapshots_portfolio_captured_idx" ON "hub_snapshots" USING btree ("organization_id","portfolio_id","captured_at");--> statement-breakpoint
CREATE INDEX "import_runs_org_created_idx" ON "import_runs" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "inbox_items_user_actionable_idx" ON "inbox_items" USING btree ("organization_id","user_id","done_at","snoozed_until");--> statement-breakpoint
CREATE UNIQUE INDEX "insight_links_target_unique" ON "insight_links" USING btree ("insight_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "insight_links_entity_idx" ON "insight_links" USING btree ("organization_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "insights_portfolio_captured_idx" ON "insights" USING btree ("organization_id","portfolio_id","captured_at");--> statement-breakpoint
CREATE UNIQUE INDEX "plans_key_unique" ON "plans" USING btree ("key");--> statement-breakpoint
CREATE INDEX "portfolio_members_user_idx" ON "portfolio_members" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "portfolios_org_slug_unique" ON "portfolios" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "portfolios_org_default_idx" ON "portfolios" USING btree ("organization_id","is_default");--> statement-breakpoint
CREATE INDEX "review_rituals_due_idx" ON "review_rituals" USING btree ("organization_id","enabled","next_due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "stakeholder_exposures_principal_hub_unique" ON "stakeholder_exposures" USING btree ("hub_id","principal_id");--> statement-breakpoint
CREATE INDEX "subscriptions_org_status_idx" ON "subscriptions" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_counters_org_key_period_unique" ON "usage_counters" USING btree ("organization_id","key","period_start");--> statement-breakpoint
CREATE INDEX "seen_checkpoints_user_idx" ON "user_seen_checkpoints" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "waiting_org_portfolio_follow_up_idx" ON "waiting_states" USING btree ("organization_id","portfolio_id","next_follow_up","resolved_at");--> statement-breakpoint
CREATE UNIQUE INDEX "waiting_active_entity_unique" ON "waiting_states" USING btree ("organization_id","entity_type","entity_id","resolved_at");--> statement-breakpoint
ALTER TABLE "hubs" ADD CONSTRAINT "hubs_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hubs_portfolio_slug_unique" ON "hubs" USING btree ("portfolio_id","slug");--> statement-breakpoint
CREATE INDEX "hubs_org_portfolio_idx" ON "hubs" USING btree ("organization_id","portfolio_id");
