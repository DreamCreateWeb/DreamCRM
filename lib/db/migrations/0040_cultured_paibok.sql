ALTER TABLE "service_library" ADD COLUMN "submitted_by_org_id" text;--> statement-breakpoint
ALTER TABLE "service_library" ADD COLUMN "review_notes" text;--> statement-breakpoint
ALTER TABLE "service_library" ADD CONSTRAINT "service_library_submitted_by_org_id_organization_id_fk" FOREIGN KEY ("submitted_by_org_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_service_library_status" ON "service_library" USING btree ("status");