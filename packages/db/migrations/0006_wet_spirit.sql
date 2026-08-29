CREATE TYPE "public"."invitation_delivery_status" AS ENUM('pending', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."onboarding_status" AS ENUM('draft', 'completed');--> statement-breakpoint
CREATE TABLE "app_user_organization_selections" (
	"app_user_id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"selected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_user_mappings" (
	"auth_user_id" text PRIMARY KEY NOT NULL,
	"app_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_progress" (
	"auth_user_id" text PRIMARY KEY NOT NULL,
	"app_user_id" text,
	"status" "onboarding_status" DEFAULT 'draft' NOT NULL,
	"step" text DEFAULT '1' NOT NULL,
	"draft" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"completion_idempotency_key" text,
	"completion_request_fingerprint" text,
	"completed_organization_id" text,
	"completed_portfolio_id" text,
	"completed_workspace_id" text,
	"completed_board_id" text,
	"completed_blueprint_id" text,
	"completed_blueprint_instance_id" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "onboarding_progress_completion_check" CHECK ((
        "onboarding_progress"."status" = 'draft'
        and "onboarding_progress"."completed_at" is null
      ) or (
        "onboarding_progress"."status" = 'completed'
        and "onboarding_progress"."app_user_id" is not null
        and "onboarding_progress"."completion_idempotency_key" is not null
        and "onboarding_progress"."completion_request_fingerprint" is not null
        and "onboarding_progress"."completed_organization_id" is not null
        and "onboarding_progress"."completed_portfolio_id" is not null
        and "onboarding_progress"."completed_workspace_id" is not null
        and "onboarding_progress"."completed_board_id" is not null
        and "onboarding_progress"."completed_blueprint_id" is not null
        and "onboarding_progress"."completed_blueprint_instance_id" is not null
        and "onboarding_progress"."completed_at" is not null
      ))
);
--> statement-breakpoint
ALTER TABLE "account" ADD COLUMN "issuer" text;--> statement-breakpoint
UPDATE "account" AS account_row
SET "issuer" = CASE
	WHEN account_row."providerId" = 'credential' THEN 'local:credential'
	ELSE 'local:oauth:' || (
		SELECT string_agg(
			CASE
				WHEN provider_byte BETWEEN 48 AND 57
					OR provider_byte BETWEEN 65 AND 90
					OR provider_byte BETWEEN 97 AND 122
					OR provider_byte IN (45, 46, 95, 126)
				THEN chr(provider_byte)
				ELSE '%' || upper(lpad(to_hex(provider_byte), 2, '0'))
			END,
			'' ORDER BY byte_offset
		)
		FROM (
			SELECT
				byte_offset,
				get_byte(convert_to(account_row."providerId", 'UTF8'), byte_offset) AS provider_byte
			FROM generate_series(
				0,
				octet_length(convert_to(account_row."providerId", 'UTF8')) - 1
			) AS provider_offsets(byte_offset)
		) AS encoded_provider
	)
END
WHERE "issuer" IS NULL;--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "issuer" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "invited_by_user_id" text;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "accepted_by_user_id" text;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "revoked_by_user_id" text;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "last_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "send_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "delivery_status" "invitation_delivery_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "delivery_attempted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "delivered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "delivery_error_code" text;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "provider_message_id" text;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "blueprints_org_id_unique" ON "blueprints" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "blueprint_versions_org_blueprint_id_unique" ON "blueprint_versions" USING btree ("organization_id","blueprint_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "blueprint_instances_org_id_unique" ON "blueprint_instances" USING btree ("organization_id","id");--> statement-breakpoint
ALTER TABLE "app_user_organization_selections" ADD CONSTRAINT "app_user_organization_selections_app_user_id_app_users_id_fk" FOREIGN KEY ("app_user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_user_organization_selections" ADD CONSTRAINT "app_user_organization_selections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_user_organization_selections" ADD CONSTRAINT "app_user_org_selections_membership_fk" FOREIGN KEY ("organization_id","app_user_id") REFERENCES "public"."memberships"("organization_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_user_mappings" ADD CONSTRAINT "auth_user_mappings_auth_user_id_user_id_fk" FOREIGN KEY ("auth_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_user_mappings" ADD CONSTRAINT "auth_user_mappings_app_user_id_app_users_id_fk" FOREIGN KEY ("app_user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_progress" ADD CONSTRAINT "onboarding_progress_auth_user_id_user_id_fk" FOREIGN KEY ("auth_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_progress" ADD CONSTRAINT "onboarding_progress_app_user_id_app_users_id_fk" FOREIGN KEY ("app_user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_progress" ADD CONSTRAINT "onboarding_progress_completed_organization_id_organizations_id_fk" FOREIGN KEY ("completed_organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_progress" ADD CONSTRAINT "onboarding_progress_completed_portfolio_id_portfolios_id_fk" FOREIGN KEY ("completed_portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_progress" ADD CONSTRAINT "onboarding_progress_completed_workspace_id_workspaces_id_fk" FOREIGN KEY ("completed_workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_progress" ADD CONSTRAINT "onboarding_progress_completed_board_id_boards_id_fk" FOREIGN KEY ("completed_board_id") REFERENCES "public"."boards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_progress" ADD CONSTRAINT "onboarding_progress_completed_blueprint_id_blueprints_id_fk" FOREIGN KEY ("completed_blueprint_id") REFERENCES "public"."blueprints"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_progress" ADD CONSTRAINT "onboarding_progress_completed_blueprint_instance_id_blueprint_instances_id_fk" FOREIGN KEY ("completed_blueprint_instance_id") REFERENCES "public"."blueprint_instances"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_progress" ADD CONSTRAINT "onboarding_progress_org_portfolio_fk" FOREIGN KEY ("completed_organization_id","completed_portfolio_id") REFERENCES "public"."portfolios"("organization_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_progress" ADD CONSTRAINT "onboarding_progress_org_workspace_fk" FOREIGN KEY ("completed_organization_id","completed_workspace_id") REFERENCES "public"."workspaces"("organization_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_progress" ADD CONSTRAINT "onboarding_progress_org_workspace_board_fk" FOREIGN KEY ("completed_organization_id","completed_workspace_id","completed_board_id") REFERENCES "public"."boards"("organization_id","workspace_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_progress" ADD CONSTRAINT "onboarding_progress_org_blueprint_fk" FOREIGN KEY ("completed_organization_id","completed_blueprint_id") REFERENCES "public"."blueprints"("organization_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_progress" ADD CONSTRAINT "onboarding_progress_org_blueprint_instance_fk" FOREIGN KEY ("completed_organization_id","completed_blueprint_instance_id") REFERENCES "public"."blueprint_instances"("organization_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "app_user_org_selections_org_idx" ON "app_user_organization_selections" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_user_mappings_app_user_unique" ON "auth_user_mappings" USING btree ("app_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_progress_app_user_unique" ON "onboarding_progress" USING btree ("app_user_id") WHERE "onboarding_progress"."app_user_id" is not null;--> statement-breakpoint
ALTER TABLE "blueprint_instances" ADD CONSTRAINT "blueprint_instances_org_blueprint_fk" FOREIGN KEY ("organization_id","blueprint_id") REFERENCES "public"."blueprints"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blueprint_instances" ADD CONSTRAINT "blueprint_instances_org_blueprint_version_fk" FOREIGN KEY ("organization_id","blueprint_id","blueprint_version_id") REFERENCES "public"."blueprint_versions"("organization_id","blueprint_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blueprint_instances" ADD CONSTRAINT "blueprint_instances_org_workspace_board_fk" FOREIGN KEY ("organization_id","workspace_id","board_id") REFERENCES "public"."boards"("organization_id","workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blueprint_versions" ADD CONSTRAINT "blueprint_versions_org_blueprint_fk" FOREIGN KEY ("organization_id","blueprint_id") REFERENCES "public"."blueprints"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blueprint_versions" ADD CONSTRAINT "blueprint_versions_org_creator_membership_fk" FOREIGN KEY ("organization_id","created_by") REFERENCES "public"."memberships"("organization_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_user_id_app_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_accepted_by_user_id_app_users_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_revoked_by_user_id_app_users_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_org_inviter_membership_fk" FOREIGN KEY ("organization_id","invited_by_user_id") REFERENCES "public"."memberships"("organization_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_org_acceptor_membership_fk" FOREIGN KEY ("organization_id","accepted_by_user_id") REFERENCES "public"."memberships"("organization_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_org_revoker_membership_fk" FOREIGN KEY ("organization_id","revoked_by_user_id") REFERENCES "public"."memberships"("organization_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_account_issuer_account_unique" ON "account" USING btree ("issuer","accountId");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_token_hash_unique" ON "invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_org_active_email_unique" ON "invitations" USING btree ("organization_id",lower("email")) WHERE "invitations"."accepted_at" is null and "invitations"."revoked_at" is null and "invitations"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_token_hash_format_check" CHECK ("invitations"."token_hash" ~ '^[0-9a-f]{64}$') NOT VALID;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_terminal_state_check" CHECK (("invitations"."accepted_by_user_id" is null or "invitations"."accepted_at" is not null)
        and ("invitations"."revoked_by_user_id" is null or "invitations"."revoked_at" is not null)
        and not ("invitations"."accepted_at" is not null and "invitations"."revoked_at" is not null));
