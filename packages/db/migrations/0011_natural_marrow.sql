ALTER TABLE "conversations" ADD COLUMN "direct_key" text;--> statement-breakpoint
WITH "direct_participants" AS (
	SELECT "conversation"."id",
		"conversation"."organization_id",
		"conversation"."workspace_id",
		"conversation"."created_at",
		"conversation"."archived_at",
		"conversation"."deleted_at",
		count(*) AS "participant_count",
		encode(
			sha256(
				convert_to(
					string_agg("participant"."user_id", chr(31) ORDER BY "participant"."user_id"),
					'UTF8'
				)
			),
			'hex'
		) AS "direct_key"
	FROM "conversations" AS "conversation"
	INNER JOIN "conversation_participants" AS "participant"
		ON "participant"."organization_id" = "conversation"."organization_id"
		AND "participant"."conversation_id" = "conversation"."id"
		AND "participant"."removed_at" IS NULL
	WHERE "conversation"."kind" = 'direct'
	GROUP BY "conversation"."id"
),
"ranked_direct_participants" AS (
	SELECT "direct_participants".*,
		CASE
			WHEN "archived_at" IS NULL AND "deleted_at" IS NULL THEN row_number() OVER (
				PARTITION BY "organization_id", "workspace_id", "direct_key"
				ORDER BY
					("archived_at" IS NULL AND "deleted_at" IS NULL) DESC,
					"created_at",
					"id"
			)
		END AS "active_rank"
	FROM "direct_participants"
	WHERE "participant_count" = 2
)
UPDATE "conversations" AS "conversation"
SET "direct_key" = CASE
		WHEN "ranked"."active_rank" IS NULL OR "ranked"."active_rank" = 1
			THEN "ranked"."direct_key"
		ELSE encode(
			sha256(
				convert_to(
					"ranked"."direct_key" || chr(31) || "ranked"."id",
					'UTF8'
				)
			),
			'hex'
		)
	END
FROM "ranked_direct_participants" AS "ranked"
WHERE "conversation"."id" = "ranked"."id";--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "conversations"
		WHERE "kind" = 'direct' AND "direct_key" IS NULL
	) THEN
		RAISE EXCEPTION 'Every legacy direct conversation must have exactly two active participants';
	END IF;
END
$$;--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_workspace_active_direct_unique" ON "conversations" USING btree ("organization_id","workspace_id","direct_key") WHERE "conversations"."kind" = 'direct' and "conversations"."deleted_at" is null and "conversations"."archived_at" is null;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_direct_key_check" CHECK (("conversations"."kind" = 'direct') = ("conversations"."direct_key" is not null));
