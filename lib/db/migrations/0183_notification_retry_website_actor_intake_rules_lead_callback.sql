ALTER TABLE "form_template" ADD COLUMN "appointment_type_ids" jsonb;--> statement-breakpoint
ALTER TABLE "form_template" ADD COLUMN "refresh_months" integer;--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN "call_back_at" timestamp;--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN "followed_up_at" timestamp;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "email_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "email_last_error" text;--> statement-breakpoint
ALTER TABLE "website_edit_history" ADD COLUMN "actor_user_id" text;--> statement-breakpoint
ALTER TABLE "website_edit_history" ADD CONSTRAINT "website_edit_history_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_email_unsent_idx" ON "notifications" USING btree ("created_at") WHERE "notifications"."email_sent_at" is null;