ALTER TABLE "clinic_domain_purchase" ADD COLUMN "included_in_plan" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "clinic_domain_purchase" ADD COLUMN "renewal_error" text;