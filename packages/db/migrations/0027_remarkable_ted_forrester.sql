ALTER TABLE "app_users" ADD COLUMN "profile" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
-- Keep the stable product user (and all memberships/work) when credentials
-- change. A conflicting product email aborts the auth update atomically.
CREATE FUNCTION sync_trevv_account_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name OR NEW.email IS DISTINCT FROM OLD.email THEN
    UPDATE app_users SET name = NEW.name, email = lower(NEW.email), updated_at = clock_timestamp()
    WHERE id IN (SELECT app_user_id FROM auth_user_mappings WHERE auth_user_id = NEW.id)
      AND deleted_at IS NULL AND archived_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER trevv_account_identity_sync AFTER UPDATE OF name, email ON "user"
FOR EACH ROW EXECUTE FUNCTION sync_trevv_account_identity();
