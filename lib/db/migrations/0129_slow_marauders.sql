ALTER TABLE "campaign_templates" ADD COLUMN "automation_kind" text;--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN "welcome_auto_send_enabled" integer DEFAULT 0 NOT NULL;