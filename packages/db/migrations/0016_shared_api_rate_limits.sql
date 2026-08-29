CREATE TABLE "api_rate_limit_windows" (
	"bucket" text NOT NULL,
	"client_key_hash" text NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"window_ms" integer NOT NULL,
	"request_count" integer DEFAULT 1 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_rate_limit_windows_pk" PRIMARY KEY("bucket","client_key_hash","window_started_at"),
	CONSTRAINT "api_rate_limit_windows_bucket_check" CHECK ("api_rate_limit_windows"."bucket" ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
	CONSTRAINT "api_rate_limit_windows_client_hash_check" CHECK ("api_rate_limit_windows"."client_key_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "api_rate_limit_windows_window_check" CHECK ("api_rate_limit_windows"."window_ms" between 1000 and 86400000),
	CONSTRAINT "api_rate_limit_windows_count_check" CHECK ("api_rate_limit_windows"."request_count" >= 1),
	CONSTRAINT "api_rate_limit_windows_expiry_check" CHECK ("api_rate_limit_windows"."expires_at" > "api_rate_limit_windows"."window_started_at")
);
--> statement-breakpoint
CREATE INDEX "api_rate_limit_windows_expiry_idx" ON "api_rate_limit_windows" USING btree ("expires_at");