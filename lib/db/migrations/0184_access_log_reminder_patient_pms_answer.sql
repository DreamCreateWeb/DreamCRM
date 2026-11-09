CREATE TABLE "patient_access_log" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"patient_id" text,
	"user_id" text NOT NULL,
	"action" text NOT NULL,
	"detail" jsonb,
	"at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appointment_reminder_log" ADD COLUMN "patient_id" text;--> statement-breakpoint
UPDATE "appointment_reminder_log" AS l SET "patient_id" = a."patient_id" FROM "appointment" AS a WHERE a."id" = l."appointment_id" AND l."patient_id" IS NULL;--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN "pms_answer" text;--> statement-breakpoint
ALTER TABLE "patient_access_log" ADD CONSTRAINT "patient_access_log_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "patient_access_log_patient_at_idx" ON "patient_access_log" USING btree ("organization_id","patient_id","at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "patient_access_log_user_at_idx" ON "patient_access_log" USING btree ("organization_id","user_id","at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "appointment_reminder_log" ADD CONSTRAINT "appointment_reminder_log_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appt_reminder_patient_tpl_sent_idx" ON "appointment_reminder_log" USING btree ("organization_id","patient_id","template","sent_at" DESC NULLS LAST);