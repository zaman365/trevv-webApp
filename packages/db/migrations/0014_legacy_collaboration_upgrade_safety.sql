ALTER TYPE "public"."message_response_state" ADD VALUE IF NOT EXISTS 'cancelled';--> statement-breakpoint
ALTER TABLE "conversation_messages" DROP CONSTRAINT "conversation_messages_response_check";--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_response_check" CHECK ("conversation_messages"."response_state" is null or "conversation_messages"."response_state"::text = 'cancelled' or "conversation_messages"."response_owner_id" is not null);--> statement-breakpoint
CREATE TABLE "conversation_message_metadata_quarantine" (
	"message_id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"original_metadata" jsonb NOT NULL,
	"original_octet_length" integer NOT NULL,
	"quarantine_reason" text NOT NULL,
	"quarantined_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "conversation_message_metadata_quarantine" ADD CONSTRAINT "conversation_message_metadata_quarantine_scoped_message_fk" FOREIGN KEY ("organization_id","workspace_id","conversation_id","message_id") REFERENCES "public"."conversation_messages"("organization_id","workspace_id","conversation_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversation_message_metadata_quarantine_scope_idx" ON "conversation_message_metadata_quarantine" USING btree ("organization_id","workspace_id","conversation_id");--> statement-breakpoint
COMMENT ON TABLE "conversation_message_metadata_quarantine" IS 'Restricted operational quarantine for pre-Phase-4 message metadata that cannot be returned by the bounded API contract. Recover only through an operator-reviewed sanitization; application APIs must never read this table.';--> statement-breakpoint
CREATE FUNCTION "trevv_message_metadata_is_safe"("candidate" jsonb) RETURNS boolean AS $$
DECLARE
	key_count integer;
	has_invalid_node boolean;
BEGIN
	IF jsonb_typeof("candidate") <> 'object'
		OR octet_length(convert_to("candidate"::text, 'UTF8')) > 8192 THEN
		RETURN false;
	END IF;

	WITH RECURSIVE "nodes"("value", "depth", "is_object_key", "key_name") AS (
		SELECT "candidate", 0, false, NULL::text
		UNION ALL
		SELECT "child"."value", "nodes"."depth" + 1, "child"."is_object_key", "child"."key_name"
		FROM "nodes"
		CROSS JOIN LATERAL (
			SELECT "entry"."value", true AS "is_object_key", "entry"."key" AS "key_name"
			FROM jsonb_each(
				CASE WHEN jsonb_typeof("nodes"."value") = 'object'
					THEN "nodes"."value" ELSE '{}'::jsonb END
			) AS "entry"
			UNION ALL
			SELECT "entry"."value", false AS "is_object_key", NULL::text AS "key_name"
			FROM jsonb_array_elements(
				CASE WHEN jsonb_typeof("nodes"."value") = 'array'
					THEN "nodes"."value" ELSE '[]'::jsonb END
			) AS "entry"
		) AS "child"
		WHERE "nodes"."depth" < 4
	)
	SELECT count(*) FILTER (WHERE "is_object_key")::integer,
		coalesce(bool_or(
			("is_object_key" AND octet_length(convert_to("key_name", 'UTF8')) > 64)
			OR (jsonb_typeof("value") = 'array' AND jsonb_array_length("value") > 50)
			OR (jsonb_typeof("value") IN ('object', 'array') AND "depth" >= 4)
			OR (
				jsonb_typeof("value") = 'string'
				AND octet_length(convert_to("value" #>> '{}', 'UTF8')) > 1000
			)
			OR (
				jsonb_typeof("value") = 'number'
				AND abs(("value" #>> '{}')::numeric) > '1.7976931348623157e308'::numeric
			)
		), false)
	INTO key_count, has_invalid_node
	FROM "nodes";

	RETURN key_count <= 32 AND NOT has_invalid_node;
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT;--> statement-breakpoint
INSERT INTO "conversation_message_metadata_quarantine" (
	"message_id", "organization_id", "workspace_id", "conversation_id",
	"original_metadata", "original_octet_length", "quarantine_reason"
)
SELECT "message"."id", "message"."organization_id", "message"."workspace_id",
	"message"."conversation_id", "message"."metadata",
	octet_length(convert_to("message"."metadata"::text, 'UTF8')),
	'legacy_metadata_outside_phase4_bounds'
FROM "conversation_messages" AS "message"
WHERE NOT "trevv_message_metadata_is_safe"("message"."metadata")
ON CONFLICT ("message_id") DO NOTHING;--> statement-breakpoint
UPDATE "conversation_messages" AS "message"
SET "metadata" = jsonb_build_object(
		'legacyMetadataQuarantined', true,
		'legacyMetadataSha256', encode(
			sha256(convert_to("message"."metadata"::text, 'UTF8')),
			'hex'
		)
	),
	"version" = "message"."version" + 1,
	"updated_at" = now()
WHERE NOT "trevv_message_metadata_is_safe"("message"."metadata");--> statement-breakpoint
DROP FUNCTION "trevv_message_metadata_is_safe"(jsonb);--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "conversations" AS "conversation"
		WHERE "conversation"."kind" = 'team'
			AND "conversation"."archived_at" IS NULL
			AND "conversation"."deleted_at" IS NULL
			AND NOT EXISTS (
				SELECT 1 FROM "team_rooms" AS "room"
				WHERE "room"."organization_id" = "conversation"."organization_id"
					AND "room"."conversation_id" = "conversation"."id"
			)
			AND NOT EXISTS (
				SELECT 1
				FROM "conversation_participants" AS "participant"
				INNER JOIN "memberships" AS "membership"
					ON "membership"."organization_id" = "participant"."organization_id"
					AND "membership"."user_id" = "participant"."user_id"
					AND "membership"."role" NOT IN ('guest', 'viewer')
					AND "membership"."archived_at" IS NULL
					AND "membership"."deleted_at" IS NULL
				INNER JOIN "workspace_members" AS "workspace_member"
					ON "workspace_member"."organization_id" = "participant"."organization_id"
					AND "workspace_member"."workspace_id" = "conversation"."workspace_id"
					AND "workspace_member"."user_id" = "participant"."user_id"
					AND "workspace_member"."archived_at" IS NULL
					AND "workspace_member"."deleted_at" IS NULL
				WHERE "participant"."organization_id" = "conversation"."organization_id"
					AND "participant"."conversation_id" = "conversation"."id"
					AND "participant"."removed_at" IS NULL
			)
	) THEN
		RAISE EXCEPTION 'Cannot convert an active legacy Team room without an active internal Workspace member';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "conversations" AS "conversation"
		INNER JOIN "conversation_participants" AS "participant"
			ON "participant"."organization_id" = "conversation"."organization_id"
			AND "participant"."conversation_id" = "conversation"."id"
			AND "participant"."removed_at" IS NULL
		INNER JOIN "memberships" AS "membership"
			ON "membership"."organization_id" = "participant"."organization_id"
			AND "membership"."user_id" = "participant"."user_id"
			AND "membership"."role" NOT IN ('guest', 'viewer')
			AND "membership"."archived_at" IS NULL
			AND "membership"."deleted_at" IS NULL
		INNER JOIN "workspace_members" AS "workspace_member"
			ON "workspace_member"."organization_id" = "participant"."organization_id"
			AND "workspace_member"."workspace_id" = "conversation"."workspace_id"
			AND "workspace_member"."user_id" = "participant"."user_id"
			AND "workspace_member"."archived_at" IS NULL
			AND "workspace_member"."deleted_at" IS NULL
		WHERE "conversation"."kind" = 'team'
			AND NOT EXISTS (
				SELECT 1 FROM "team_rooms" AS "room"
				WHERE "room"."organization_id" = "conversation"."organization_id"
					AND "room"."conversation_id" = "conversation"."id"
			)
		GROUP BY "conversation"."organization_id", "conversation"."id"
		HAVING count(*) > 250
	) THEN
		RAISE EXCEPTION 'Cannot convert a legacy Team room with more than 250 active internal members';
	END IF;
END
$$;--> statement-breakpoint
INSERT INTO "teams" (
	"id", "organization_id", "workspace_id", "name", "slug", "purpose",
	"preset_key", "version", "created_at", "updated_at", "archived_at", "deleted_at"
)
SELECT substr(md5("conversation"."organization_id" || chr(31) || "conversation"."id" || chr(31) || 'team'), 1, 8)
		|| '-' || substr(md5("conversation"."organization_id" || chr(31) || "conversation"."id" || chr(31) || 'team'), 9, 4)
		|| '-4' || substr(md5("conversation"."organization_id" || chr(31) || "conversation"."id" || chr(31) || 'team'), 14, 3)
		|| '-8' || substr(md5("conversation"."organization_id" || chr(31) || "conversation"."id" || chr(31) || 'team'), 18, 3)
		|| '-' || substr(md5("conversation"."organization_id" || chr(31) || "conversation"."id" || chr(31) || 'team'), 21, 12),
	"conversation"."organization_id", "conversation"."workspace_id",
	CASE
		WHEN length(trim("conversation"."title")) = 0
			THEN 'Legacy Team ' || left("conversation"."id", 32)
		ELSE left(trim("conversation"."title"), 160)
	END,
	'legacy-' || md5("conversation"."organization_id" || chr(31) || "conversation"."id"),
	left(trim("conversation"."purpose"), 1000), 'custom', 1,
	"conversation"."created_at", "conversation"."updated_at",
	"conversation"."archived_at", "conversation"."deleted_at"
FROM "conversations" AS "conversation"
WHERE "conversation"."kind" = 'team'
	AND NOT EXISTS (
		SELECT 1 FROM "team_rooms" AS "room"
		WHERE "room"."organization_id" = "conversation"."organization_id"
			AND "room"."conversation_id" = "conversation"."id"
	);--> statement-breakpoint
UPDATE "conversation_participants" AS "participant"
SET "removed_at" = now(),
	"version" = "participant"."version" + 1,
	"updated_at" = now()
FROM "conversations" AS "conversation"
WHERE "conversation"."organization_id" = "participant"."organization_id"
	AND "conversation"."id" = "participant"."conversation_id"
	AND "conversation"."kind" = 'team'
	AND "participant"."removed_at" IS NULL
	AND NOT EXISTS (
		SELECT 1 FROM "team_rooms" AS "room"
		WHERE "room"."organization_id" = "conversation"."organization_id"
			AND "room"."conversation_id" = "conversation"."id"
	)
	AND NOT EXISTS (
		SELECT 1
		FROM "memberships" AS "membership"
		INNER JOIN "workspace_members" AS "workspace_member"
			ON "workspace_member"."organization_id" = "membership"."organization_id"
			AND "workspace_member"."workspace_id" = "conversation"."workspace_id"
			AND "workspace_member"."user_id" = "membership"."user_id"
			AND "workspace_member"."archived_at" IS NULL
			AND "workspace_member"."deleted_at" IS NULL
		WHERE "membership"."organization_id" = "participant"."organization_id"
			AND "membership"."user_id" = "participant"."user_id"
			AND "membership"."role" NOT IN ('guest', 'viewer')
			AND "membership"."archived_at" IS NULL
			AND "membership"."deleted_at" IS NULL
	);--> statement-breakpoint
WITH "ranked_internal_participants" AS (
	SELECT "participant"."organization_id", "participant"."conversation_id",
		"participant"."user_id",
		row_number() OVER (
			PARTITION BY "participant"."organization_id", "participant"."conversation_id"
			ORDER BY
				("participant"."participant_role" = 'owner') DESC,
				CASE "membership"."role"
					WHEN 'owner' THEN 0
					WHEN 'admin' THEN 1
					WHEN 'workspace_lead' THEN 2
					ELSE 3
				END,
				"participant"."joined_at",
				"participant"."user_id"
		) AS "member_rank"
	FROM "conversation_participants" AS "participant"
	INNER JOIN "conversations" AS "conversation"
		ON "conversation"."organization_id" = "participant"."organization_id"
		AND "conversation"."id" = "participant"."conversation_id"
		AND "conversation"."kind" = 'team'
	INNER JOIN "memberships" AS "membership"
		ON "membership"."organization_id" = "participant"."organization_id"
		AND "membership"."user_id" = "participant"."user_id"
		AND "membership"."role" NOT IN ('guest', 'viewer')
		AND "membership"."archived_at" IS NULL
		AND "membership"."deleted_at" IS NULL
	INNER JOIN "workspace_members" AS "workspace_member"
		ON "workspace_member"."organization_id" = "participant"."organization_id"
		AND "workspace_member"."workspace_id" = "conversation"."workspace_id"
		AND "workspace_member"."user_id" = "participant"."user_id"
		AND "workspace_member"."archived_at" IS NULL
		AND "workspace_member"."deleted_at" IS NULL
	WHERE "participant"."removed_at" IS NULL
		AND NOT EXISTS (
			SELECT 1 FROM "team_rooms" AS "room"
			WHERE "room"."organization_id" = "conversation"."organization_id"
				AND "room"."conversation_id" = "conversation"."id"
		)
)
UPDATE "conversation_participants" AS "participant"
SET "participant_role" = CASE WHEN "ranked"."member_rank" = 1 THEN 'owner' ELSE 'member' END,
	"source" = 'team',
	"version" = "participant"."version" + 1,
	"updated_at" = now()
FROM "ranked_internal_participants" AS "ranked"
WHERE "participant"."organization_id" = "ranked"."organization_id"
	AND "participant"."conversation_id" = "ranked"."conversation_id"
	AND "participant"."user_id" = "ranked"."user_id";--> statement-breakpoint
INSERT INTO "team_members" (
	"organization_id", "workspace_id", "team_id", "user_id", "role",
	"version", "joined_at", "removed_at", "updated_at"
)
SELECT "conversation"."organization_id", "conversation"."workspace_id",
	"team"."id", "participant"."user_id",
	CASE
		WHEN "participant"."removed_at" IS NULL
			AND "participant"."participant_role" = 'owner' THEN 'lead'::"team_member_role"
		ELSE 'member'::"team_member_role"
	END,
	1, "participant"."joined_at",
	coalesce(
		"participant"."removed_at", "membership"."archived_at", "membership"."deleted_at",
		"workspace_member"."archived_at", "workspace_member"."deleted_at"
	),
	now()
FROM "conversations" AS "conversation"
INNER JOIN "teams" AS "team"
	ON "team"."organization_id" = "conversation"."organization_id"
	AND "team"."workspace_id" = "conversation"."workspace_id"
	AND "team"."id" = substr(md5("conversation"."organization_id" || chr(31) || "conversation"."id" || chr(31) || 'team'), 1, 8)
		|| '-' || substr(md5("conversation"."organization_id" || chr(31) || "conversation"."id" || chr(31) || 'team'), 9, 4)
		|| '-4' || substr(md5("conversation"."organization_id" || chr(31) || "conversation"."id" || chr(31) || 'team'), 14, 3)
		|| '-8' || substr(md5("conversation"."organization_id" || chr(31) || "conversation"."id" || chr(31) || 'team'), 18, 3)
		|| '-' || substr(md5("conversation"."organization_id" || chr(31) || "conversation"."id" || chr(31) || 'team'), 21, 12)
INNER JOIN "conversation_participants" AS "participant"
	ON "participant"."organization_id" = "conversation"."organization_id"
	AND "participant"."conversation_id" = "conversation"."id"
INNER JOIN "memberships" AS "membership"
	ON "membership"."organization_id" = "participant"."organization_id"
	AND "membership"."user_id" = "participant"."user_id"
	AND "membership"."role" NOT IN ('guest', 'viewer')
INNER JOIN "workspace_members" AS "workspace_member"
	ON "workspace_member"."organization_id" = "participant"."organization_id"
	AND "workspace_member"."workspace_id" = "conversation"."workspace_id"
	AND "workspace_member"."user_id" = "participant"."user_id"
WHERE "conversation"."kind" = 'team'
	AND NOT EXISTS (
		SELECT 1 FROM "team_rooms" AS "room"
		WHERE "room"."organization_id" = "conversation"."organization_id"
			AND "room"."conversation_id" = "conversation"."id"
	);--> statement-breakpoint
INSERT INTO "team_rooms" (
	"organization_id", "workspace_id", "team_id", "conversation_id", "created_at"
)
SELECT "conversation"."organization_id", "conversation"."workspace_id",
	"team"."id", "conversation"."id", "conversation"."created_at"
FROM "conversations" AS "conversation"
INNER JOIN "teams" AS "team"
	ON "team"."organization_id" = "conversation"."organization_id"
	AND "team"."workspace_id" = "conversation"."workspace_id"
	AND "team"."id" = substr(md5("conversation"."organization_id" || chr(31) || "conversation"."id" || chr(31) || 'team'), 1, 8)
		|| '-' || substr(md5("conversation"."organization_id" || chr(31) || "conversation"."id" || chr(31) || 'team'), 9, 4)
		|| '-4' || substr(md5("conversation"."organization_id" || chr(31) || "conversation"."id" || chr(31) || 'team'), 14, 3)
		|| '-8' || substr(md5("conversation"."organization_id" || chr(31) || "conversation"."id" || chr(31) || 'team'), 18, 3)
		|| '-' || substr(md5("conversation"."organization_id" || chr(31) || "conversation"."id" || chr(31) || 'team'), 21, 12)
WHERE "conversation"."kind" = 'team'
	AND NOT EXISTS (
		SELECT 1 FROM "team_rooms" AS "room"
		WHERE "room"."organization_id" = "conversation"."organization_id"
			AND "room"."conversation_id" = "conversation"."id"
	);--> statement-breakpoint
INSERT INTO "legacy_collaboration_record_quarantine" (
	"id", "organization_id", "workspace_id", "conversation_id",
	"entity_type", "entity_id", "quarantine_reason", "original_record"
)
SELECT md5("message"."organization_id" || chr(31) || 'message' || chr(31)
		|| "message"."id" || chr(31) || 'legacy_team_response_owner_ineligible'),
	"message"."organization_id", "message"."workspace_id", "message"."conversation_id",
	'message', "message"."id", 'legacy_team_response_owner_ineligible',
	to_jsonb("message")
FROM "conversation_messages" AS "message"
INNER JOIN "team_rooms" AS "room"
	ON "room"."organization_id" = "message"."organization_id"
	AND "room"."workspace_id" = "message"."workspace_id"
	AND "room"."conversation_id" = "message"."conversation_id"
WHERE "message"."response_state" = 'open'
	AND NOT EXISTS (
		SELECT 1
		FROM "team_members" AS "member"
		WHERE "member"."organization_id" = "room"."organization_id"
			AND "member"."workspace_id" = "room"."workspace_id"
			AND "member"."team_id" = "room"."team_id"
			AND "member"."user_id" = "message"."response_owner_id"
			AND "member"."removed_at" IS NULL
	)
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
UPDATE "conversation_messages" AS "message"
SET "response_owner_id" = "candidate"."user_id",
	"response_state" = CASE
		WHEN "candidate"."user_id" IS NULL THEN NULL
		ELSE "message"."response_state"
	END,
	"response_due_at" = CASE
		WHEN "candidate"."user_id" IS NULL THEN NULL
		ELSE "message"."response_due_at"
	END,
	"version" = "message"."version" + 1,
	"updated_at" = now()
FROM "team_rooms" AS "room"
LEFT JOIN LATERAL (
	SELECT "member"."user_id"
	FROM "team_members" AS "member"
	WHERE "member"."organization_id" = "room"."organization_id"
		AND "member"."workspace_id" = "room"."workspace_id"
		AND "member"."team_id" = "room"."team_id"
		AND "member"."removed_at" IS NULL
	ORDER BY ("member"."role" = 'lead') DESC, "member"."joined_at", "member"."user_id"
	LIMIT 1
) AS "candidate" ON true
WHERE "message"."organization_id" = "room"."organization_id"
	AND "message"."workspace_id" = "room"."workspace_id"
	AND "message"."conversation_id" = "room"."conversation_id"
	AND "message"."response_state" = 'open'
	AND NOT EXISTS (
		SELECT 1
		FROM "team_members" AS "current_owner"
		WHERE "current_owner"."organization_id" = "room"."organization_id"
			AND "current_owner"."workspace_id" = "room"."workspace_id"
			AND "current_owner"."team_id" = "room"."team_id"
			AND "current_owner"."user_id" = "message"."response_owner_id"
			AND "current_owner"."removed_at" IS NULL
	);--> statement-breakpoint
INSERT INTO "outbox_events" (
	"id", "organization_id", "event_type", "aggregate_type", "aggregate_id",
	"schema_version", "actor_id", "request_id", "correlation_id", "dedup_key",
	"payload", "available_at", "created_at"
)
SELECT 'legacy-retention-' || md5("message"."organization_id" || chr(31) || "message"."id"),
	"message"."organization_id", 'message.retention_due', 'message', "message"."id",
	1, NULL, 'legacy-retention:' || "message"."id", 'legacy-retention:' || "message"."id",
	encode(sha256(convert_to(
		"message"."organization_id" || chr(31) || 'message.retention_due' || chr(31)
			|| "message"."id" || chr(31) || "message"."expires_at"::text,
		'UTF8'
	)), 'hex'),
	jsonb_build_object(
		'messageId', "message"."id",
		'conversationId', "message"."conversation_id",
		'expiresAt', "message"."expires_at"
	),
	"message"."expires_at", "message"."created_at"
FROM "conversation_messages" AS "message"
WHERE "message"."redacted_at" IS NULL
	AND "message"."deleted_at" IS NULL
	AND NOT EXISTS (
		SELECT 1
		FROM "outbox_events" AS "event"
		WHERE "event"."organization_id" = "message"."organization_id"
			AND "event"."event_type" = 'message.retention_due'
			AND "event"."aggregate_type" = 'message'
			AND "event"."aggregate_id" = "message"."id"
	)
ON CONFLICT DO NOTHING;
