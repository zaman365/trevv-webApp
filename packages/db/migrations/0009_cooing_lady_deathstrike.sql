CREATE TYPE "public"."conversation_participant_source" AS ENUM('workspace', 'team', 'manual', 'direct', 'invitation');--> statement-breakpoint
CREATE TYPE "public"."team_feature_source" AS ENUM('preset', 'override');--> statement-breakpoint
CREATE TYPE "public"."team_member_role" AS ENUM('lead', 'member');--> statement-breakpoint
CREATE TABLE "collaboration_events" (
	"id" text PRIMARY KEY NOT NULL,
	"cursor" serial NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"conversation_id" text,
	"actor_id" text,
	"event_type" text NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collaboration_events_expiry_check" CHECK ("collaboration_events"."expires_at" > "collaboration_events"."created_at")
);
--> statement-breakpoint
CREATE TABLE "conversation_read_checkpoints" (
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"user_id" text NOT NULL,
	"last_read_message_id" text,
	"last_read_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_read_checkpoints_conversation_id_user_id_pk" PRIMARY KEY("conversation_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "invitation_team_assignments" (
	"organization_id" text NOT NULL,
	"invitation_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"team_id" text NOT NULL,
	"role" "team_member_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitation_team_assignments_invitation_id_team_id_pk" PRIMARY KEY("invitation_id","team_id")
);
--> statement-breakpoint
CREATE TABLE "invitation_workspace_assignments" (
	"organization_id" text NOT NULL,
	"invitation_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"can_manage" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitation_workspace_assignments_invitation_id_workspace_id_pk" PRIMARY KEY("invitation_id","workspace_id")
);
--> statement-breakpoint
CREATE TABLE "team_feature_policies" (
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"team_id" text NOT NULL,
	"feature_key" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"source" "team_feature_source" DEFAULT 'preset' NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_feature_policies_team_id_feature_key_pk" PRIMARY KEY("team_id","feature_key"),
	CONSTRAINT "team_feature_policies_feature_key_check" CHECK ("team_feature_policies"."feature_key" in ('work', 'messages', 'decisions', 'approvals', 'resources', 'reporting'))
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"team_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "team_member_role" DEFAULT 'member' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_members_team_id_user_id_pk" PRIMARY KEY("team_id","user_id"),
	CONSTRAINT "team_members_version_positive_check" CHECK ("team_members"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "team_rooms" (
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"team_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_rooms_team_id_pk" PRIMARY KEY("team_id")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"purpose" text DEFAULT '' NOT NULL,
	"preset_key" text DEFAULT 'custom' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "teams_version_positive_check" CHECK ("teams"."version" > 0),
	CONSTRAINT "teams_preset_key_check" CHECK ("teams"."preset_key" in ('leadership', 'marketing', 'technology', 'operations', 'sales', 'custom'))
);
--> statement-breakpoint
CREATE TABLE "legacy_collaboration_record_quarantine" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text,
	"conversation_id" text,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"quarantine_reason" text NOT NULL,
	"original_record" jsonb NOT NULL,
	"quarantined_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "legacy_collaboration_record_quarantine" ADD CONSTRAINT "legacy_collaboration_record_quarantine_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "legacy_collaboration_record_quarantine_entity_idx" ON "legacy_collaboration_record_quarantine" USING btree ("organization_id","entity_type","entity_id");--> statement-breakpoint
COMMENT ON TABLE "legacy_collaboration_record_quarantine" IS 'Operator-only preservation of pre-Phase-4 collaboration records normalized or removed during upgrade. Application APIs must never read this table. Message rows are deleted with message retention.';--> statement-breakpoint
UPDATE "conversations" AS "conversation"
SET "portfolio_id" = "workspace"."portfolio_id"
FROM "workspaces" AS "workspace"
WHERE "conversation"."organization_id" = "workspace"."organization_id"
  AND "conversation"."workspace_id" = "workspace"."id"
  AND "conversation"."portfolio_id" IS NULL;--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "conversations"
		WHERE "portfolio_id" IS NULL OR "workspace_id" IS NULL
	) THEN
		RAISE EXCEPTION 'Cannot scope legacy conversations without a Portfolio and Workspace';
	END IF;
END
$$;--> statement-breakpoint
ALTER TABLE "conversations" ALTER COLUMN "portfolio_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD COLUMN "sequence" serial NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD COLUMN "client_message_id" text;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD COLUMN "redacted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD COLUMN "source" "conversation_participant_source" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_reactions" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "conversation_reactions" ADD COLUMN "conversation_id" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "retention_days" integer DEFAULT 365 NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
UPDATE "conversation_messages" AS "message"
SET "workspace_id" = "conversation"."workspace_id",
	"client_message_id" = substr(md5("message"."organization_id" || ':' || "message"."id"), 1, 8)
		|| '-' || substr(md5("message"."organization_id" || ':' || "message"."id"), 9, 4)
		|| '-4' || substr(md5("message"."organization_id" || ':' || "message"."id"), 14, 3)
		|| '-8' || substr(md5("message"."organization_id" || ':' || "message"."id"), 18, 3)
		|| '-' || substr(md5("message"."organization_id" || ':' || "message"."id"), 21, 12),
	"expires_at" = "message"."created_at" + make_interval(days => "conversation"."retention_days")
FROM "conversations" AS "conversation"
WHERE "message"."organization_id" = "conversation"."organization_id"
  AND "message"."conversation_id" = "conversation"."id";--> statement-breakpoint
UPDATE "conversation_participants" AS "participant"
SET "workspace_id" = "conversation"."workspace_id"
FROM "conversations" AS "conversation"
WHERE "participant"."organization_id" = "conversation"."organization_id"
  AND "participant"."conversation_id" = "conversation"."id";--> statement-breakpoint
UPDATE "conversation_reactions" AS "reaction"
SET "workspace_id" = "message"."workspace_id",
	"conversation_id" = "message"."conversation_id"
FROM "conversation_messages" AS "message"
WHERE "reaction"."organization_id" = "message"."organization_id"
  AND "reaction"."message_id" = "message"."id";--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "conversations" AS "conversation"
		LEFT JOIN "workspaces" AS "workspace"
			ON "workspace"."organization_id" = "conversation"."organization_id"
			AND "workspace"."id" = "conversation"."workspace_id"
			AND "workspace"."portfolio_id" = "conversation"."portfolio_id"
		WHERE "conversation"."portfolio_id" IS NULL
			OR "conversation"."workspace_id" IS NULL
			OR "workspace"."id" IS NULL
	) THEN
		RAISE EXCEPTION 'Cannot upgrade a legacy conversation whose Organization, Portfolio, and Workspace scope disagree';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "conversations" AS "conversation"
		LEFT JOIN "memberships" AS "membership"
			ON "membership"."organization_id" = "conversation"."organization_id"
			AND "membership"."user_id" = "conversation"."created_by"
		WHERE "membership"."user_id" IS NULL
	) THEN
		RAISE EXCEPTION 'Cannot upgrade a legacy conversation whose creator is not an Organization member';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "conversation_messages" AS "message"
		LEFT JOIN "conversations" AS "conversation"
			ON "conversation"."organization_id" = "message"."organization_id"
			AND "conversation"."id" = "message"."conversation_id"
		WHERE "conversation"."id" IS NULL
	) OR EXISTS (
		SELECT 1
		FROM "conversation_participants" AS "participant"
		LEFT JOIN "conversations" AS "conversation"
			ON "conversation"."organization_id" = "participant"."organization_id"
			AND "conversation"."id" = "participant"."conversation_id"
		WHERE "conversation"."id" IS NULL
	) OR EXISTS (
		SELECT 1
		FROM "conversation_reactions" AS "reaction"
		LEFT JOIN "conversation_messages" AS "message"
			ON "message"."organization_id" = "reaction"."organization_id"
			AND "message"."id" = "reaction"."message_id"
		WHERE "message"."id" IS NULL
	) OR EXISTS (
		SELECT 1
		FROM "message_attachments" AS "attachment"
		LEFT JOIN "conversation_messages" AS "message"
			ON "message"."organization_id" = "attachment"."organization_id"
			AND "message"."id" = "attachment"."message_id"
		WHERE "message"."id" IS NULL
	) THEN
		RAISE EXCEPTION 'Cannot tenant-scope a legacy collaboration record whose Organization disagrees with its parent';
	END IF;

	IF EXISTS (
		WITH "required_memberships" AS (
			SELECT "message"."organization_id", "message"."sender_id" AS "user_id"
			FROM "conversation_messages" AS "message"
			UNION
			SELECT "message"."organization_id", "message"."response_owner_id"
			FROM "conversation_messages" AS "message"
			WHERE "message"."response_owner_id" IS NOT NULL
			UNION
			SELECT "participant"."organization_id", "participant"."user_id"
			FROM "conversation_participants" AS "participant"
			UNION
			SELECT "reaction"."organization_id", "reaction"."user_id"
			FROM "conversation_reactions" AS "reaction"
			UNION
			SELECT "attachment"."organization_id", "attachment"."uploaded_by"
			FROM "message_attachments" AS "attachment"
		)
		SELECT 1
		FROM "required_memberships" AS "required"
		LEFT JOIN "memberships" AS "membership"
			ON "membership"."organization_id" = "required"."organization_id"
			AND "membership"."user_id" = "required"."user_id"
		WHERE "membership"."user_id" IS NULL
	) THEN
		RAISE EXCEPTION 'Cannot upgrade a legacy collaboration actor without an Organization membership';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "conversations" AS "conversation"
		INNER JOIN "conversation_participants" AS "participant"
			ON "participant"."organization_id" = "conversation"."organization_id"
			AND "participant"."conversation_id" = "conversation"."id"
			AND "participant"."removed_at" IS NULL
		WHERE "conversation"."kind" <> 'team'
		GROUP BY "conversation"."organization_id", "conversation"."id"
		HAVING count(*) > 250
	) THEN
		RAISE EXCEPTION 'Cannot upgrade a legacy non-Team conversation with more than 250 active participants';
	END IF;
