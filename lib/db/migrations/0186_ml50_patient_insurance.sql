CREATE TABLE "patient_insurance" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"patient_id" text NOT NULL,
	"rank" text NOT NULL,
	"provider" text,
	"policy_number" text,
	"group_number" text,
	"detail" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "insurance_verification" ADD COLUMN "rank" text DEFAULT 'primary' NOT NULL;--> statement-breakpoint
ALTER TABLE "patient_insurance" ADD CONSTRAINT "patient_insurance_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_insurance" ADD CONSTRAINT "patient_insurance_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "patient_insurance_org_patient_rank_uq" ON "patient_insurance" USING btree ("organization_id","patient_id","rank");--> statement-breakpoint
CREATE INDEX "patient_insurance_org_patient_idx" ON "patient_insurance" USING btree ("organization_id","patient_id");--> statement-breakpoint
INSERT INTO "patient_insurance" ("id", "organization_id", "patient_id", "rank", "provider", "policy_number", "group_number", "detail")
SELECT 'pins_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 24), p."organization_id", p."id", 'primary', p."insurance_provider", p."insurance_policy_number", p."insurance_group_number", p."insurance_detail"
FROM "patient" p
WHERE p."insurance_provider" IS NOT NULL OR p."insurance_policy_number" IS NOT NULL OR p."insurance_group_number" IS NOT NULL
ON CONFLICT ("organization_id", "patient_id", "rank") DO NOTHING;
