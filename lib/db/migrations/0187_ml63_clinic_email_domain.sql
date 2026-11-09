ALTER TABLE "clinic_profile" ADD COLUMN "email_domain_id" text;--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN "email_domain_name" text;--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN "email_domain_status" text;--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN "email_domain_records" jsonb;--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN "email_domain_checked_at" timestamp;--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN "email_domain_verified_at" timestamp;