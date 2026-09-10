CREATE TABLE "member_report_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"author_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"period" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"context" text DEFAULT '' NOT NULL,
	"health" text DEFAULT 'on_track' NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"content" jsonb NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "member_report_plans_dates_check" CHECK ("member_report_plans"."period_end" >= "member_report_plans"."period_start" AND ("member_report_plans"."period" <> 'day' OR "member_report_plans"."period_end" = "member_report_plans"."period_start")),
	CONSTRAINT "member_report_plans_kind_check" CHECK ("member_report_plans"."kind" IN ('report', 'plan')),
	CONSTRAINT "member_report_plans_period_check" CHECK ("member_report_plans"."period" IN ('day', 'week', 'month', 'sprint', 'custom')),
	CONSTRAINT "member_report_plans_health_check" CHECK ("member_report_plans"."health" IN ('on_track', 'at_risk', 'blocked', 'done')),
	CONSTRAINT "member_report_plans_state_check" CHECK (("member_report_plans"."state" = 'draft' AND "member_report_plans"."published_at" IS NULL) OR ("member_report_plans"."state" = 'published' AND "member_report_plans"."published_at" IS NOT NULL)),
	CONSTRAINT "member_report_plans_version_check" CHECK ("member_report_plans"."version" >= 0)
);
--> statement-breakpoint
ALTER TABLE "member_report_plans" ADD CONSTRAINT "member_report_plans_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_report_plans" ADD CONSTRAINT "member_report_plans_author_id_app_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_report_plans" ADD CONSTRAINT "member_report_plans_org_workspace_fk" FOREIGN KEY ("organization_id","workspace_id") REFERENCES "public"."workspaces"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_report_plans" ADD CONSTRAINT "member_report_plans_org_author_fk" FOREIGN KEY ("organization_id","author_id") REFERENCES "public"."memberships"("organization_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "member_report_plans_workspace_period_idx" ON "member_report_plans" USING btree ("organization_id","workspace_id","period_start");--> statement-breakpoint
CREATE INDEX "member_report_plans_author_idx" ON "member_report_plans" USING btree ("organization_id","author_id");