END
$$;--> statement-breakpoint
INSERT INTO "legacy_collaboration_record_quarantine" (
	"id", "organization_id", "workspace_id", "conversation_id",
	"entity_type", "entity_id", "quarantine_reason", "original_record"
)
SELECT md5("conversation"."organization_id" || chr(31) || 'conversation' || chr(31)
		|| "conversation"."id" || chr(31) || 'legacy_conversation_contract_bounds'),
	"conversation"."organization_id", "conversation"."workspace_id", "conversation"."id",
	'conversation', "conversation"."id", 'legacy_conversation_contract_bounds',
	to_jsonb("conversation")
FROM "conversations" AS "conversation"
WHERE length(trim("conversation"."title")) = 0
	OR octet_length(convert_to(trim("conversation"."title"), 'UTF8')) > 160
	OR octet_length(convert_to(trim("conversation"."purpose"), 'UTF8')) > 1000
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
UPDATE "conversations" AS "conversation"
SET "title" = CASE
		WHEN length(trim("conversation"."title")) = 0
			OR octet_length(convert_to(trim("conversation"."title"), 'UTF8')) > 160
			THEN 'Legacy conversation ' || left(md5("conversation"."id"), 12)
		ELSE trim("conversation"."title")
	END,
	"purpose" = CASE
		WHEN octet_length(convert_to(trim("conversation"."purpose"), 'UTF8')) > 1000
			THEN '[Legacy purpose quarantined:' || left(md5("conversation"."purpose"), 16) || ']'
		ELSE trim("conversation"."purpose")
	END,
	"version" = "conversation"."version" + 1,
	"updated_at" = now()
