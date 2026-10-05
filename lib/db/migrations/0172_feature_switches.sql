-- The First Week (docs/ACTIVATION.md law 1, slice S3) — the feature
-- switches, one column per feature on clinic_profile, the 0169 shape.
--
-- Null = not turned on: the module sits in the sidebar's "Add" group and
-- its page is the intro card (what it does, what to know, one button). A
-- timestamp = on, stamped ONCE by an owner/admin from the intro or opened
-- by the machine at an activation event (A1 opens My Day + Follow-ups; the
-- site going live opens Inquiries). The registry is lib/feature-switches.ts.
--
-- BACKFILL, 0147's reasoning (the go-live lever): a clinic that existed
-- before the switches did was using the whole sidebar, and hiding half of
-- it on deploy would read as features vanishing. So every clinic on file
-- is grandfathered ON for the five day-to-day modules. Payments and Shop
-- follow the signal that already decided whether they showed (the
-- payments bundle: Stripe engaged, or a storefront / membership set up),
-- so no clinic sees a money page it did not see yesterday. The demo is
-- stamped by its resync self-heal. New clinics start at null everywhere
-- and meet the doors. If the owner rules the existing clinics should
-- meet the doors too, that is one UPDATE — the 0170 shape.
--
-- LOCK NOTE (deploy path): seven nullable ADD COLUMNs are catalog-only;
-- the backfill touches a handful of rows with one short row-level lock each.

ALTER TABLE "clinic_profile" ADD COLUMN "my_day_enabled_at" timestamp;--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN "followups_enabled_at" timestamp;--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN "leads_enabled_at" timestamp;--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN "intake_forms_enabled_at" timestamp;--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN "growth_enabled_at" timestamp;--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN "payments_enabled_at" timestamp;--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN "shop_enabled_at" timestamp;--> statement-breakpoint
UPDATE "clinic_profile" SET
  "my_day_enabled_at" = now(),
  "followups_enabled_at" = now(),
  "leads_enabled_at" = now(),
  "intake_forms_enabled_at" = now(),
  "growth_enabled_at" = now();--> statement-breakpoint
UPDATE "clinic_profile" cp SET
  "payments_enabled_at" = now(),
  "shop_enabled_at" = now()
WHERE EXISTS (
  SELECT 1 FROM "shop_config" sc
  WHERE sc."organization_id" = cp."organization_id"
    AND (sc."stripe_account_status" <> 'none' OR sc."storefront_enabled" = 1 OR sc."membership_enabled" = 1)
);
