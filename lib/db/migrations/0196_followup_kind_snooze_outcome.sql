ALTER TABLE "patient_followup" ADD COLUMN "kind" text DEFAULT 'generic' NOT NULL;--> statement-breakpoint
ALTER TABLE "patient_followup" ADD COLUMN "snoozed_until" text;--> statement-breakpoint
ALTER TABLE "patient_followup" ADD COLUMN "outcome" text;