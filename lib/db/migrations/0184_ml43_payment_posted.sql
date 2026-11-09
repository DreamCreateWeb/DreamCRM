ALTER TABLE "patient_balance_payment" ADD COLUMN "posted_at" timestamp;--> statement-breakpoint
ALTER TABLE "patient_balance_payment" ADD COLUMN "posted_by_user_id" text;