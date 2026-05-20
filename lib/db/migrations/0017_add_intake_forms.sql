CREATE TABLE "form_submission" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"form_template_id" text NOT NULL,
	"patient_id" text,
	"appointment_id" text,
	"data" jsonb NOT NULL,
	"submitter_name" text,
	"submitter_email" text,
	"submitter_phone" text,
	"submitted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "form_template" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"slug" text NOT NULL,
	"schema" jsonb NOT NULL,
	"is_default" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "form_submission" ADD CONSTRAINT "form_submission_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_submission" ADD CONSTRAINT "form_submission_form_template_id_form_template_id_fk" FOREIGN KEY ("form_template_id") REFERENCES "public"."form_template"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_submission" ADD CONSTRAINT "form_submission_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_submission" ADD CONSTRAINT "form_submission_appointment_id_appointment_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointment"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_template" ADD CONSTRAINT "form_template_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "form_template_org_slug_idx" ON "form_template" USING btree ("organization_id","slug");