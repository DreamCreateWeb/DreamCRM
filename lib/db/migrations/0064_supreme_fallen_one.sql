CREATE TABLE "google_review" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"external_review_id" text NOT NULL,
	"account_id" text NOT NULL,
	"reviewer_name" text,
	"reviewer_photo_url" text,
	"star_rating" integer,
	"comment" text,
	"review_created_at" timestamp with time zone,
	"review_updated_at" timestamp with time zone,
	"reply_comment" text,
	"reply_updated_at" timestamp with time zone,
	"patient_id" text,
	"is_demo" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "google_review" ADD CONSTRAINT "google_review_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_review" ADD CONSTRAINT "google_review_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "google_review_org_external_idx" ON "google_review" USING btree ("organization_id","external_review_id");