CREATE TABLE "patient_followup" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"patient_id" text NOT NULL,
	"title" text NOT NULL,
	"due_date" text,
	"assigned_user_id" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_by" text,
	"completed_at" timestamp,
	"completed_by" text,
	"source_appointment_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "patient_followup" ADD CONSTRAINT "patient_followup_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_followup" ADD CONSTRAINT "patient_followup_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_followup" ADD CONSTRAINT "patient_followup_assigned_user_id_user_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_followup" ADD CONSTRAINT "patient_followup_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_followup" ADD CONSTRAINT "patient_followup_completed_by_user_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "patient_followup_org_status_due_idx" ON "patient_followup" USING btree ("organization_id","status","due_date");--> statement-breakpoint
CREATE INDEX "patient_followup_patient_status_idx" ON "patient_followup" USING btree ("patient_id","status");