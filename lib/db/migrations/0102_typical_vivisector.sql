CREATE TABLE "booking_deposit" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"patient_id" text NOT NULL,
	"appointment_id" text,
	"visit_type" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"stripe_checkout_session_id" text,
	"stripe_payment_intent_id" text,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"paid_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "booking_deposit" ADD CONSTRAINT "booking_deposit_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_deposit" ADD CONSTRAINT "booking_deposit_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_deposit" ADD CONSTRAINT "booking_deposit_appointment_id_appointment_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointment"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "booking_deposit_org_status_idx" ON "booking_deposit" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "booking_deposit_appt_idx" ON "booking_deposit" USING btree ("appointment_id");--> statement-breakpoint
CREATE INDEX "booking_deposit_session_idx" ON "booking_deposit" USING btree ("stripe_checkout_session_id");