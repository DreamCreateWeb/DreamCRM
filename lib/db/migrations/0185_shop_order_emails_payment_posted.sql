ALTER TABLE "patient_balance_payment" ADD COLUMN "posted_at" timestamp;--> statement-breakpoint
ALTER TABLE "patient_balance_payment" ADD COLUMN "posted_by_user_id" text;--> statement-breakpoint
ALTER TABLE "shop_order" ADD COLUMN "ready_email_at" timestamp;--> statement-breakpoint
ALTER TABLE "shop_order" ADD COLUMN "shipped_email_at" timestamp;