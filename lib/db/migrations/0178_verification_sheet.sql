-- The verification sheet (2026-10-08, the Ted Pinney breakdown form).
--
-- 1. `insurance_verification.raw_response` — the payer's answer AS
--    RECEIVED (Stedi's 271 as JSON). The first normalizer kept a dozen
--    fields and dropped the rest; the sheet reads most of the rest. Keeping
--    the raw answer makes the next dropped field a code change rather than
--    a second billed check. Nullable; sandbox and error rows store null;
--    never selected into a view.
-- 2. `clinic_payer_note` — THE PAYER NOTEBOOK: the facts about a PAYER that
--    never change per patient (fee schedule, in/out of network, pays on
--    seat or prep, claims address, the phone that answers) and are not in
--    any 271. One row per clinic per payer (unique on org + payer_key);
--    fills those lines on every patient's sheet. A new empty table.
CREATE TABLE "clinic_payer_note" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"payer_key" text NOT NULL,
	"payer_id" text,
	"payer_name" text NOT NULL,
	"fee_schedule" text,
	"network" text,
	"pays_on" text,
	"claims_address" text,
	"phone" text,
	"notes" text,
	"updated_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "insurance_verification" ADD COLUMN "raw_response" jsonb;--> statement-breakpoint
ALTER TABLE "clinic_payer_note" ADD CONSTRAINT "clinic_payer_note_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_payer_note" ADD CONSTRAINT "clinic_payer_note_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "clinic_payer_note_org_payer_uq" ON "clinic_payer_note" USING btree ("organization_id","payer_key");