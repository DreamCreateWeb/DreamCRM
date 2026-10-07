-- The First Week (docs/ACTIVATION.md law 1) — phase-audit round 3.
--
-- 0175 added `doors_closed` (the doors a PERSON closed) with no backfill.
-- Between 0172 (2026-10-05) and 0175, "Turn off" only nulled the switch
-- column, and the machine's openers now run on every occurrence of their
-- event (every eligible kick, the daily reconcile's A1, every go-live
-- pull) — so a close made in that window would be reopened by the next
-- PMS sync. For a GRANDFATHERED clinic the memory is unambiguous: 0172
-- set every one of them ON for the five day-to-day modules, so a null
-- column today can only be a human close. Those are recorded here.
--
-- NOT backfilled on purpose: a clinic created after 0172 with a null
-- column and a stamped A1 — that could be a close OR a door the daily
-- reconcile stamped A1 for without opening (round 2's own defect), and
-- marking it closed would stop the machine from ever opening it; a
-- reopened door costs one more "Turn off", a never-opened one costs the
-- feature. Payments and Shop were only backfilled where the bundle
-- showed them, so a null there says nothing either.
--
-- LOCK NOTE: a handful of rows, one short row-level lock each.
UPDATE "clinic_profile" cp
SET "doors_closed" = coalesce(cp."doors_closed", '{}'::jsonb) || (
  SELECT coalesce(jsonb_object_agg(x.k, now()::text), '{}'::jsonb)
  FROM (
    SELECT 'my_day' AS k WHERE cp."my_day_enabled_at" IS NULL
    UNION ALL SELECT 'followups' WHERE cp."followups_enabled_at" IS NULL
    UNION ALL SELECT 'leads' WHERE cp."leads_enabled_at" IS NULL
    UNION ALL SELECT 'intake_forms' WHERE cp."intake_forms_enabled_at" IS NULL
    UNION ALL SELECT 'growth' WHERE cp."growth_enabled_at" IS NULL
  ) x
)
FROM "organization" o
WHERE o."id" = cp."organization_id"
  AND o."type" = 'clinic'
  AND o."is_demo" = false
  AND o."created_at" < '2026-10-06T00:00:00Z'
  AND (
    cp."my_day_enabled_at" IS NULL OR cp."followups_enabled_at" IS NULL OR cp."leads_enabled_at" IS NULL
    OR cp."intake_forms_enabled_at" IS NULL OR cp."growth_enabled_at" IS NULL
  );
