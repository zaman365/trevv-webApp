CREATE TABLE "superadmin_account" (
	"id" text PRIMARY KEY NOT NULL,
	"accountId" text NOT NULL,
	"issuer" text NOT NULL,
	"providerId" text NOT NULL,
	"userId" text NOT NULL,
	"password" text,
	"accessToken" text,
	"refreshToken" text,
	"idToken" text,
	"accessTokenExpiresAt" timestamp with time zone,
	"refreshTokenExpiresAt" timestamp with time zone,
	"scope" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "superadmin_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"reason" text NOT NULL,
	"request_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "superadmin_invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by" text,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"delivery_status" text DEFAULT 'pending' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "superadmin_invitation_role_check" CHECK ("superadmin_invitations"."role" in ('owner', 'operator', 'auditor')),
	CONSTRAINT "superadmin_invitation_token_check" CHECK ("superadmin_invitations"."token_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "superadmin_passkey" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"publicKey" text NOT NULL,
	"userId" text NOT NULL,
	"credentialID" text NOT NULL,
	"counter" integer NOT NULL,
	"deviceType" text NOT NULL,
	"backedUp" boolean NOT NULL,
	"transports" text,
	"aaguid" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "superadmin_session" (
	"id" text PRIMARY KEY NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"userId" text NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"assuranceAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "superadmin_two_factor" (
	"id" text PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"backupCodes" text NOT NULL,
	"userId" text NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"failedVerificationCount" integer DEFAULT 0 NOT NULL,
	"lockedUntil" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "superadmin_user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text DEFAULT 'auditor' NOT NULL,
	"disabled" boolean DEFAULT false NOT NULL,
	"phoneNumber" text,
	"twoFactorEnabled" boolean DEFAULT false NOT NULL,
	"admissionTokenHash" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "superadmin_user_role_check" CHECK ("superadmin_user"."role" in ('owner', 'operator', 'auditor')),
	CONSTRAINT "superadmin_user_phone_check" CHECK ("superadmin_user"."phoneNumber" is null or "superadmin_user"."phoneNumber" ~ '^[+][1-9][0-9]{6,14}$')
);
--> statement-breakpoint
CREATE TABLE "superadmin_verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "superadmin_account" ADD CONSTRAINT "superadmin_account_userId_superadmin_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."superadmin_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "superadmin_audit" ADD CONSTRAINT "superadmin_audit_actor_id_superadmin_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."superadmin_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "superadmin_invitations" ADD CONSTRAINT "superadmin_invitations_invited_by_superadmin_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."superadmin_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "superadmin_passkey" ADD CONSTRAINT "superadmin_passkey_userId_superadmin_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."superadmin_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "superadmin_session" ADD CONSTRAINT "superadmin_session_userId_superadmin_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."superadmin_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "superadmin_two_factor" ADD CONSTRAINT "superadmin_two_factor_userId_superadmin_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."superadmin_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "superadmin_account_issuer_unique" ON "superadmin_account" USING btree ("issuer","accountId");--> statement-breakpoint
CREATE INDEX "superadmin_account_user_idx" ON "superadmin_account" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "superadmin_audit_created_idx" ON "superadmin_audit" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "superadmin_audit_actor_idx" ON "superadmin_audit" USING btree ("actor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "superadmin_invitation_token_unique" ON "superadmin_invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "superadmin_invitation_pending_email_unique" ON "superadmin_invitations" USING btree (lower("email")) WHERE "superadmin_invitations"."accepted_at" is null and "superadmin_invitations"."revoked_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "superadmin_passkey_credential_unique" ON "superadmin_passkey" USING btree ("credentialID");--> statement-breakpoint
CREATE INDEX "superadmin_passkey_user_idx" ON "superadmin_passkey" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "superadmin_session_token_unique" ON "superadmin_session" USING btree ("token");--> statement-breakpoint
CREATE INDEX "superadmin_session_user_idx" ON "superadmin_session" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "superadmin_two_factor_user_unique" ON "superadmin_two_factor" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "superadmin_user_email_unique" ON "superadmin_user" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "superadmin_verification_identifier_idx" ON "superadmin_verification" USING btree ("identifier");
--> statement-breakpoint
-- Admission is atomic with user insertion: concurrent/replayed requests cannot
-- consume the same invitation or elevate a customer identity.
CREATE FUNCTION trevv_admit_superadmin() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE admitted_role text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('trevv:superadmin-roster', 0));
  UPDATE superadmin_invitations i SET accepted_at = now()
    WHERE i.token_hash = NEW."admissionTokenHash" AND lower(i.email) = lower(NEW.email)
      AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now()
      AND (
        (i.invited_by IS NULL AND i.role = 'owner' AND lower(i.email) = 'zaman.ase365@gmail.com'
          AND NOT EXISTS (SELECT 1 FROM superadmin_user))
        OR EXISTS (SELECT 1 FROM superadmin_user u WHERE u.id = i.invited_by AND u.role = 'owner' AND NOT u.disabled)
      )
    RETURNING i.role INTO admitted_role;
  IF admitted_role IS NULL THEN
    RAISE EXCEPTION 'Administrator invitation is unavailable' USING ERRCODE = '42501';
  END IF;
  NEW.email := lower(NEW.email);
  NEW.role := admitted_role;
  NEW.disabled := false;
  NEW."emailVerified" := true;
  NEW."twoFactorEnabled" := false;
  NEW."admissionTokenHash" := NULL;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER superadmin_invitation_admission BEFORE INSERT ON superadmin_user
  FOR EACH ROW EXECUTE FUNCTION trevv_admit_superadmin();
--> statement-breakpoint
CREATE FUNCTION trevv_audit_superadmin_activation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO superadmin_audit (id, actor_id, action, target_type, target_id, reason, request_id)
    VALUES (gen_random_uuid()::text, NEW.id, 'administrator.activated', 'administrator', NEW.id,
      'Activated a separate administrator identity using a single-use invitation.', gen_random_uuid()::text);
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER superadmin_activation_audit AFTER INSERT ON superadmin_user
  FOR EACH ROW EXECUTE FUNCTION trevv_audit_superadmin_activation();
--> statement-breakpoint
CREATE FUNCTION trevv_protect_superadmin_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('trevv:superadmin-roster', 0));
  IF OLD.role = 'owner' AND NOT OLD.disabled AND (NEW.role <> 'owner' OR NEW.disabled)
    AND NOT EXISTS (SELECT 1 FROM superadmin_user WHERE id <> OLD.id AND role = 'owner' AND NOT disabled) THEN
    RAISE EXCEPTION 'The final active owner must retain access' USING ERRCODE = '23514';
  END IF;
  IF NEW.disabled OR NEW.role <> OLD.role THEN
    DELETE FROM superadmin_session WHERE "userId" = OLD.id;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER superadmin_owner_protection BEFORE UPDATE OF role, disabled ON superadmin_user
  FOR EACH ROW EXECUTE FUNCTION trevv_protect_superadmin_owner();
