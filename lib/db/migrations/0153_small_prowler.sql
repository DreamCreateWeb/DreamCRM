ALTER TABLE "notification_prefs" ADD COLUMN "email_mode" text DEFAULT 'urgent' NOT NULL;--> statement-breakpoint
-- Existing rows keep the behavior they chose: push_email off stays silent,
-- push_email on keeps every-alert email (they can step down to 'urgent' in
-- settings). Only NEW users start on the calmer 'urgent' default.
UPDATE "notification_prefs" SET "email_mode" = CASE WHEN "push_email" THEN 'all' ELSE 'none' END;