WHERE length(trim("conversation"."title")) = 0
	OR octet_length(convert_to(trim("conversation"."title"), 'UTF8')) > 160
	OR octet_length(convert_to(trim("conversation"."purpose"), 'UTF8')) > 1000;--> statement-breakpoint
INSERT INTO "legacy_collaboration_record_quarantine" (
	"id", "organization_id", "workspace_id", "conversation_id",
	"entity_type", "entity_id", "quarantine_reason", "original_record"
)
SELECT md5("message"."organization_id" || chr(31) || 'message' || chr(31)
		|| "message"."id" || chr(31) || 'legacy_message_body_contract_bounds'),
	"message"."organization_id", "message"."workspace_id", "message"."conversation_id",
	'message', "message"."id", 'legacy_message_body_contract_bounds', to_jsonb("message")
FROM "conversation_messages" AS "message"
WHERE length(trim("message"."body")) = 0
	OR octet_length(convert_to(trim("message"."body"), 'UTF8')) > 20000
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
UPDATE "conversation_messages" AS "message"
SET "body" = '[Legacy message body quarantined:' || left(md5("message"."body"), 16) || ']',
	"version" = "message"."version" + 1,
	"updated_at" = now()
WHERE length(trim("message"."body")) = 0
	OR octet_length(convert_to(trim("message"."body"), 'UTF8')) > 20000;--> statement-breakpoint
