ALTER TABLE "email_message" ADD COLUMN "category" text;--> statement-breakpoint
CREATE INDEX "email_message_category_idx" ON "email_message" USING btree ("category");