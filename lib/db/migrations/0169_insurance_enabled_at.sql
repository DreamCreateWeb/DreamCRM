-- Insurance tool, self-serve setup (2026-10-05) — `clinic_profile.insurance_enabled_at`.
--
-- The tool's ON switch. Released to every clinic on 2026-10-03, the tool
-- now waits behind an intro card ("Enable and set up") until an owner or
-- admin turns it on, so a practice meets it as a feature they chose rather
-- than a page that appeared. Null = not turned on: /insurance shows the
-- intro, the patient record hides the rail card and the needs-attention
-- nudge, and `runEligibilityCheck` refuses before any row or network call.
--
-- BACKFILL, same reasoning as 0147's go-live lever: a clinic that has
-- already run a check was using the tool before the switch existed, and
-- hiding it behind an intro on deploy would read as the feature vanishing.
-- Every other clinic starts at null and meets the intro — the demo clinic
-- is stamped by its resync self-heal.
--
-- LOCK NOTE (deploy path): the nullable ADD COLUMN is catalog-only; the
-- backfill touches only the few rows with a check on file.

ALTER TABLE "clinic_profile" ADD COLUMN "insurance_enabled_at" timestamp;
--> statement-breakpoint
UPDATE "clinic_profile" SET "insurance_enabled_at" = now()
WHERE "insurance_enabled_at" IS NULL
  AND "organization_id" IN (SELECT DISTINCT "organization_id" FROM "insurance_verification");
