CREATE TABLE "registration_invitation_claims" (
	"invitation_id" text PRIMARY KEY NOT NULL,
	"auth_user_id" text,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "registrationInvitationTokenHash" text;--> statement-breakpoint
ALTER TABLE "registration_invitation_claims" ADD CONSTRAINT "registration_invitation_claims_invitation_id_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_invitation_claims" ADD CONSTRAINT "registration_invitation_claims_auth_user_id_user_id_fk" FOREIGN KEY ("auth_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "registration_invitation_claims_auth_user_unique" ON "registration_invitation_claims" USING btree ("auth_user_id");--> statement-breakpoint
CREATE FUNCTION "claim_registration_invitation_on_auth_user_insert"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
	eligible_invitation_id text;
BEGIN
	IF NEW."registrationInvitationTokenHash" IS NULL THEN
		RETURN NEW;
	END IF;

	SELECT invitation.id
	INTO eligible_invitation_id
	FROM public.invitations AS invitation
	WHERE invitation.token_hash = NEW."registrationInvitationTokenHash"
		AND lower(invitation.email) = lower(NEW.email)
		AND invitation.accepted_at IS NULL
		AND invitation.revoked_at IS NULL
		AND invitation.deleted_at IS NULL
		AND invitation.expires_at > now()
		AND NOT EXISTS (
			SELECT 1
			FROM public.registration_invitation_claims AS existing_claim
			WHERE existing_claim.invitation_id = invitation.id
		)
	FOR UPDATE;

	IF eligible_invitation_id IS NULL THEN
		RAISE EXCEPTION 'Invitation registration claim is unavailable.'
			USING ERRCODE = '23514';
	END IF;

	INSERT INTO public.registration_invitation_claims (
		invitation_id,
		auth_user_id,
		claimed_at
	)
	VALUES (eligible_invitation_id, NEW.id, now());

	UPDATE public."user"
	SET "registrationInvitationTokenHash" = NULL
	WHERE id = NEW.id;

	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "user_claim_registration_invitation_after_insert"
AFTER INSERT ON "user"
FOR EACH ROW
EXECUTE FUNCTION "claim_registration_invitation_on_auth_user_insert"();
