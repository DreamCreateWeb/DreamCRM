-- The First Week (docs/ACTIVATION.md law 1) — phase-audit verification round.
--
-- 0176 recorded a human close for every null day-to-day switch on clinics
-- created before 2026-10-06T00:00Z, calling them grandfathered. But 0172
-- (the ON backfill) applied at ~2026-10-05T19:05Z, so a clinic created in
-- the ~5 hours between was born with every switch null BY DESIGN — a new
-- clinic meets the doors — and 0176 wrote fake closes for it, which every
-- machine opener then honoured: My Day and Follow-ups never opened at A1,
-- Inquiries never at go-live. This clears exactly those five keys for the
-- clinics born in that window. A real close a person made in that window
-- (hours, on a brand-new clinic) is lost with them; a reopened door costs
-- one more "Turn off", a never-opened one costs the feature.
--
-- The boundary is 0172's MERGE instant (18:50Z): a clinic created between
-- the merge and the boot that applied 0172 (~15 min) was grandfathered ON
-- and may be cleared here wrongly — the same cheaper error, chosen on
-- purpose. Lesson recorded in docs/AUDITS.md: derive a data migration's
-- boundary from the record, never from a calendar date.
--
-- LOCK NOTE: a handful of rows, one short row-level lock each.
UPDATE "clinic_profile" cp
SET "doors_closed" = cp."doors_closed" - ARRAY['my_day','followups','leads','intake_forms','growth']::text[]
FROM "organization" o
WHERE o."id" = cp."organization_id"
  AND o."type" = 'clinic'
  AND o."is_demo" = false
  AND cp."doors_closed" IS NOT NULL
  AND o."created_at" >= '2026-10-05T18:50:00Z'
  AND o."created_at" < '2026-10-06T00:00:00Z';
