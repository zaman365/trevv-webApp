CREATE TYPE "public"."hub_health" AS ENUM('on_track', 'watch', 'critical', 'parked');--> statement-breakpoint
CREATE TYPE "public"."hub_type" AS ENUM('venture', 'brand', 'product', 'shared_function', 'client_program', 'journey', 'other');--> statement-breakpoint
CREATE TYPE "public"."item_status" AS ENUM('not_started', 'working', 'blocked', 'review', 'done');--> statement-breakpoint
CREATE TYPE "public"."item_type" AS ENUM('task', 'decision', 'approval', 'milestone', 'idea', 'request');--> statement-breakpoint
CREATE TYPE "public"."lifecycle_stage" AS ENUM('idea', 'validate', 'build', 'launch', 'grow', 'operate', 'paused', 'archived');--> statement-breakpoint
CREATE TYPE "public"."item_priority" AS ENUM('urgent', 'high', 'normal', 'low', 'none');--> statement-breakpoint
CREATE TYPE "public"."progress_mode" AS ENUM('none', 'task_completion', 'weighted_milestones', 'manual');--> statement-breakpoint
CREATE TYPE "public"."membership_role" AS ENUM('owner', 'admin', 'hub_lead', 'member', 'guest', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."visibility" AS ENUM('private', 'organization');--> statement-breakpoint
CREATE TABLE "activity_events" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"actor_id" text,
	"event_type" text NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"item_id" text,
	"storage_key" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"uploaded_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"ip_hash" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "board_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"board_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"ordering" real DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "boards" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"hub_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"template_key" text,
	"visibility" "visibility" DEFAULT 'private' NOT NULL,
	"progress_mode" "progress_mode" DEFAULT 'task_completion' NOT NULL,
	"manual_progress_value" integer,
	"manual_progress_note" text,
	"start_date" date,
	"end_date" date,
	"ordering" real DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"item_id" text NOT NULL,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"edited_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "custom_field_options" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"field_id" text NOT NULL,
	"label" text NOT NULL,
	"color" text,
	"ordering" real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_fields" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"board_id" text,
	"name" text NOT NULL,
	"field_type" text NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "external_resource_links" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"hub_id" text,
	"item_id" text,
	"provider" text NOT NULL,
	"provider_id" text,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "hub_members" (
	"organization_id" text NOT NULL,
	"hub_id" text NOT NULL,
	"user_id" text NOT NULL,
	"can_manage" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "hub_members_hub_id_user_id_pk" PRIMARY KEY("hub_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "hub_metrics" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"hub_id" text NOT NULL,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	"current_value" real,
	"target_value" real,
	"cadence" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "hub_updates" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"hub_id" text NOT NULL,
	"author_id" text NOT NULL,
	"wins" text NOT NULL,
	"current_priority" text NOT NULL,
	"blocker" text NOT NULL,
	"next_milestone" text NOT NULL,
	"help_needed" text NOT NULL,
	"note" text,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "hubs" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"type" "hub_type" NOT NULL,
	"accent_color" text NOT NULL,
	"icon" text NOT NULL,
	"visibility" "visibility" DEFAULT 'private' NOT NULL,
	"lifecycle_stage" "lifecycle_stage" NOT NULL,
	"health" "hub_health" NOT NULL,
	"health_note" text DEFAULT '' NOT NULL,
	"lead_user_id" text,
	"current_priority" text DEFAULT '' NOT NULL,
	"next_milestone_summary" text DEFAULT '' NOT NULL,
	"next_milestone_date" date,
	"primary_blocker" text DEFAULT '' NOT NULL,
	"founder_help_summary" text DEFAULT '' NOT NULL,
	"review_cadence" text DEFAULT 'weekly' NOT NULL,
	"next_review_date" date,
	"last_update_at" timestamp with time zone,
	"ordering" real DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "integration_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"provider" text NOT NULL,
	"encrypted_credentials" text NOT NULL,
	"scopes" text[] NOT NULL,
	"connected_by" text NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" "membership_role" NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "item_assignees" (
	"organization_id" text NOT NULL,
	"item_id" text NOT NULL,
	"user_id" text NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_assignees_item_id_user_id_pk" PRIMARY KEY("item_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "item_dependencies" (
	"organization_id" text NOT NULL,
	"item_id" text NOT NULL,
	"depends_on_item_id" text NOT NULL,
	CONSTRAINT "item_dependencies_item_id_depends_on_item_id_pk" PRIMARY KEY("item_id","depends_on_item_id")
);
--> statement-breakpoint
CREATE TABLE "item_field_values" (
	"organization_id" text NOT NULL,
	"item_id" text NOT NULL,
	"field_id" text NOT NULL,
	"value" jsonb NOT NULL,
	CONSTRAINT "item_field_values_item_id_field_id_pk" PRIMARY KEY("item_id","field_id")
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "membership_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "memberships_organization_id_user_id_pk" PRIMARY KEY("organization_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "mentions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"comment_id" text NOT NULL,
	"mentioned_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metric_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"metric_id" text NOT NULL,
	"value" real NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"resource" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"timezone" text DEFAULT 'Europe/Berlin' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"event_type" text NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reactions" (
	"organization_id" text NOT NULL,
	"comment_id" text NOT NULL,
	"user_id" text NOT NULL,
	"emoji" text NOT NULL,
	CONSTRAINT "reactions_comment_id_user_id_emoji_pk" PRIMARY KEY("comment_id","user_id","emoji")
);
--> statement-breakpoint
CREATE TABLE "saved_views" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"board_id" text NOT NULL,
	"owner_id" text,
	"name" text NOT NULL,
	"shared" boolean DEFAULT false NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "statuses" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"board_id" text,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"category" "item_status" NOT NULL,
	"ordering" real DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "app_users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"provider" text NOT NULL,
	"delivery_id" text NOT NULL,
	"signature_valid" boolean NOT NULL,
	"processed_at" timestamp with time zone,
	"payload_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_items" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"hub_id" text NOT NULL,
	"board_id" text NOT NULL,
	"group_id" text,
	"parent_item_id" text,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"item_type" "item_type" NOT NULL,
	"status" "item_status" NOT NULL,
	"status_id" text,
	"priority" "item_priority" DEFAULT 'normal' NOT NULL,
	"start_date" date,
	"due_date" date,
	"completed_at" timestamp with time zone,
	"creator_id" text NOT NULL,
	"ordering" real DEFAULT 0 NOT NULL,
	"estimate_weight" real,
	"version" integer DEFAULT 0 NOT NULL,
	"type_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_actor_id_app_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_item_id_work_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."work_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_app_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_app_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_groups" ADD CONSTRAINT "board_groups_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_groups" ADD CONSTRAINT "board_groups_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boards" ADD CONSTRAINT "boards_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boards" ADD CONSTRAINT "boards_hub_id_hubs_id_fk" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_item_id_work_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."work_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_app_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_options" ADD CONSTRAINT "custom_field_options_field_id_custom_fields_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."custom_fields"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_fields" ADD CONSTRAINT "custom_fields_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_fields" ADD CONSTRAINT "custom_fields_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_resource_links" ADD CONSTRAINT "external_resource_links_hub_id_hubs_id_fk" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_resource_links" ADD CONSTRAINT "external_resource_links_item_id_work_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."work_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_members" ADD CONSTRAINT "hub_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_members" ADD CONSTRAINT "hub_members_hub_id_hubs_id_fk" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_members" ADD CONSTRAINT "hub_members_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_metrics" ADD CONSTRAINT "hub_metrics_hub_id_hubs_id_fk" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_updates" ADD CONSTRAINT "hub_updates_hub_id_hubs_id_fk" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_updates" ADD CONSTRAINT "hub_updates_author_id_app_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hubs" ADD CONSTRAINT "hubs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hubs" ADD CONSTRAINT "hubs_lead_user_id_app_users_id_fk" FOREIGN KEY ("lead_user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_connected_by_app_users_id_fk" FOREIGN KEY ("connected_by") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_assignees" ADD CONSTRAINT "item_assignees_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_assignees" ADD CONSTRAINT "item_assignees_item_id_work_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."work_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_assignees" ADD CONSTRAINT "item_assignees_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_dependencies" ADD CONSTRAINT "item_dependencies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_dependencies" ADD CONSTRAINT "item_dependencies_item_id_work_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."work_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_dependencies" ADD CONSTRAINT "item_dependencies_depends_on_item_id_work_items_id_fk" FOREIGN KEY ("depends_on_item_id") REFERENCES "public"."work_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_field_values" ADD CONSTRAINT "item_field_values_item_id_work_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."work_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_field_values" ADD CONSTRAINT "item_field_values_field_id_custom_fields_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."custom_fields"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_mentioned_user_id_app_users_id_fk" FOREIGN KEY ("mentioned_user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_snapshots" ADD CONSTRAINT "metric_snapshots_metric_id_hub_metrics_id_fk" FOREIGN KEY ("metric_id") REFERENCES "public"."hub_metrics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_owner_id_app_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statuses" ADD CONSTRAINT "statuses_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statuses" ADD CONSTRAINT "statuses_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_hub_id_hubs_id_fk" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_group_id_board_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."board_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_status_id_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."statuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_creator_id_app_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_org_aggregate_idx" ON "activity_events" USING btree ("organization_id","aggregate_type","aggregate_id");--> statement-breakpoint
CREATE INDEX "audit_org_date_idx" ON "audit_logs" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "board_groups_board_idx" ON "board_groups" USING btree ("organization_id","board_id");--> statement-breakpoint
CREATE INDEX "boards_org_hub_idx" ON "boards" USING btree ("organization_id","hub_id");--> statement-breakpoint
CREATE INDEX "comments_item_idx" ON "comments" USING btree ("organization_id","item_id");--> statement-breakpoint
CREATE INDEX "custom_fields_board_idx" ON "custom_fields" USING btree ("organization_id","board_id");--> statement-breakpoint
CREATE INDEX "hub_members_user_idx" ON "hub_members" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "hub_updates_hub_date_idx" ON "hub_updates" USING btree ("organization_id","hub_id","published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "hubs_org_slug_unique" ON "hubs" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "hubs_org_health_idx" ON "hubs" USING btree ("organization_id","health");--> statement-breakpoint
CREATE INDEX "hubs_org_lead_idx" ON "hubs" USING btree ("organization_id","lead_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "connections_org_provider_unique" ON "integration_connections" USING btree ("organization_id","provider");--> statement-breakpoint
CREATE INDEX "invitations_org_email_idx" ON "invitations" USING btree ("organization_id","email");--> statement-breakpoint
CREATE INDEX "assignees_org_user_idx" ON "item_assignees" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "memberships_user_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_user_unread_idx" ON "notifications" USING btree ("organization_id","user_id","read_at");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_unique" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "outbox_pending_idx" ON "outbox_events" USING btree ("processed_at","available_at");--> statement-breakpoint
CREATE INDEX "statuses_org_board_idx" ON "statuses" USING btree ("organization_id","board_id");--> statement-breakpoint
CREATE UNIQUE INDEX "app_users_email_unique" ON "app_users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_provider_delivery_unique" ON "webhook_deliveries" USING btree ("provider","delivery_id");--> statement-breakpoint
CREATE INDEX "items_org_hub_idx" ON "work_items" USING btree ("organization_id","hub_id");--> statement-breakpoint
CREATE INDEX "items_org_board_status_idx" ON "work_items" USING btree ("organization_id","board_id","status");--> statement-breakpoint
CREATE INDEX "items_org_due_idx" ON "work_items" USING btree ("organization_id","due_date");--> statement-breakpoint
CREATE INDEX "items_parent_idx" ON "work_items" USING btree ("parent_item_id");