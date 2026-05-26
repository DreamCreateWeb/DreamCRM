CREATE TABLE "blog_post" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"excerpt" text,
	"body_html" text DEFAULT '' NOT NULL,
	"body_json" jsonb,
	"cover_image_url" text,
	"category" text,
	"tags" jsonb,
	"status" text DEFAULT 'draft' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"author_staff_id" text,
	"author_name" text,
	"seo_title" text,
	"seo_description" text,
	"published_at" timestamp,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "blog_post" ADD CONSTRAINT "blog_post_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "blog_post_org_slug_idx" ON "blog_post" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "blog_post_org_status_published_idx" ON "blog_post" USING btree ("organization_id","status","published_at");