ALTER TABLE "appointment_reminder_log" ADD COLUMN "patient_id" text;--> statement-breakpoint
ALTER TABLE "appointment_reminder_log" ADD CONSTRAINT "appointment_reminder_log_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
UPDATE "appointment_reminder_log" AS l SET "patient_id" = a."patient_id" FROM "appointment" AS a WHERE a."id" = l."appointment_id" AND l."patient_id" IS NULL;--> statement-breakpoint
CREATE INDEX "appt_reminder_patient_tpl_sent_idx" ON "appointment_reminder_log" USING btree ("organization_id","patient_id","template","sent_at" DESC NULLS LAST);
