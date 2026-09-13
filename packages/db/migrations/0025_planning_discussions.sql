ALTER TABLE "conversations" ADD COLUMN "context_board_id" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "context_work_item_id" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_context_board_fk" FOREIGN KEY ("organization_id","workspace_id","context_board_id") REFERENCES "public"."boards"("organization_id","workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_context_work_item_fk" FOREIGN KEY ("organization_id","workspace_id","context_work_item_id") REFERENCES "public"."work_items"("organization_id","workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_context_shape_check" CHECK (
      ("conversations"."context_board_id" is null or "conversations"."context_work_item_id" is null)
      and (("conversations"."context_board_id" is null and "conversations"."context_work_item_id" is null)
        or ("conversations"."kind" = 'workspace' and "conversations"."visibility" = 'private'))
    );