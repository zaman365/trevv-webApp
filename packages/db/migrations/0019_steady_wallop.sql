CREATE TABLE "calendar_events" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"calendar_id" text NOT NULL,
	"creator_id" text NOT NULL,
	"source" text DEFAULT 'trevv' NOT NULL,
	"external_event_id" text,
	"kind" text DEFAULT 'event' NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"all_day" boolean DEFAULT false NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"meeting_url" text,
	"attendees" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recurrence_rule" text,
	"linked_work_item_id" text,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"external_updated_at" timestamp with time zone,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "calendar_events_time_range_check" CHECK ("calendar_events"."end_at" > "calendar_events"."start_at")
);
--> statement-breakpoint
CREATE TABLE "workspace_calendars" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"owner_user_id" text,
	"provider" text DEFAULT 'trevv' NOT NULL,
	"external_calendar_id" text,
	"name" text NOT NULL,
	"color" text DEFAULT '#5b57d9' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"visible_by_default" boolean DEFAULT true NOT NULL,
	"read_only" boolean DEFAULT false NOT NULL,
	"connection_state" text DEFAULT 'native' NOT NULL,
	"sync_state" text DEFAULT 'idle' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_calendars_org_workspace_id_unique" ON "workspace_calendars" USING btree ("organization_id","workspace_id","id");--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_calendar_id_workspace_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."workspace_calendars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_creator_id_app_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_linked_work_item_id_work_items_id_fk" FOREIGN KEY ("linked_work_item_id") REFERENCES "public"."work_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_org_workspace_fk" FOREIGN KEY ("organization_id","workspace_id") REFERENCES "public"."workspaces"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_org_workspace_calendar_fk" FOREIGN KEY ("organization_id","workspace_id","calendar_id") REFERENCES "public"."workspace_calendars"("organization_id","workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_org_creator_membership_fk" FOREIGN KEY ("organization_id","creator_id") REFERENCES "public"."memberships"("organization_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_org_workspace_work_item_fk" FOREIGN KEY ("organization_id","workspace_id","linked_work_item_id") REFERENCES "public"."work_items"("organization_id","workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_calendars" ADD CONSTRAINT "workspace_calendars_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_calendars" ADD CONSTRAINT "workspace_calendars_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_calendars" ADD CONSTRAINT "workspace_calendars_owner_user_id_app_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_calendars" ADD CONSTRAINT "workspace_calendars_org_workspace_fk" FOREIGN KEY ("organization_id","workspace_id") REFERENCES "public"."workspaces"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_calendars" ADD CONSTRAINT "workspace_calendars_org_owner_membership_fk" FOREIGN KEY ("organization_id","owner_user_id") REFERENCES "public"."memberships"("organization_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
INSERT INTO "workspace_calendars" (
	"id",
	"organization_id",
	"workspace_id",
	"provider",
	"name",
	"color",
	"is_primary",
	"visible_by_default",
	"read_only",
	"connection_state",
	"sync_state"
)
SELECT
	'calendar-' || md5("organization_id" || ':' || "id"),
	"organization_id",
	"id",
	'trevv',
	"name" || ' calendar',
	"accent_color",
	true,
	true,
	false,
	'native',
	'idle'
FROM "workspaces"
WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_events_org_id_unique" ON "calendar_events" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_events_external_unique" ON "calendar_events" USING btree ("organization_id","calendar_id","external_event_id") WHERE "calendar_events"."external_event_id" is not null and "calendar_events"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "calendar_events_workspace_time_idx" ON "calendar_events" USING btree ("organization_id","workspace_id","start_at");--> statement-breakpoint
CREATE INDEX "calendar_events_calendar_time_idx" ON "calendar_events" USING btree ("organization_id","calendar_id","start_at");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_calendars_org_id_unique" ON "workspace_calendars" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_calendars_primary_unique" ON "workspace_calendars" USING btree ("organization_id","workspace_id") WHERE "workspace_calendars"."provider" = 'trevv' and "workspace_calendars"."is_primary" = true and "workspace_calendars"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_calendars_external_unique" ON "workspace_calendars" USING btree ("organization_id","workspace_id","provider","external_calendar_id") WHERE "workspace_calendars"."external_calendar_id" is not null and "workspace_calendars"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "workspace_calendars_workspace_idx" ON "workspace_calendars" USING btree ("organization_id","workspace_id");
