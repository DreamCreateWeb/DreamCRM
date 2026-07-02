ALTER TABLE "patient" ADD COLUMN "preferred_language" text;--> statement-breakpoint
ALTER TABLE "patient_thread" ADD COLUMN "urgency" text;--> statement-breakpoint
ALTER TABLE "patient_thread" ADD COLUMN "urgency_reason" text;