INSERT INTO "legacy_collaboration_record_quarantine" (
	"id", "organization_id", "workspace_id", "conversation_id",
	"entity_type", "entity_id", "quarantine_reason", "original_record"
)
SELECT md5("message"."organization_id" || chr(31) || 'message' || chr(31)
		|| "message"."id" || chr(31) || 'legacy_message_link_invalid'),
	"message"."organization_id", "message"."workspace_id", "message"."conversation_id",
	'message', "message"."id", 'legacy_message_link_invalid', to_jsonb("message")
FROM "conversation_messages" AS "message"
WHERE ("message"."linked_entity_type" IS NULL) <> ("message"."linked_entity_id" IS NULL)
	OR (
		"message"."linked_entity_type" IS NOT NULL
		AND octet_length(convert_to(trim("message"."linked_entity_type"), 'UTF8')) > 80
	)
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
UPDATE "conversation_messages" AS "message"
SET "linked_entity_type" = NULL,
	"linked_entity_id" = NULL,
	"version" = "message"."version" + 1,
	"updated_at" = now()
WHERE ("message"."linked_entity_type" IS NULL) <> ("message"."linked_entity_id" IS NULL)
	OR (
		"message"."linked_entity_type" IS NOT NULL
		AND octet_length(convert_to(trim("message"."linked_entity_type"), 'UTF8')) > 80
	);--> statement-breakpoint
INSERT INTO "legacy_collaboration_record_quarantine" (
	"id", "organization_id", "workspace_id", "conversation_id",
	"entity_type", "entity_id", "quarantine_reason", "original_record"
)
SELECT md5("message"."organization_id" || chr(31) || 'message' || chr(31)
		|| "message"."id" || chr(31) || 'legacy_message_response_owner_missing'),
	"message"."organization_id", "message"."workspace_id", "message"."conversation_id",
	'message', "message"."id", 'legacy_message_response_owner_missing', to_jsonb("message")
FROM "conversation_messages" AS "message"
WHERE "message"."response_state" IS NOT NULL
	AND "message"."response_owner_id" IS NULL
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
UPDATE "conversation_messages" AS "message"
SET "response_state" = NULL,
	"response_due_at" = NULL,
	"version" = "message"."version" + 1,
	"updated_at" = now()
WHERE "message"."response_state" IS NOT NULL
	AND "message"."response_owner_id" IS NULL;--> statement-breakpoint
INSERT INTO "legacy_collaboration_record_quarantine" (
	"id", "organization_id", "workspace_id", "conversation_id",
	"entity_type", "entity_id", "quarantine_reason", "original_record"
)
SELECT md5("message"."organization_id" || chr(31) || 'message' || chr(31)
		|| "message"."id" || chr(31) || 'legacy_message_parent_scope_mismatch'),
	"message"."organization_id", "message"."workspace_id", "message"."conversation_id",
	'message', "message"."id", 'legacy_message_parent_scope_mismatch', to_jsonb("message")
FROM "conversation_messages" AS "message"
INNER JOIN "conversation_messages" AS "parent" ON "parent"."id" = "message"."parent_message_id"
WHERE "parent"."organization_id" <> "message"."organization_id"
	OR "parent"."conversation_id" <> "message"."conversation_id"
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
UPDATE "conversation_messages" AS "message"
SET "parent_message_id" = NULL,
	"version" = "message"."version" + 1,
	"updated_at" = now()
FROM "conversation_messages" AS "parent"
WHERE "parent"."id" = "message"."parent_message_id"
	AND (
		"parent"."organization_id" <> "message"."organization_id"
		OR "parent"."conversation_id" <> "message"."conversation_id"
	);--> statement-breakpoint
