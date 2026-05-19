-- Data migration: claim legacy NULL-organization rows for the platform org.
--
-- Mosaic-template tables (customers, products, orders, invoices, cart_items)
-- were created with nullable organization_id and the service layer ignored
-- the column until now. Every existing row was created when only the single
-- platform admin (dustin@dreamcreateweb.com) had access, so we backfill the
-- column to the platform org id. After this runs, the service layer's
-- `WHERE organization_id = ?` filters are safe to ship for multi-tenancy.
--
-- Idempotent: if every row already has an org id, every UPDATE no-ops.

UPDATE "customers"
SET "organization_id" = (
  SELECT "id" FROM "organization" WHERE "slug" = 'dream-create' LIMIT 1
)
WHERE "organization_id" IS NULL;
--> statement-breakpoint
UPDATE "products"
SET "organization_id" = (
  SELECT "id" FROM "organization" WHERE "slug" = 'dream-create' LIMIT 1
)
WHERE "organization_id" IS NULL;
--> statement-breakpoint
UPDATE "orders"
SET "organization_id" = (
  SELECT "id" FROM "organization" WHERE "slug" = 'dream-create' LIMIT 1
)
WHERE "organization_id" IS NULL;
--> statement-breakpoint
UPDATE "invoices"
SET "organization_id" = (
  SELECT "id" FROM "organization" WHERE "slug" = 'dream-create' LIMIT 1
)
WHERE "organization_id" IS NULL;
--> statement-breakpoint
UPDATE "cart_items"
SET "organization_id" = (
  SELECT "id" FROM "organization" WHERE "slug" = 'dream-create' LIMIT 1
)
WHERE "organization_id" IS NULL;
