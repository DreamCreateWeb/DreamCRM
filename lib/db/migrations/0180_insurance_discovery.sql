-- 0180 INSURANCE DISCOVERY (2026-10-08): the no-card fallback. One row per
-- search: who was asked about (name, DOB, state, ZIP — never the SSN, which
-- is sent to the clearinghouse and dropped), the candidate cards the payers
-- answered with, and the search's own status so a pending answer can be
-- resumed. A search is NOT a check: picking a card runs the normal
-- eligibility check through the one normalizer.
CREATE TABLE "insurance_discovery" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"patient_id" text,
	"requested_by_user_id" text,
	"driver" text NOT NULL,
	"status" text NOT NULL,
	"input" jsonb NOT NULL,
	"candidates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"coverages_found" integer DEFAULT 0 NOT NULL,
	"discovery_id" text,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "insurance_discovery" ADD CONSTRAINT "insurance_discovery_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insurance_discovery" ADD CONSTRAINT "insurance_discovery_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insurance_discovery" ADD CONSTRAINT "insurance_discovery_requested_by_user_id_user_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "insurance_discovery_org_created_idx" ON "insurance_discovery" USING btree ("organization_id","created_at");