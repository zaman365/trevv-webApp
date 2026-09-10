CREATE TABLE "superadmin_organization_contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"job_title" text DEFAULT '' NOT NULL,
	"email" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "superadmin_org_contact_kind_check" CHECK ("superadmin_organization_contacts"."kind" in ('primary', 'billing', 'technical', 'security', 'other')),
	CONSTRAINT "superadmin_org_contact_phone_check" CHECK ("superadmin_organization_contacts"."phone" = '' or "superadmin_organization_contacts"."phone" ~ '^[+][1-9][0-9]{6,14}$')
);
--> statement-breakpoint
CREATE TABLE "superadmin_organization_profiles" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"legal_name" text DEFAULT '' NOT NULL,
	"website" text DEFAULT '' NOT NULL,
	"industry" text DEFAULT '' NOT NULL,
	"country" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"stage" text DEFAULT 'onboarding' NOT NULL,
	"priority" text DEFAULT 'standard' NOT NULL,
	"next_review_at" date,
	"version" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "superadmin_org_stage_check" CHECK ("superadmin_organization_profiles"."stage" in ('onboarding', 'established', 'needs_review')),
	CONSTRAINT "superadmin_org_priority_check" CHECK ("superadmin_organization_profiles"."priority" in ('standard', 'priority', 'urgent')),
	CONSTRAINT "superadmin_org_version_check" CHECK ("superadmin_organization_profiles"."version" >= 0)
);
--> statement-breakpoint
ALTER TABLE "superadmin_organization_contacts" ADD CONSTRAINT "superadmin_organization_contacts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "superadmin_organization_profiles" ADD CONSTRAINT "superadmin_organization_profiles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "superadmin_org_contact_org_idx" ON "superadmin_organization_contacts" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "superadmin_org_primary_contact_unique" ON "superadmin_organization_contacts" USING btree ("organization_id") WHERE "superadmin_organization_contacts"."kind" = 'primary';--> statement-breakpoint
CREATE INDEX "superadmin_org_review_idx" ON "superadmin_organization_profiles" USING btree ("next_review_at");