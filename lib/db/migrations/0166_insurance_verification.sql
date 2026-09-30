-- Insurance verification (2026-09-30) — `insurance_verification`.
--
-- One row per eligibility lookup a staff member ran from /insurance or a
-- patient's record (lib/services/insurance-eligibility/). The patient's three
-- insurance columns stay the "on file" truth; this is the HISTORY of what the
-- payer — today the labelled sandbox driver, INSURANCE_DRIVER=sandbox — said
-- about it. `patient_id` is nullable (a NEW patient can be checked before a
-- record exists) and set-null so history survives merges; error rows are
-- stored too, because "we asked and couldn't get an answer" is part of the
-- story. `driver` is read by the UI to label practice answers as such.
--
-- NO PRODUCTION PRECONDITION. This creates a new table and its own indexes;
-- there is no existing data it can conflict with, so it applies cleanly on
-- any state of the database.
--
-- LOCK NOTE: CREATE TABLE + CREATE INDEX on an empty table — instantaneous.

CREATE TABLE "insurance_verification" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"patient_id" text,
	"requested_by_user_id" text,
	"driver" text NOT NULL,
	"status" text NOT NULL,
	"input" jsonb NOT NULL,
	"result" jsonb,
	"error" text,
	"checked_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "insurance_verification" ADD CONSTRAINT "insurance_verification_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insurance_verification" ADD CONSTRAINT "insurance_verification_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insurance_verification" ADD CONSTRAINT "insurance_verification_requested_by_user_id_user_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "insurance_verification_org_checked_idx" ON "insurance_verification" USING btree ("organization_id","checked_at");--> statement-breakpoint
CREATE INDEX "insurance_verification_org_patient_idx" ON "insurance_verification" USING btree ("organization_id","patient_id","checked_at");