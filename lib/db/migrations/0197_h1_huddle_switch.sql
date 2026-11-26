-- The daily tools (docs/daily-tools.md, slice H1) — the Huddle's feature
-- switch, one column on clinic_profile in the 0172 shape.
--
-- Null = not turned on: the Huddle sits in the sidebar's "Add" group and its
-- page is the intro card. A timestamp = on, stamped ONCE by an owner/admin
-- from the intro, or opened by the machine at A1 (data connected) — the
-- Huddle reads only what the app already holds, so there is nothing to set up.
--
-- NO BACKFILL, on purpose. 0172 grandfathered modules a clinic was already
-- using; the Huddle is new, so nothing can vanish. A clinic whose A1 is
-- already on file gets the door opened by the daily activation reconcile
-- (lib/services/activation.ts, `a1DoorsOwed`) — the same path as any other
-- A1 door, and it honors a door a person closed. The demo is stamped by its
-- resync self-heal.
--
-- LOCK NOTE (deploy path): one nullable ADD COLUMN is catalog-only.

ALTER TABLE "clinic_profile" ADD COLUMN "huddle_enabled_at" timestamp;