INSERT INTO "legacy_collaboration_record_quarantine" (
	"id", "organization_id", "workspace_id", "conversation_id",
	"entity_type", "entity_id", "quarantine_reason", "original_record"
)
SELECT md5("participant"."organization_id" || chr(31) || 'participant' || chr(31)
		|| "participant"."conversation_id" || chr(31) || "participant"."user_id"
		|| chr(31) || 'legacy_participant_contract_values'),
	"participant"."organization_id", "participant"."workspace_id",
	"participant"."conversation_id", 'participant',
	"participant"."conversation_id" || ':' || "participant"."user_id",
	'legacy_participant_contract_values', to_jsonb("participant")
FROM "conversation_participants" AS "participant"
WHERE "participant"."participant_role" NOT IN ('owner', 'member', 'guest')
	OR "participant"."notification_level" NOT IN ('all', 'mentions', 'none')
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
UPDATE "conversation_participants" AS "participant"
SET "participant_role" = CASE
		WHEN "participant"."participant_role" IN ('owner', 'member', 'guest')
			THEN "participant"."participant_role"
		WHEN "participant"."user_id" = "conversation"."created_by" THEN 'owner'
		WHEN "membership"."role" = 'guest' THEN 'guest'
		ELSE 'member'
	END,
	"notification_level" = CASE
		WHEN "participant"."notification_level" IN ('all', 'mentions', 'none')
			THEN "participant"."notification_level"
		ELSE 'none'
	END,
	"version" = "participant"."version" + 1,
	"updated_at" = now()
FROM "memberships" AS "membership", "conversations" AS "conversation"
WHERE "membership"."organization_id" = "participant"."organization_id"
	AND "membership"."user_id" = "participant"."user_id"
	AND "conversation"."organization_id" = "participant"."organization_id"
	AND "conversation"."id" = "participant"."conversation_id"
	AND (
		"participant"."participant_role" NOT IN ('owner', 'member', 'guest')
		OR "participant"."notification_level" NOT IN ('all', 'mentions', 'none')
	);--> statement-breakpoint
INSERT INTO "legacy_collaboration_record_quarantine" (
	"id", "organization_id", "workspace_id", "conversation_id",
	"entity_type", "entity_id", "quarantine_reason", "original_record"
)
SELECT md5("reaction"."organization_id" || chr(31) || 'reaction' || chr(31)
		|| "reaction"."message_id" || chr(31) || "reaction"."user_id" || chr(31)
		|| "reaction"."emoji" || chr(31) || 'legacy_reaction_emoji_invalid'),
	"reaction"."organization_id", "reaction"."workspace_id", "reaction"."conversation_id",
	'reaction', "reaction"."message_id" || ':' || "reaction"."user_id" || ':' || md5("reaction"."emoji"),
	'legacy_reaction_emoji_invalid', to_jsonb("reaction")
FROM "conversation_reactions" AS "reaction"
WHERE length(trim("reaction"."emoji")) = 0
	OR octet_length(convert_to(trim("reaction"."emoji"), 'UTF8')) > 32
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
DELETE FROM "conversation_reactions" AS "reaction"
WHERE length(trim("reaction"."emoji")) = 0
	OR octet_length(convert_to(trim("reaction"."emoji"), 'UTF8')) > 32;--> statement-breakpoint
WITH "ranked_reactions" AS (
	SELECT "reaction".*,
		dense_rank() OVER (
			PARTITION BY "reaction"."organization_id", "reaction"."message_id"
			ORDER BY "reaction"."emoji"
		) AS "emoji_rank"
	FROM "conversation_reactions" AS "reaction"
)
INSERT INTO "legacy_collaboration_record_quarantine" (
	"id", "organization_id", "workspace_id", "conversation_id",
	"entity_type", "entity_id", "quarantine_reason", "original_record"
)
SELECT md5("reaction"."organization_id" || chr(31) || 'reaction' || chr(31)
		|| "reaction"."message_id" || chr(31) || "reaction"."user_id" || chr(31)
		|| "reaction"."emoji" || chr(31) || 'legacy_message_reaction_kind_overflow'),
	"reaction"."organization_id", "reaction"."workspace_id", "reaction"."conversation_id",
	'reaction', "reaction"."message_id" || ':' || "reaction"."user_id" || ':' || md5("reaction"."emoji"),
	'legacy_message_reaction_kind_overflow', to_jsonb("reaction")
