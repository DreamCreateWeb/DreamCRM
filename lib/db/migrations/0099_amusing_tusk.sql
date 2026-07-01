ALTER TABLE "clinic_review_config" ALTER COLUMN "auto_send_enabled" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "clinic_review_config" ALTER COLUMN "auto_send_delay_hours" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "clinic_review_config" ADD COLUMN "feature_min_stars" integer DEFAULT 4 NOT NULL;--> statement-breakpoint
ALTER TABLE "clinic_review_config" ADD COLUMN "show_private_feedback" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_review" ADD COLUMN "hidden_from_site" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Backfill: turn the auto-send loop ON for existing clinics too (the redesign's
-- intended default). Still gated at send time by a configured review platform +
-- patient opt-in + rate limit, so clinics without a Google link send nothing.
UPDATE "clinic_review_config" SET "auto_send_enabled" = 1, "auto_send_delay_hours" = 0;