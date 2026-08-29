ALTER TABLE "conversation_messages" DROP CONSTRAINT "conversation_messages_expiry_check";--> statement-breakpoint
ALTER TABLE "conversation_messages" ALTER COLUMN "expires_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_expiry_check" CHECK ("conversation_messages"."expires_at" > "conversation_messages"."created_at");