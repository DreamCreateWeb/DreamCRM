CREATE TABLE "balance_payment_request" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"patient_id" text NOT NULL,
	"token" text NOT NULL,
	"balance_cents_at_send" integer,
	"status" text DEFAULT 'sent' NOT NULL,
	"source" text DEFAULT 'staff' NOT NULL,
	"sent_by_user_id" text,
	"payment_id" text,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "balance_payment_request" ADD CONSTRAINT "balance_payment_request_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "balance_payment_request" ADD CONSTRAINT "balance_payment_request_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "balance_pay_request_token_idx" ON "balance_payment_request" USING btree ("token");--> statement-breakpoint
CREATE INDEX "balance_pay_request_org_idx" ON "balance_payment_request" USING btree ("organization_id","sent_at");--> statement-breakpoint
CREATE INDEX "balance_pay_request_patient_idx" ON "balance_payment_request" USING btree ("patient_id","sent_at");