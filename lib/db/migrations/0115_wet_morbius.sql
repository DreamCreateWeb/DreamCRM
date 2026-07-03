ALTER TABLE "shop_config" ALTER COLUMN "platform_fee_bps" SET DEFAULT 100;--> statement-breakpoint
-- Backfill: the 1% platform fee applies to existing clinics too (decided
-- 2026-07-02). Only rows still on the old 0 default move; a deliberately
-- negotiated non-zero override would be left alone (none exist today).
UPDATE "shop_config" SET "platform_fee_bps" = 100 WHERE "platform_fee_bps" = 0;
