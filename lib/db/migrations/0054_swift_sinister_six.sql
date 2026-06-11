ALTER TABLE "patient" ADD COLUMN "recall_interval_months" integer;--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN "chair_count" integer;--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN "visit_type_settings" jsonb;--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN "recall_default_months" integer;