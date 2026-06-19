DROP INDEX "patient_view_org_name_idx";--> statement-breakpoint
ALTER TABLE "patient_view" ADD COLUMN "surface" text DEFAULT 'patients' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "patient_view_org_surface_name_idx" ON "patient_view" USING btree ("organization_id","surface",lower("name"));