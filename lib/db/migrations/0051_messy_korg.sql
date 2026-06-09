CREATE TABLE "patient_balance_payment" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"patient_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"stripe_checkout_session_id" text,
	"stripe_payment_intent_id" text,
	"balance_cents_at_payment" integer,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"paid_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "patient" ADD COLUMN "guardian_patient_id" text;--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN "portal_settings" jsonb;--> statement-breakpoint
ALTER TABLE "patient_balance_payment" ADD CONSTRAINT "patient_balance_payment_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_balance_payment" ADD CONSTRAINT "patient_balance_payment_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "balance_payment_org_status_idx" ON "patient_balance_payment" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "balance_payment_patient_idx" ON "patient_balance_payment" USING btree ("patient_id","created_at");