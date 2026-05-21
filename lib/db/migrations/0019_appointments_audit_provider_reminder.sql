CREATE TABLE "appointment_reminder_log" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"appointment_id" text NOT NULL,
	"channel" text NOT NULL,
	"template" text,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"sent_by_user_id" text,
	"delivered_at" timestamp,
	"replied_at" timestamp,
	"reply_body" text
);
--> statement-breakpoint
CREATE TABLE "clinic_provider" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"display_name" text NOT NULL,
	"role" text DEFAULT 'dentist' NOT NULL,
	"email" text,
	"photo_url" text,
	"is_active" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appointment" ADD COLUMN "provider_id" text;--> statement-breakpoint
ALTER TABLE "appointment" ADD COLUMN "confirmed_at" timestamp;--> statement-breakpoint
ALTER TABLE "appointment" ADD COLUMN "cancelled_at" timestamp;--> statement-breakpoint
ALTER TABLE "appointment" ADD COLUMN "completed_at" timestamp;--> statement-breakpoint
ALTER TABLE "appointment" ADD COLUMN "no_showed_at" timestamp;--> statement-breakpoint
ALTER TABLE "appointment" ADD COLUMN "confirmed_via" text;--> statement-breakpoint
ALTER TABLE "appointment" ADD COLUMN "rescheduled_from_appointment_id" text;--> statement-breakpoint
ALTER TABLE "appointment" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "appointment_reminder_log" ADD CONSTRAINT "appointment_reminder_log_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_reminder_log" ADD CONSTRAINT "appointment_reminder_log_appointment_id_appointment_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_reminder_log" ADD CONSTRAINT "appointment_reminder_log_sent_by_user_id_user_id_fk" FOREIGN KEY ("sent_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_provider" ADD CONSTRAINT "clinic_provider_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appt_reminder_appt_sent_idx" ON "appointment_reminder_log" USING btree ("appointment_id","sent_at");--> statement-breakpoint
CREATE INDEX "clinic_provider_org_idx" ON "clinic_provider" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_provider_id_clinic_provider_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."clinic_provider"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointment_org_start_idx" ON "appointment" USING btree ("organization_id","start_time");--> statement-breakpoint
CREATE INDEX "appointment_org_status_idx" ON "appointment" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "appointment_patient_start_idx" ON "appointment" USING btree ("patient_id","start_time");--> statement-breakpoint
CREATE INDEX "appointment_org_provider_idx" ON "appointment" USING btree ("organization_id","provider_id");