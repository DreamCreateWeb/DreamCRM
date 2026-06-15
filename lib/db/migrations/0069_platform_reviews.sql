-- Phase 3 PR 4 — generalize Google reviews into a multi-platform review table so
-- Facebook reviews/recommendations land alongside Google ones (folded into the
-- Reviews module). Rename `google_review` → `platform_review`, add a `platform`
-- column (default 'googlebusiness') + a `recommendation_type` column (Facebook
-- uses recommend / don't-recommend rather than 1–5 stars), and widen the
-- uniqueness key to (organization_id, platform, external_review_id).
--
-- Existing Google rows are PRESERVED unchanged: the rename keeps every row, and
-- the new `platform` column defaults to 'googlebusiness' so every migrated row is
-- correctly tagged as a Google review (the demo's synced reviews + any real
-- clinic's pulled Google reviews continue to drive the public AggregateRating).

-- 1) Rename the table.
ALTER TABLE "google_review" RENAME TO "platform_review";--> statement-breakpoint

-- 2) Add the new columns (platform defaults so existing rows = Google).
ALTER TABLE "platform_review" ADD COLUMN "platform" text DEFAULT 'googlebusiness' NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_review" ADD COLUMN "recommendation_type" text;--> statement-breakpoint

-- 3) Swap the uniqueness index: drop the old (org, externalReviewId) unique, add
--    the wider (org, platform, externalReviewId) unique. A Google review id and a
--    Facebook review id can't collide in practice, but keying on platform too is
--    the correct, future-proof guard.
DROP INDEX IF EXISTS "google_review_org_external_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "platform_review_org_platform_external_idx" ON "platform_review" USING btree ("organization_id","platform","external_review_id");
