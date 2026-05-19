ALTER TABLE "email_message" ADD COLUMN "category_source" text DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE "email_message" ADD COLUMN "rfc_message_id" text;--> statement-breakpoint
ALTER TABLE "email_message" ADD COLUMN "in_reply_to" text;--> statement-breakpoint
CREATE INDEX "email_message_thread_idx" ON "email_message" USING btree ("provider_thread_id");