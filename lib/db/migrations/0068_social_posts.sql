-- Phase 3 PR 3 — generalize GBP posting into a unified multi-platform composer.
-- Rename `gbp_post` → `social_post` (the parent composed-post row) and add a
-- `social_post_target` child table (per-channel publish outcome). Existing GBP
-- posts are preserved: each becomes a 1-target social post whose single target
-- carries the GBP account/zernio-id/permalink/status that lived on the old row.

-- 1) Rename the parent table + its index.
ALTER TABLE "gbp_post" RENAME TO "social_post";--> statement-breakpoint
ALTER INDEX "gbp_post_org_created_idx" RENAME TO "social_post_org_created_idx";--> statement-breakpoint

-- 2) Create the per-channel target table.
CREATE TABLE "social_post_target" (
	"id" text PRIMARY KEY NOT NULL,
	"social_post_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"platform" text NOT NULL,
	"account_id" text NOT NULL,
	"zernio_post_id" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"google_url" text,
	"last_error" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "social_post_target" ADD CONSTRAINT "social_post_target_social_post_id_social_post_id_fk" FOREIGN KEY ("social_post_id") REFERENCES "public"."social_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_post_target" ADD CONSTRAINT "social_post_target_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "social_post_target_post_idx" ON "social_post_target" USING btree ("social_post_id");--> statement-breakpoint
CREATE INDEX "social_post_target_org_idx" ON "social_post_target" USING btree ("organization_id");--> statement-breakpoint

-- 3) Backfill one GBP target per existing post (preserves all Phase-2 posts).
INSERT INTO "social_post_target" (
	"id", "social_post_id", "organization_id", "platform", "account_id",
	"zernio_post_id", "status", "google_url", "last_error", "published_at",
	"created_at", "updated_at"
)
SELECT
	"id" || '_t_gbp', "id", "organization_id", 'googlebusiness', "account_id",
	"zernio_post_id", "status", "google_url", "last_error", "published_at",
	"created_at", "updated_at"
FROM "social_post";--> statement-breakpoint

-- 4) Drop the now-redundant per-channel columns from the parent (they live on
--    the target rows now). The parent keeps a `status` ROLLUP + `published_at`.
ALTER TABLE "social_post" DROP COLUMN "account_id";--> statement-breakpoint
ALTER TABLE "social_post" DROP COLUMN "zernio_post_id";--> statement-breakpoint
ALTER TABLE "social_post" DROP COLUMN "google_url";--> statement-breakpoint
ALTER TABLE "social_post" DROP COLUMN "last_error";