FROM "ranked_reactions" AS "reaction"
WHERE "reaction"."emoji_rank" > 50
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
WITH "ranked_reactions" AS (
	SELECT "reaction"."message_id", "reaction"."user_id", "reaction"."emoji",
		dense_rank() OVER (
			PARTITION BY "reaction"."organization_id", "reaction"."message_id"
			ORDER BY "reaction"."emoji"
		) AS "emoji_rank"
	FROM "conversation_reactions" AS "reaction"
)
DELETE FROM "conversation_reactions" AS "reaction"
USING "ranked_reactions" AS "ranked"
WHERE "reaction"."message_id" = "ranked"."message_id"
	AND "reaction"."user_id" = "ranked"."user_id"
	AND "reaction"."emoji" = "ranked"."emoji"
	AND "ranked"."emoji_rank" > 50;--> statement-breakpoint
WITH "required_participants" AS (
	SELECT "message"."organization_id", "message"."workspace_id",
		"message"."conversation_id", "message"."sender_id" AS "user_id"
	FROM "conversation_messages" AS "message"
	UNION
	SELECT "message"."organization_id", "message"."workspace_id",
		"message"."conversation_id", "message"."response_owner_id"
	FROM "conversation_messages" AS "message"
	WHERE "message"."response_owner_id" IS NOT NULL
	UNION
	SELECT "reaction"."organization_id", "reaction"."workspace_id",
		"reaction"."conversation_id", "reaction"."user_id"
	FROM "conversation_reactions" AS "reaction"
	UNION
	SELECT "attachment"."organization_id", "message"."workspace_id",
		"message"."conversation_id", "attachment"."uploaded_by"
	FROM "message_attachments" AS "attachment"
	INNER JOIN "conversation_messages" AS "message"
		ON "message"."organization_id" = "attachment"."organization_id"
		AND "message"."id" = "attachment"."message_id"
)
INSERT INTO "conversation_participants" (
	"organization_id", "conversation_id", "workspace_id", "user_id",
	"participant_role", "source", "notification_level", "joined_at",
	"removed_at", "version", "updated_at"
)
SELECT "required"."organization_id", "required"."conversation_id",
	"required"."workspace_id", "required"."user_id",
	CASE WHEN "membership"."role" = 'guest' THEN 'guest' ELSE 'member' END,
	'manual', 'none', now(), now(), 1, now()
FROM "required_participants" AS "required"
INNER JOIN "memberships" AS "membership"
	ON "membership"."organization_id" = "required"."organization_id"
	AND "membership"."user_id" = "required"."user_id"
LEFT JOIN "conversation_participants" AS "participant"
	ON "participant"."organization_id" = "required"."organization_id"
	AND "participant"."conversation_id" = "required"."conversation_id"
	AND "participant"."user_id" = "required"."user_id"
WHERE "participant"."user_id" IS NULL
ON CONFLICT ("conversation_id", "user_id") DO NOTHING;--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM "conversation_messages"
		WHERE "workspace_id" IS NULL OR "client_message_id" IS NULL OR "expires_at" IS NULL
	) OR EXISTS (
		SELECT 1 FROM "conversation_participants" WHERE "workspace_id" IS NULL
	) OR EXISTS (
		SELECT 1 FROM "conversation_reactions"
		WHERE "workspace_id" IS NULL OR "conversation_id" IS NULL
	) THEN
		RAISE EXCEPTION 'Cannot tenant-scope legacy collaboration rows';
	END IF;
