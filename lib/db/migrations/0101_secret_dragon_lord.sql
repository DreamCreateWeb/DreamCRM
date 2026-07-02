CREATE TABLE "appointment_waitlist" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"patient_id" text NOT NULL,
	"appointment_id" text,
	"visit_type" text,
	"provider_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"source" text DEFAULT 'staff' NOT NULL,
	"fulfilled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointment_waitlist_offer" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"waitlist_id" text NOT NULL,
	"patient_id" text NOT NULL,
	"slot_start" timestamp NOT NULL,
	"slot_end" timestamp,
	"provider_id" text,
	"visit_type" text NOT NULL,
	"freed_by_appointment_id" text,
	"token" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp,
	"claimed_at" timestamp,
	"claimed_appointment_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appointment_waitlist" ADD CONSTRAINT "appointment_waitlist_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_waitlist" ADD CONSTRAINT "appointment_waitlist_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_waitlist" ADD CONSTRAINT "appointment_waitlist_appointment_id_appointment_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointment"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_waitlist" ADD CONSTRAINT "appointment_waitlist_provider_id_clinic_provider_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."clinic_provider"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_waitlist_offer" ADD CONSTRAINT "appointment_waitlist_offer_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_waitlist_offer" ADD CONSTRAINT "appointment_waitlist_offer_waitlist_id_appointment_waitlist_id_fk" FOREIGN KEY ("waitlist_id") REFERENCES "public"."appointment_waitlist"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_waitlist_offer" ADD CONSTRAINT "appointment_waitlist_offer_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_waitlist_offer" ADD CONSTRAINT "appointment_waitlist_offer_provider_id_clinic_provider_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."clinic_provider"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appt_waitlist_org_status_idx" ON "appointment_waitlist" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "appt_waitlist_patient_idx" ON "appointment_waitlist" USING btree ("patient_id");--> statement-breakpoint
CREATE UNIQUE INDEX "appt_waitlist_offer_token_idx" ON "appointment_waitlist_offer" USING btree ("token");--> statement-breakpoint
CREATE INDEX "appt_waitlist_offer_org_status_idx" ON "appointment_waitlist_offer" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "appt_waitlist_offer_waitlist_idx" ON "appointment_waitlist_offer" USING btree ("waitlist_id");--> statement-breakpoint
CREATE INDEX "appt_waitlist_offer_freedby_idx" ON "appointment_waitlist_offer" USING btree ("freed_by_appointment_id");