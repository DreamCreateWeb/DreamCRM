CREATE TABLE "site_pageview" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"day" date NOT NULL,
	"path" text NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN "seo_meta" jsonb;--> statement-breakpoint
ALTER TABLE "site_pageview" ADD CONSTRAINT "site_pageview_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "site_pageview_org_day_path_idx" ON "site_pageview" USING btree ("organization_id","day","path");