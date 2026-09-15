ALTER TABLE "booking_deposit" ADD COLUMN "refund_synced_at" timestamp;--> statement-breakpoint
ALTER TABLE "connect_refund" ADD COLUMN "refund_synced_at" timestamp;--> statement-breakpoint
ALTER TABLE "patient_balance_payment" ADD COLUMN "refund_synced_at" timestamp;--> statement-breakpoint
ALTER TABLE "shop_order" ADD COLUMN "refund_synced_at" timestamp;