END
$$;--> statement-breakpoint
ALTER TABLE "conversation_messages" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_messages" ALTER COLUMN "client_message_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_messages" ALTER COLUMN "expires_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_participants" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_reactions" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_reactions" ALTER COLUMN "conversation_id" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_org_id_unique" ON "invitations" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_members_org_workspace_user_unique" ON "workspace_members" USING btree ("organization_id","workspace_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_org_id_unique" ON "conversations" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_org_workspace_id_unique" ON "conversations" USING btree ("organization_id","workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_messages_org_conversation_id_unique" ON "conversation_messages" USING btree ("organization_id","conversation_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_messages_org_workspace_conversation_id_unique" ON "conversation_messages" USING btree ("organization_id","workspace_id","conversation_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_participants_org_conversation_user_unique" ON "conversation_participants" USING btree ("organization_id","conversation_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_participants_org_workspace_conversation_user_unique" ON "conversation_participants" USING btree ("organization_id","workspace_id","conversation_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invitation_workspace_assignments_scope_unique" ON "invitation_workspace_assignments" USING btree ("organization_id","invitation_id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_org_id_unique" ON "teams" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_org_workspace_id_unique" ON "teams" USING btree ("organization_id","workspace_id","id");--> statement-breakpoint
ALTER TABLE "collaboration_events" ADD CONSTRAINT "collaboration_events_org_workspace_fk" FOREIGN KEY ("organization_id","workspace_id") REFERENCES "public"."workspaces"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collaboration_events" ADD CONSTRAINT "collaboration_events_org_workspace_conversation_fk" FOREIGN KEY ("organization_id","workspace_id","conversation_id") REFERENCES "public"."conversations"("organization_id","workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collaboration_events" ADD CONSTRAINT "collaboration_events_org_actor_fk" FOREIGN KEY ("organization_id","actor_id") REFERENCES "public"."memberships"("organization_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_read_checkpoints" ADD CONSTRAINT "conversation_read_checkpoints_participant_fk" FOREIGN KEY ("organization_id","workspace_id","conversation_id","user_id") REFERENCES "public"."conversation_participants"("organization_id","workspace_id","conversation_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_read_checkpoints" ADD CONSTRAINT "conversation_read_checkpoints_message_fk" FOREIGN KEY ("organization_id","workspace_id","conversation_id","last_read_message_id") REFERENCES "public"."conversation_messages"("organization_id","workspace_id","conversation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_team_assignments" ADD CONSTRAINT "invitation_team_assignments_workspace_assignment_fk" FOREIGN KEY ("organization_id","invitation_id","workspace_id") REFERENCES "public"."invitation_workspace_assignments"("organization_id","invitation_id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_team_assignments" ADD CONSTRAINT "invitation_team_assignments_org_workspace_team_fk" FOREIGN KEY ("organization_id","workspace_id","team_id") REFERENCES "public"."teams"("organization_id","workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_workspace_assignments" ADD CONSTRAINT "invitation_workspace_assignments_org_invitation_fk" FOREIGN KEY ("organization_id","invitation_id") REFERENCES "public"."invitations"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_workspace_assignments" ADD CONSTRAINT "invitation_workspace_assignments_org_workspace_fk" FOREIGN KEY ("organization_id","workspace_id") REFERENCES "public"."workspaces"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_feature_policies" ADD CONSTRAINT "team_feature_policies_org_workspace_team_fk" FOREIGN KEY ("organization_id","workspace_id","team_id") REFERENCES "public"."teams"("organization_id","workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_feature_policies" ADD CONSTRAINT "team_feature_policies_org_updater_fk" FOREIGN KEY ("organization_id","updated_by") REFERENCES "public"."memberships"("organization_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_org_workspace_team_fk" FOREIGN KEY ("organization_id","workspace_id","team_id") REFERENCES "public"."teams"("organization_id","workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_org_workspace_member_fk" FOREIGN KEY ("organization_id","workspace_id","user_id") REFERENCES "public"."workspace_members"("organization_id","workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_rooms" ADD CONSTRAINT "team_rooms_org_workspace_team_fk" FOREIGN KEY ("organization_id","workspace_id","team_id") REFERENCES "public"."teams"("organization_id","workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_rooms" ADD CONSTRAINT "team_rooms_org_workspace_conversation_fk" FOREIGN KEY ("organization_id","workspace_id","conversation_id") REFERENCES "public"."conversations"("organization_id","workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_org_workspace_fk" FOREIGN KEY ("organization_id","workspace_id") REFERENCES "public"."workspaces"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "collaboration_events_org_id_unique" ON "collaboration_events" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "collaboration_events_org_cursor_unique" ON "collaboration_events" USING btree ("organization_id","cursor");--> statement-breakpoint
CREATE INDEX "collaboration_events_workspace_feed_idx" ON "collaboration_events" USING btree ("organization_id","workspace_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "team_members_org_workspace_team_user_unique" ON "team_members" USING btree ("organization_id","workspace_id","team_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "team_members_one_active_lead_unique" ON "team_members" USING btree ("organization_id","team_id") WHERE "team_members"."role" = 'lead' and "team_members"."removed_at" is null;--> statement-breakpoint
CREATE INDEX "team_members_user_active_idx" ON "team_members" USING btree ("organization_id","user_id","removed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "team_rooms_conversation_unique" ON "team_rooms" USING btree ("conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "team_rooms_org_workspace_team_unique" ON "team_rooms" USING btree ("organization_id","workspace_id","team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_workspace_active_slug_unique" ON "teams" USING btree ("organization_id","workspace_id","slug") WHERE "teams"."archived_at" is null and "teams"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "teams_workspace_name_idx" ON "teams" USING btree ("organization_id","workspace_id","name");--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_org_workspace_conversation_fk" FOREIGN KEY ("organization_id","workspace_id","conversation_id") REFERENCES "public"."conversations"("organization_id","workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_org_sender_participant_fk" FOREIGN KEY ("organization_id","conversation_id","sender_id") REFERENCES "public"."conversation_participants"("organization_id","conversation_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_org_response_owner_participant_fk" FOREIGN KEY ("organization_id","conversation_id","response_owner_id") REFERENCES "public"."conversation_participants"("organization_id","conversation_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_scoped_parent_fk" FOREIGN KEY ("organization_id","conversation_id","parent_message_id") REFERENCES "public"."conversation_messages"("organization_id","conversation_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_org_workspace_conversation_fk" FOREIGN KEY ("organization_id","workspace_id","conversation_id") REFERENCES "public"."conversations"("organization_id","workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_org_membership_fk" FOREIGN KEY ("organization_id","user_id") REFERENCES "public"."memberships"("organization_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_reactions" ADD CONSTRAINT "conversation_reactions_scoped_message_fk" FOREIGN KEY ("organization_id","workspace_id","conversation_id","message_id") REFERENCES "public"."conversation_messages"("organization_id","workspace_id","conversation_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_reactions" ADD CONSTRAINT "conversation_reactions_participant_fk" FOREIGN KEY ("organization_id","workspace_id","conversation_id","user_id") REFERENCES "public"."conversation_participants"("organization_id","workspace_id","conversation_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_org_portfolio_workspace_fk" FOREIGN KEY ("organization_id","portfolio_id","workspace_id") REFERENCES "public"."workspaces"("organization_id","portfolio_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_org_creator_membership_fk" FOREIGN KEY ("organization_id","created_by") REFERENCES "public"."memberships"("organization_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_messages_org_conversation_sequence_unique" ON "conversation_messages" USING btree ("organization_id","conversation_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_messages_client_id_unique" ON "conversation_messages" USING btree ("organization_id","conversation_id","sender_id","client_message_id");--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_version_positive_check" CHECK ("conversation_messages"."version" > 0);--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_body_check" CHECK (length(trim("conversation_messages"."body")) between 1 and 20000);--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_link_check" CHECK (("conversation_messages"."linked_entity_type" is null) = ("conversation_messages"."linked_entity_id" is null));--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_response_check" CHECK ("conversation_messages"."response_state" is null or "conversation_messages"."response_owner_id" is not null);--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_expiry_check" CHECK ("conversation_messages"."expires_at" is null or "conversation_messages"."expires_at" > "conversation_messages"."created_at");--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_version_positive_check" CHECK ("conversation_participants"."version" > 0);--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_role_check" CHECK ("conversation_participants"."participant_role" in ('owner', 'member', 'guest'));--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_notification_check" CHECK ("conversation_participants"."notification_level" in ('all', 'mentions', 'none'));--> statement-breakpoint
ALTER TABLE "conversation_reactions" ADD CONSTRAINT "conversation_reactions_emoji_check" CHECK (length(trim("conversation_reactions"."emoji")) between 1 and 32);--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_kind_visibility_check" CHECK (("conversations"."kind" = 'workspace' and "conversations"."visibility" in ('organization', 'private'))
        or ("conversations"."kind" in ('team', 'direct') and "conversations"."visibility" = 'private')
        or ("conversations"."kind" = 'external' and "conversations"."visibility" = 'guest_scoped'));--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_retention_days_check" CHECK ("conversations"."retention_days" between 1 and 3650);--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_version_positive_check" CHECK ("conversations"."version" > 0);
