ALTER TABLE "clinic_profile" ADD COLUMN "site_live_at" timestamp;--> statement-breakpoint
-- Grandfather every EXISTING clinic to live: they were serving traffic before
-- the lever existed (All About Smiles' GBP button drives real patients here).
-- Only clinics created after this deploy start behind the lever.
UPDATE "clinic_profile" SET "site_live_at" = now() WHERE "site_live_at" IS NULL;
