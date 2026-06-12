-- Partner lifecycle — backfill (DATA-ONLY, no schema change).
--
-- Historically `assignClinicReferral` COPIED the partner's default into every
-- attributed clinic's `referral_percent_bps` / `referral_term_months`, so the
-- accrual + display fallback ("override ?? partner default") never fired and a
-- partner's default change didn't reach already-attributed clinics.
--
-- New semantics: those columns hold a value ONLY for an explicit per-clinic
-- OVERRIDE; NULL means "live-resolve the partner's CURRENT default at invoice
-- time". This backfill collapses every copied-default row to NULL so those
-- clinics resume tracking their partner's default. Rows whose stored value
-- DIFFERS from the current default are real overrides and left untouched.

-- Percent: NULL out where it equals the attributed partner's current default.
UPDATE "clinic_profile" AS cp
SET "referral_percent_bps" = NULL
FROM "referral_partner" AS rp
WHERE cp."referral_partner_id" = rp."id"
  AND cp."referral_percent_bps" IS NOT NULL
  AND cp."referral_percent_bps" = rp."default_percent_bps";
--> statement-breakpoint
-- Term: NULL out where it equals the attributed partner's current default term.
-- (A NULL stored term is already "use default"; this only collapses an explicit
-- value that happens to equal the partner's current default term.)
UPDATE "clinic_profile" AS cp
SET "referral_term_months" = NULL
FROM "referral_partner" AS rp
WHERE cp."referral_partner_id" = rp."id"
  AND cp."referral_term_months" IS NOT NULL
  AND cp."referral_term_months" = rp."default_term_months";
