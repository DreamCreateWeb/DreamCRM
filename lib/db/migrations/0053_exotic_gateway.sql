ALTER TABLE "clinic_profile" ADD COLUMN "billing_mode" text DEFAULT 'self_serve';--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN "pending_plan_id" text;--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN "pending_billing_interval" text;--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN "stripe_coupon_id" text;--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN "managed_note" text;