CREATE TABLE "outbox_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"event_id" text NOT NULL,
	"attempt" integer NOT NULL,
	"worker_id" text NOT NULL,
	"lease_token" text NOT NULL,
	"status" text NOT NULL,
	"error_code" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "outbox_attempts_status_check" CHECK ("outbox_attempts"."status" in ('leased', 'succeeded', 'failed', 'dead_lettered'))
);
--> statement-breakpoint
CREATE TABLE "work_item_events" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"item_id" text NOT NULL,
	"actor_id" text,
	"event_type" text NOT NULL,
	"summary" text NOT NULL,
	"reason_code" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"source_occurred_at" timestamp with time zone NOT NULL,
	"item_version" integer NOT NULL,
	"snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"request_id" text NOT NULL,
	"dedup_key" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attention_signals" ADD COLUMN "reason_code" text;--> statement-breakpoint
ALTER TABLE "attention_signals" ADD COLUMN "evidence" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "attention_signals" ADD COLUMN "source_fingerprint" text;--> statement-breakpoint
ALTER TABLE "attention_signals" ADD COLUMN "source_occurred_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "attention_signals" ADD COLUMN "computed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "attention_computed_at" timestamp with time zone;--> statement-breakpoint
UPDATE "attention_signals"
SET
	"reason_code" = coalesce("reason_code", 'legacy.imported.' || "id"),
	"source_fingerprint" = coalesce("source_fingerprint", 'legacy:' || "id"),
	"source_occurred_at" = coalesce("source_occurred_at", "updated_at", "created_at"),
	"computed_at" = coalesce("computed_at", "updated_at", "created_at");--> statement-breakpoint
ALTER TABLE "attention_signals" ALTER COLUMN "reason_code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "attention_signals" ALTER COLUMN "source_fingerprint" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "attention_signals" ALTER COLUMN "source_occurred_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "attention_signals" ALTER COLUMN "computed_at" SET NOT NULL;--> statement-breakpoint
UPDATE "idempotency_records" record
SET "response_body" = record."response_body" || jsonb_build_object(
	'reasonCode', signal."reason_code",
	'evidence', signal."evidence",
	'sourceFingerprint', signal."source_fingerprint",
	'sourceOccurredAt', signal."source_occurred_at",
	'computedAt', signal."computed_at"
)
FROM "attention_signals" signal
WHERE record."organization_id" = signal."organization_id"
	AND record."result_id" = signal."id"
	AND record."state" = 'completed'
	AND record."response_body" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "dedup_key" text;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN "locked_by" text;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN "lease_token" text;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN "lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN "last_error_code" text;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN "last_error_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN "dead_lettered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN "processed_by" text;--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_events_org_id_unique" ON "outbox_events" USING btree ("organization_id","id");--> statement-breakpoint
ALTER TABLE "outbox_attempts" ADD CONSTRAINT "outbox_attempts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_attempts" ADD CONSTRAINT "outbox_attempts_event_id_outbox_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."outbox_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_attempts" ADD CONSTRAINT "outbox_attempts_org_event_fk" FOREIGN KEY ("organization_id","event_id") REFERENCES "public"."outbox_events"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_events" ADD CONSTRAINT "work_item_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_events" ADD CONSTRAINT "work_item_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_events" ADD CONSTRAINT "work_item_events_item_id_work_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."work_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_events" ADD CONSTRAINT "work_item_events_actor_id_app_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_events" ADD CONSTRAINT "work_item_events_org_workspace_item_fk" FOREIGN KEY ("organization_id","workspace_id","item_id") REFERENCES "public"."work_items"("organization_id","workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_events" ADD CONSTRAINT "work_item_events_org_actor_membership_fk" FOREIGN KEY ("organization_id","actor_id") REFERENCES "public"."memberships"("organization_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_attempts_event_attempt_unique" ON "outbox_attempts" USING btree ("event_id","attempt");--> statement-breakpoint
CREATE INDEX "outbox_attempts_org_status_idx" ON "outbox_attempts" USING btree ("organization_id","status","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "work_item_events_org_dedup_unique" ON "work_item_events" USING btree ("organization_id","dedup_key");--> statement-breakpoint
CREATE INDEX "work_item_events_org_item_time_idx" ON "work_item_events" USING btree ("organization_id","item_id","occurred_at");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_org_membership_fk" FOREIGN KEY ("organization_id","user_id") REFERENCES "public"."memberships"("organization_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attention_active_reason_unique" ON "attention_signals" USING btree ("organization_id","entity_type","entity_id","reason_code") WHERE "attention_signals"."reason_code" is not null and "attention_signals"."resolved_at" is null and "attention_signals"."dismissed_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_org_user_dedup_unique" ON "notifications" USING btree ("organization_id","user_id","dedup_key") WHERE "notifications"."dedup_key" is not null;--> statement-breakpoint
CREATE INDEX "outbox_lease_expiry_idx" ON "outbox_events" USING btree ("processed_at","dead_lettered_at","lease_expires_at");
