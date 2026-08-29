DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "app_users"
		WHERE "deleted_at" IS NULL
		GROUP BY lower("email")
		HAVING count(*) > 1
	) THEN
		RAISE EXCEPTION USING
			ERRCODE = '23505',
			MESSAGE = 'Cannot enforce normalized app user email uniqueness: active case-insensitive duplicates exist.';
	END IF;
END
$$;
--> statement-breakpoint
CREATE UNIQUE INDEX "app_users_active_email_normalized_unique" ON "app_users" USING btree (lower("email")) WHERE "app_users"."deleted_at" is null;
