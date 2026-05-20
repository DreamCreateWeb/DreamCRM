CREATE TABLE "patient_note" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"patient_id" text NOT NULL,
	"author_id" text,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "patient" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "patient" ADD COLUMN "lifecycle" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "patient" ADD COLUMN "first_seen_at" timestamp;--> statement-breakpoint
ALTER TABLE "patient" ADD COLUMN "last_activity_at" timestamp;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "patient_id" text;--> statement-breakpoint
ALTER TABLE "patient_note" ADD CONSTRAINT "patient_note_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_note" ADD CONSTRAINT "patient_note_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_note" ADD CONSTRAINT "patient_note_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "patient_note_patient_created_idx" ON "patient_note" USING btree ("patient_id","created_at");--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "patient_org_name_idx" ON "patient" USING btree ("organization_id","last_name","first_name");--> statement-breakpoint
CREATE INDEX "patient_org_lifecycle_idx" ON "patient" USING btree ("organization_id","lifecycle");--> statement-breakpoint
CREATE INDEX "patient_org_last_activity_idx" ON "patient" USING btree ("organization_id","last_activity_at");--> statement-breakpoint
CREATE INDEX "patient_org_email_idx" ON "patient" USING btree ("organization_id","email");--> statement-breakpoint
-- Backfill: existing rows get a first_seen_at so the detail header and
-- "acquired" copy never read NULL. created_at is the best we have.
UPDATE "patient" SET "first_seen_at" = "created_at" WHERE "first_seen_at" IS NULL;--> statement-breakpoint
-- Backfill: link existing customers rows to their patient by org + email
-- (best-effort; pick the first match if there's more than one — duplicates
-- can be cleaned up case-by-case later).
UPDATE "customers" c
SET "patient_id" = (
  SELECT p."id" FROM "patient" p
  WHERE p."organization_id" = c."organization_id"
    AND lower(p."email") = lower(c."email")
  LIMIT 1
)
WHERE c."patient_id" IS NULL
  AND c."email" IS NOT NULL
  AND c."organization_id" IS NOT NULL;