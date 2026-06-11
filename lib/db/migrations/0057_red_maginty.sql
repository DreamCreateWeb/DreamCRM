-- Snapshot reconciliation: migrations 0054/0055/0056 were generated on parallel
-- branches off 0053, so the 0056 snapshot lineage was missing 0054/0055's
-- columns and drizzle re-proposed them here. The columns already exist on any
-- database that applied 0054/0055 — IF NOT EXISTS makes this a no-op there
-- while keeping fresh databases correct.
ALTER TABLE "patient" ADD COLUMN IF NOT EXISTS "recall_interval_months" integer;--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN IF NOT EXISTS "reminder_settings" jsonb;--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN IF NOT EXISTS "chair_count" integer;--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN IF NOT EXISTS "visit_type_settings" jsonb;--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN IF NOT EXISTS "recall_default_months" integer;
