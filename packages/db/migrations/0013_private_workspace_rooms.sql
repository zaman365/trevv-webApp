ALTER TABLE "conversations" DROP CONSTRAINT "conversations_kind_visibility_check";--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_kind_visibility_check" CHECK (("conversations"."kind" = 'workspace' and "conversations"."visibility" in ('organization', 'private'))
        or ("conversations"."kind" in ('team', 'direct') and "conversations"."visibility" = 'private')
        or ("conversations"."kind" = 'external' and "conversations"."visibility" = 'guest_scoped'));