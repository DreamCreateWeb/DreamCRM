-- Insurance tool, self-serve setup (2026-10-05, same day as 0169) — reset
-- the ON switch for every clinic.
--
-- 0169 backfilled `insurance_enabled_at` for every clinic with a check on
-- file, on the go-live lever's reasoning ("they were using it before the
-- switch existed"). The owner overruled it the same day: no client was
-- using the tool — the checks on file were the owner's own tests while it
-- was admin-only — and a practice must meet the intro card and submit the
-- setup ONCE before the tool shows, with no exceptions. So the switch is
-- cleared everywhere. The demo clinic alone is re-stamped by its resync
-- self-heal on the next boot (a prospect mid-pitch sees the scoreboard).
--
-- Nothing else moves: history rows stay, the NPI on the Business profile
-- stays, and turning on again is the intro's one button.
--
-- LOCK NOTE (deploy path): a single UPDATE over clinic_profile — a handful
-- of rows, one short row-level lock each.

UPDATE "clinic_profile" SET "insurance_enabled_at" = NULL WHERE "insurance_enabled_at" IS NOT NULL;
