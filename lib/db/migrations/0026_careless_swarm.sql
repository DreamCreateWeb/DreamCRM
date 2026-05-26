ALTER TABLE "blog_post" ADD COLUMN "medically_reviewed_by_staff_id" text;--> statement-breakpoint
ALTER TABLE "blog_post" ADD COLUMN "medically_reviewed_at" timestamp;--> statement-breakpoint
ALTER TABLE "blog_post" ADD COLUMN "view_count" integer DEFAULT 0 NOT NULL;