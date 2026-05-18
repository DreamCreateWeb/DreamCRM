-- Data migration: claim legacy NULL-organization rows for the platform org.
--
-- Both `tasks` and `calendar_events` were created with nullable
-- organization_id (Mosaic template inherited shape), and the service layer
-- ignored the column until now. Every existing row was created by the
-- single platform admin (dustin@dreamcreateweb.com), so we backfill the
-- column to the platform org id. After this runs, the service layer's
-- `WHERE organization_id = ?` filter is safe to ship for multi-tenancy.
--
-- Idempotent: if every row already has an org id, both UPDATEs no-op.

UPDATE "tasks"
SET "organization_id" = (
  SELECT "id" FROM "organization" WHERE "slug" = 'dream-create' LIMIT 1
)
WHERE "organization_id" IS NULL;
--> statement-breakpoint
UPDATE "calendar_events"
SET "organization_id" = (
  SELECT "id" FROM "organization" WHERE "slug" = 'dream-create' LIMIT 1
)
WHERE "organization_id" IS NULL;
