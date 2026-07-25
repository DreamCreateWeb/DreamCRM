ALTER TABLE "clinic_profile" ALTER COLUMN "plan_tier" SET DEFAULT 'premium';--> statement-breakpoint
-- Close the trapdoor on existing data: a NULL tier used to read as 'basic'
-- through the old `?? 'basic'` fallbacks (no booking page, no booking links in
-- email, half a sidebar). Nothing gates on the tier any more, but leaving NULLs
-- around invites a future re-introduction of that bug.
UPDATE "clinic_profile" SET "plan_tier" = 'premium' WHERE "plan_tier" IS NULL;
