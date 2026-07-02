CREATE TABLE "payment_plan" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"patient_id" text NOT NULL,
	"token" text NOT NULL,
	"total_cents" integer NOT NULL,
	"installment_cents" integer NOT NULL,
	"installments" integer NOT NULL,
	"installments_paid" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"stripe_customer_id" text,
	"stripe_payment_method_id" text,
	"stripe_setup_session_id" text,
	"next_charge_at" timestamp,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"proposed_by_user_id" text,
	"accepted_at" timestamp,
	"completed_at" timestamp,
	"canceled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_plan" ADD CONSTRAINT "payment_plan_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_plan" ADD CONSTRAINT "payment_plan_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_plan_token_idx" ON "payment_plan" USING btree ("token");--> statement-breakpoint
CREATE INDEX "payment_plan_org_status_idx" ON "payment_plan" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "payment_plan_patient_idx" ON "payment_plan" USING btree ("patient_id","created_at");--> statement-breakpoint
CREATE INDEX "payment_plan_due_idx" ON "payment_plan" USING btree ("status","next_charge_at");