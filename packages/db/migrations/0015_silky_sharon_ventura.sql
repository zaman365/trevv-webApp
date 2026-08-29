CREATE TABLE "data_lifecycle_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"requested_by" text NOT NULL,
	"subject_user_id" text,
	"kind" text NOT NULL,
	"request_scope" text NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"processing_started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"retention_until" timestamp with time zone,
	"result_manifest" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"failure_code" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "data_lifecycle_requests_kind_check" CHECK ("data_lifecycle_requests"."kind" in ('access', 'portability', 'erasure', 'rectification', 'restriction', 'objection')),
	CONSTRAINT "data_lifecycle_requests_scope_check" CHECK ("data_lifecycle_requests"."request_scope" in ('user', 'organization')),
	CONSTRAINT "data_lifecycle_requests_kind_scope_check" CHECK ("data_lifecycle_requests"."request_scope" = 'user' or "data_lifecycle_requests"."kind" in ('access', 'portability', 'erasure', 'restriction')),
	CONSTRAINT "data_lifecycle_requests_status_check" CHECK ("data_lifecycle_requests"."status" in ('submitted', 'under_review', 'approved', 'processing', 'completed', 'rejected', 'cancelled', 'failed')),
	CONSTRAINT "data_lifecycle_requests_org_scope_subject_check" CHECK (("data_lifecycle_requests"."request_scope" = 'user' and "data_lifecycle_requests"."subject_user_id" is not null) or ("data_lifecycle_requests"."request_scope" = 'organization' and "data_lifecycle_requests"."subject_user_id" is null)),
	CONSTRAINT "data_lifecycle_requests_version_check" CHECK ("data_lifecycle_requests"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "data_retention_policies" (
	"organization_id" text NOT NULL,
	"category" text NOT NULL,
	"retention_days" integer NOT NULL,
	"disposition" text NOT NULL,
	"legal_hold" boolean DEFAULT false NOT NULL,
	"policy_version" integer DEFAULT 1 NOT NULL,
	"updated_by" text NOT NULL,
	"effective_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "data_retention_policies_organization_id_category_pk" PRIMARY KEY("organization_id","category"),
	CONSTRAINT "data_retention_policies_category_check" CHECK ("data_retention_policies"."category" in ('identity', 'organization', 'work', 'collaboration', 'audit', 'operations', 'integrations', 'billing')),
	CONSTRAINT "data_retention_policies_days_check" CHECK ("data_retention_policies"."retention_days" between 1 and 3650),
	CONSTRAINT "data_retention_policies_disposition_check" CHECK ("data_retention_policies"."disposition" in ('delete', 'anonymize', 'archive', 'manual_review')),
	CONSTRAINT "data_retention_policies_version_check" CHECK ("data_retention_policies"."policy_version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "data_lifecycle_requests" ADD CONSTRAINT "data_lifecycle_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_lifecycle_requests" ADD CONSTRAINT "data_lifecycle_requests_requested_by_app_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_lifecycle_requests" ADD CONSTRAINT "data_lifecycle_requests_subject_user_id_app_users_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_lifecycle_requests" ADD CONSTRAINT "data_lifecycle_requests_org_requester_membership_fk" FOREIGN KEY ("organization_id","requested_by") REFERENCES "public"."memberships"("organization_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_lifecycle_requests" ADD CONSTRAINT "data_lifecycle_requests_org_subject_membership_fk" FOREIGN KEY ("organization_id","subject_user_id") REFERENCES "public"."memberships"("organization_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_retention_policies" ADD CONSTRAINT "data_retention_policies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_retention_policies" ADD CONSTRAINT "data_retention_policies_updated_by_app_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_retention_policies" ADD CONSTRAINT "data_retention_policies_org_updater_membership_fk" FOREIGN KEY ("organization_id","updated_by") REFERENCES "public"."memberships"("organization_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "data_lifecycle_requests_org_id_unique" ON "data_lifecycle_requests" USING btree ("organization_id","id");--> statement-breakpoint
CREATE INDEX "data_lifecycle_requests_org_requester_created_idx" ON "data_lifecycle_requests" USING btree ("organization_id","requested_by","created_at");--> statement-breakpoint
CREATE INDEX "data_lifecycle_requests_work_queue_idx" ON "data_lifecycle_requests" USING btree ("status","due_at");
