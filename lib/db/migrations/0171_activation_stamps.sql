-- The First Week (docs/ACTIVATION.md, slice S2) — `clinic_profile.activation`.
--
-- The activation stamps: `{ a1: iso, a2: iso, … }`, each key written ONCE
-- the first time that event happens for the clinic (lib/services/
-- activation.ts `stampActivation` — a guarded jsonb merge whose RETURNING
-- row is the atomic "was this the first time"). S2 stamps A1 (data
-- connected) from the day-one kick; the platform cockpit prefers a stamp
-- over its derived read and keeps deriving the rest until S8 stamps them.
--
-- Nullable, no default, no index: nothing queries by it; it is read one
-- row at a time with the profile. Catalog-only ADD COLUMN.

ALTER TABLE "clinic_profile" ADD COLUMN "activation" jsonb;
