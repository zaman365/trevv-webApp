ALTER TABLE "message_attachments" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "message_attachments" ADD COLUMN "conversation_id" text;--> statement-breakpoint
UPDATE "message_attachments" AS "attachment"
SET "workspace_id" = "message"."workspace_id",
	"conversation_id" = "message"."conversation_id"
FROM "conversation_messages" AS "message"
WHERE "attachment"."organization_id" = "message"."organization_id"
	AND "attachment"."message_id" = "message"."id";--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "message_attachments" AS "attachment"
		LEFT JOIN "conversation_participants" AS "participant"
			ON "participant"."organization_id" = "attachment"."organization_id"
			AND "participant"."workspace_id" = "attachment"."workspace_id"
			AND "participant"."conversation_id" = "attachment"."conversation_id"
			AND "participant"."user_id" = "attachment"."uploaded_by"
		WHERE "attachment"."workspace_id" IS NULL
			OR "attachment"."conversation_id" IS NULL
			OR "participant"."user_id" IS NULL
	) THEN
		RAISE EXCEPTION 'Cannot tenant-scope a legacy message attachment or its uploader';
	END IF;
END
$$;--> statement-breakpoint
ALTER TABLE "message_attachments" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "message_attachments" ALTER COLUMN "conversation_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_scoped_message_fk" FOREIGN KEY ("organization_id","workspace_id","conversation_id","message_id") REFERENCES "public"."conversation_messages"("organization_id","workspace_id","conversation_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_uploader_participant_fk" FOREIGN KEY ("organization_id","workspace_id","conversation_id","uploaded_by") REFERENCES "public"."conversation_participants"("organization_id","workspace_id","conversation_id","user_id") ON DELETE no action ON UPDATE no action;
