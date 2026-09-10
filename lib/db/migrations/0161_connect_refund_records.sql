ALTER TABLE "booking_deposit" ADD COLUMN "refunded_amount_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_deposit" ADD COLUMN "refunded_at" timestamp;--> statement-breakpoint
ALTER TABLE "patient_balance_payment" ADD COLUMN "refunded_amount_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "patient_balance_payment" ADD COLUMN "refunded_at" timestamp;--> statement-breakpoint
ALTER TABLE "shop_order" ADD COLUMN "refunded_amount_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_order" ADD COLUMN "refunded_at" timestamp;--> statement-breakpoint
CREATE INDEX "booking_deposit_intent_idx" ON "booking_deposit" USING btree ("organization_id","stripe_payment_intent_id");--> statement-breakpoint
CREATE INDEX "balance_payment_intent_idx" ON "patient_balance_payment" USING btree ("organization_id","stripe_payment_intent_id");--> statement-breakpoint
CREATE INDEX "shop_order_payment_intent_idx" ON "shop_order" USING btree ("organization_id","stripe_payment_intent_id");