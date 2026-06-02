ALTER TABLE "clinic_profile" ADD COLUMN "payment_methods" jsonb;--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN "financing_partners" jsonb;--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN "cancellation_policy" text;