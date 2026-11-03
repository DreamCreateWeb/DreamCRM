ALTER TABLE "notifications" ADD COLUMN "email_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "email_last_error" text;--> statement-breakpoint
CREATE INDEX "notifications_email_unsent_idx" ON "notifications" USING btree ("created_at") WHERE "notifications"."email_sent_at" is null;