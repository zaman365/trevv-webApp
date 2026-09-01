CREATE TABLE "platform_audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_user_id" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"request_id" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_owner_assignments" (
	"singleton_key" text PRIMARY KEY DEFAULT 'primary' NOT NULL,
	"app_user_id" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_owner_assignments_singleton_check" CHECK ("platform_owner_assignments"."singleton_key" = 'primary')
);
--> statement-breakpoint
ALTER TABLE "platform_audit_events" ADD CONSTRAINT "platform_audit_events_actor_user_id_app_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."app_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_owner_assignments" ADD CONSTRAINT "platform_owner_assignments_app_user_id_app_users_id_fk" FOREIGN KEY ("app_user_id") REFERENCES "public"."app_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "platform_audit_events_request_unique" ON "platform_audit_events" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "platform_audit_events_created_idx" ON "platform_audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "platform_audit_events_actor_idx" ON "platform_audit_events" USING btree ("actor_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_owner_assignments_user_unique" ON "platform_owner_assignments" USING btree ("app_user_id");