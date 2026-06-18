ALTER TABLE "patient_followup" ADD COLUMN "rule_key" text;--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN "followup_automation" jsonb;