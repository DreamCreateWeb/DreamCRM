CREATE TABLE "agency_project" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"type" text DEFAULT 'other' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'lead' NOT NULL,
	"budget_cents" integer,
	"due_date" timestamp,
	"started_at" timestamp,
	"completed_at" timestamp,
	"owner_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agency_project" ADD CONSTRAINT "agency_project_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;