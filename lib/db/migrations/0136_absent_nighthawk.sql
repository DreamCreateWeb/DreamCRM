CREATE TABLE "action_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"capability" text NOT NULL,
	"patient_id" text,
	"summary" text NOT NULL,
	"detail" jsonb,
	"occurred_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN "autonomy" jsonb;--> statement-breakpoint
ALTER TABLE "action_ledger" ADD CONSTRAINT "action_ledger_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_ledger" ADD CONSTRAINT "action_ledger_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "action_ledger_org_time_idx" ON "action_ledger" USING btree ("organization_id","occurred_at");--> statement-breakpoint
CREATE INDEX "action_ledger_org_capability_idx" ON "action_ledger" USING btree ("organization_id","capability");--> statement-breakpoint
CREATE INDEX "action_ledger_patient_idx" ON "action_ledger" USING btree ("patient_id");