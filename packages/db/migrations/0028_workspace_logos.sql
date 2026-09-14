CREATE TABLE "workspace_logos" (
	"workspace_id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"data" text NOT NULL,
	"version" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_logos_data_size" CHECK (length("workspace_logos"."data") <= 120000)
);
--> statement-breakpoint
ALTER TABLE "workspace_logos" ADD CONSTRAINT "workspace_logos_org_workspace_fk" FOREIGN KEY ("organization_id","workspace_id") REFERENCES "public"."workspaces"("organization_id","id") ON DELETE cascade ON UPDATE no action;