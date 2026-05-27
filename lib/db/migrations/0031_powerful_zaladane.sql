CREATE TABLE "job_application" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"job_posting_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"resume_url" text,
	"linkedin_url" text,
	"cover_note" text,
	"status" text DEFAULT 'new' NOT NULL,
	"source" text DEFAULT 'career_site' NOT NULL,
	"rating" integer,
	"reviewed_at" timestamp,
	"decided_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_posting" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"location_id" text,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"role" text DEFAULT 'other' NOT NULL,
	"employment_type" text DEFAULT 'full_time' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"responsibilities" text,
	"requirements" text,
	"benefits" text,
	"comp_min_cents" integer,
	"comp_max_cents" integer,
	"comp_period" text DEFAULT 'hour' NOT NULL,
	"show_comp" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"apply_method" text DEFAULT 'in_app' NOT NULL,
	"external_apply_url" text,
	"valid_through" timestamp,
	"posted_at" timestamp,
	"closed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_application" ADD CONSTRAINT "job_application_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_application" ADD CONSTRAINT "job_application_job_posting_id_job_posting_id_fk" FOREIGN KEY ("job_posting_id") REFERENCES "public"."job_posting"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_posting" ADD CONSTRAINT "job_posting_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_posting" ADD CONSTRAINT "job_posting_location_id_clinic_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."clinic_location"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_application_org_status_idx" ON "job_application" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "job_application_job_idx" ON "job_application" USING btree ("job_posting_id");--> statement-breakpoint
CREATE UNIQUE INDEX "job_posting_org_slug_idx" ON "job_posting" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "job_posting_org_status_idx" ON "job_posting" USING btree ("organization_id","status");