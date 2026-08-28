ALTER TYPE "public"."hub_health" RENAME TO "workspace_health";--> statement-breakpoint
ALTER TYPE "public"."hub_type" RENAME TO "workspace_type";--> statement-breakpoint
ALTER TABLE "hub_members" RENAME TO "workspace_members";--> statement-breakpoint
ALTER TABLE "hub_metrics" RENAME TO "workspace_metrics";--> statement-breakpoint
ALTER TABLE "hub_snapshots" RENAME TO "workspace_snapshots";--> statement-breakpoint
ALTER TABLE "hub_updates" RENAME TO "workspace_updates";--> statement-breakpoint
ALTER TABLE "hubs" RENAME TO "workspaces";--> statement-breakpoint
ALTER TABLE "attention_signals" RENAME COLUMN "hub_id" TO "workspace_id";--> statement-breakpoint
ALTER TABLE "blueprint_instances" RENAME COLUMN "hub_id" TO "workspace_id";--> statement-breakpoint
ALTER TABLE "boards" RENAME COLUMN "hub_id" TO "workspace_id";--> statement-breakpoint
ALTER TABLE "conversations" RENAME COLUMN "hub_id" TO "workspace_id";--> statement-breakpoint
ALTER TABLE "external_resource_links" RENAME COLUMN "hub_id" TO "workspace_id";--> statement-breakpoint
ALTER TABLE "workspace_members" RENAME COLUMN "hub_id" TO "workspace_id";--> statement-breakpoint
ALTER TABLE "workspace_metrics" RENAME COLUMN "hub_id" TO "workspace_id";--> statement-breakpoint
ALTER TABLE "workspace_snapshots" RENAME COLUMN "hub_id" TO "workspace_id";--> statement-breakpoint
ALTER TABLE "workspace_updates" RENAME COLUMN "hub_id" TO "workspace_id";--> statement-breakpoint
ALTER TABLE "import_runs" RENAME COLUMN "hub_id" TO "workspace_id";--> statement-breakpoint
ALTER TABLE "insights" RENAME COLUMN "hub_id" TO "workspace_id";--> statement-breakpoint
ALTER TABLE "review_rituals" RENAME COLUMN "hub_id" TO "workspace_id";--> statement-breakpoint
ALTER TABLE "stakeholder_exposures" RENAME COLUMN "hub_id" TO "workspace_id";--> statement-breakpoint
ALTER TABLE "waiting_states" RENAME COLUMN "hub_id" TO "workspace_id";--> statement-breakpoint
ALTER TABLE "work_items" RENAME COLUMN "hub_id" TO "workspace_id";--> statement-breakpoint
ALTER TABLE "attention_signals" DROP CONSTRAINT "attention_signals_hub_id_hubs_id_fk";
--> statement-breakpoint
ALTER TABLE "blueprint_instances" DROP CONSTRAINT "blueprint_instances_hub_id_hubs_id_fk";
--> statement-breakpoint
ALTER TABLE "boards" DROP CONSTRAINT "boards_hub_id_hubs_id_fk";
--> statement-breakpoint
ALTER TABLE "conversations" DROP CONSTRAINT "conversations_hub_id_hubs_id_fk";
--> statement-breakpoint
ALTER TABLE "external_resource_links" DROP CONSTRAINT "external_resource_links_hub_id_hubs_id_fk";
--> statement-breakpoint
ALTER TABLE "workspace_members" DROP CONSTRAINT "hub_members_organization_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "workspace_members" DROP CONSTRAINT "hub_members_hub_id_hubs_id_fk";
--> statement-breakpoint
ALTER TABLE "workspace_members" DROP CONSTRAINT "hub_members_user_id_app_users_id_fk";
--> statement-breakpoint
ALTER TABLE "workspace_metrics" DROP CONSTRAINT "hub_metrics_hub_id_hubs_id_fk";
--> statement-breakpoint
ALTER TABLE "workspace_snapshots" DROP CONSTRAINT "hub_snapshots_organization_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "workspace_snapshots" DROP CONSTRAINT "hub_snapshots_portfolio_id_portfolios_id_fk";
--> statement-breakpoint
ALTER TABLE "workspace_snapshots" DROP CONSTRAINT "hub_snapshots_hub_id_hubs_id_fk";
--> statement-breakpoint
ALTER TABLE "workspace_snapshots" DROP CONSTRAINT "hub_snapshots_next_milestone_id_work_items_id_fk";
--> statement-breakpoint
ALTER TABLE "workspace_updates" DROP CONSTRAINT "hub_updates_hub_id_hubs_id_fk";
--> statement-breakpoint
ALTER TABLE "workspace_updates" DROP CONSTRAINT "hub_updates_author_id_app_users_id_fk";
--> statement-breakpoint
ALTER TABLE "workspaces" DROP CONSTRAINT "hubs_organization_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "workspaces" DROP CONSTRAINT "hubs_portfolio_id_portfolios_id_fk";
--> statement-breakpoint
ALTER TABLE "workspaces" DROP CONSTRAINT "hubs_lead_user_id_app_users_id_fk";
--> statement-breakpoint
ALTER TABLE "import_runs" DROP CONSTRAINT "import_runs_hub_id_hubs_id_fk";
--> statement-breakpoint
ALTER TABLE "insights" DROP CONSTRAINT "insights_hub_id_hubs_id_fk";
--> statement-breakpoint
ALTER TABLE "metric_snapshots" DROP CONSTRAINT "metric_snapshots_metric_id_hub_metrics_id_fk";
--> statement-breakpoint
ALTER TABLE "review_rituals" DROP CONSTRAINT "review_rituals_hub_id_hubs_id_fk";
--> statement-breakpoint
ALTER TABLE "stakeholder_exposures" DROP CONSTRAINT "stakeholder_exposures_hub_id_hubs_id_fk";
--> statement-breakpoint
ALTER TABLE "waiting_states" DROP CONSTRAINT "waiting_states_hub_id_hubs_id_fk";
--> statement-breakpoint
ALTER TABLE "work_items" DROP CONSTRAINT "work_items_hub_id_hubs_id_fk";
--> statement-breakpoint
ALTER TYPE "public"."conversation_kind" RENAME VALUE 'hub' TO 'workspace';--> statement-breakpoint
ALTER TYPE "public"."membership_role" RENAME VALUE 'hub_lead' TO 'workspace_lead';--> statement-breakpoint
DROP INDEX "boards_org_hub_idx";--> statement-breakpoint
DROP INDEX "conversations_hub_activity_idx";--> statement-breakpoint
DROP INDEX "hub_members_user_idx";--> statement-breakpoint
DROP INDEX "hub_snapshots_hub_captured_unique";--> statement-breakpoint
DROP INDEX "hub_snapshots_portfolio_captured_idx";--> statement-breakpoint
DROP INDEX "hub_updates_hub_date_idx";--> statement-breakpoint
DROP INDEX "hubs_portfolio_slug_unique";--> statement-breakpoint
DROP INDEX "hubs_org_portfolio_idx";--> statement-breakpoint
DROP INDEX "hubs_org_health_idx";--> statement-breakpoint
DROP INDEX "hubs_org_lead_idx";--> statement-breakpoint
DROP INDEX "stakeholder_exposures_principal_hub_unique";--> statement-breakpoint
DROP INDEX "items_org_hub_idx";--> statement-breakpoint
ALTER TABLE "workspace_members" DROP CONSTRAINT "hub_members_hub_id_user_id_pk";--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_user_id_pk" PRIMARY KEY("workspace_id","user_id");--> statement-breakpoint
ALTER TABLE "attention_signals" ADD CONSTRAINT "attention_signals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blueprint_instances" ADD CONSTRAINT "blueprint_instances_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boards" ADD CONSTRAINT "boards_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_resource_links" ADD CONSTRAINT "external_resource_links_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_metrics" ADD CONSTRAINT "workspace_metrics_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_snapshots" ADD CONSTRAINT "workspace_snapshots_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_snapshots" ADD CONSTRAINT "workspace_snapshots_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_snapshots" ADD CONSTRAINT "workspace_snapshots_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_snapshots" ADD CONSTRAINT "workspace_snapshots_next_milestone_id_work_items_id_fk" FOREIGN KEY ("next_milestone_id") REFERENCES "public"."work_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_updates" ADD CONSTRAINT "workspace_updates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_updates" ADD CONSTRAINT "workspace_updates_author_id_app_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_lead_user_id_app_users_id_fk" FOREIGN KEY ("lead_user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_runs" ADD CONSTRAINT "import_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_snapshots" ADD CONSTRAINT "metric_snapshots_metric_id_workspace_metrics_id_fk" FOREIGN KEY ("metric_id") REFERENCES "public"."workspace_metrics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_rituals" ADD CONSTRAINT "review_rituals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stakeholder_exposures" ADD CONSTRAINT "stakeholder_exposures_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiting_states" ADD CONSTRAINT "waiting_states_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "boards_org_workspace_idx" ON "boards" USING btree ("organization_id","workspace_id");--> statement-breakpoint
CREATE INDEX "conversations_workspace_activity_idx" ON "conversations" USING btree ("organization_id","workspace_id","last_message_at");--> statement-breakpoint
CREATE INDEX "workspace_members_user_idx" ON "workspace_members" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_snapshots_workspace_captured_unique" ON "workspace_snapshots" USING btree ("workspace_id","captured_at");--> statement-breakpoint
CREATE INDEX "workspace_snapshots_portfolio_captured_idx" ON "workspace_snapshots" USING btree ("organization_id","portfolio_id","captured_at");--> statement-breakpoint
CREATE INDEX "workspace_updates_workspace_date_idx" ON "workspace_updates" USING btree ("organization_id","workspace_id","published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "workspaces_portfolio_slug_unique" ON "workspaces" USING btree ("portfolio_id","slug");--> statement-breakpoint
CREATE INDEX "workspaces_org_portfolio_idx" ON "workspaces" USING btree ("organization_id","portfolio_id");--> statement-breakpoint
CREATE INDEX "workspaces_org_health_idx" ON "workspaces" USING btree ("organization_id","health");--> statement-breakpoint
CREATE INDEX "workspaces_org_lead_idx" ON "workspaces" USING btree ("organization_id","lead_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stakeholder_exposures_principal_workspace_unique" ON "stakeholder_exposures" USING btree ("workspace_id","principal_id");--> statement-breakpoint
CREATE INDEX "items_org_workspace_idx" ON "work_items" USING btree ("organization_id","workspace_id");
