CREATE TABLE "clinic_closure" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clinic_closure" ADD CONSTRAINT "clinic_closure_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clinic_closure_org_starts_idx" ON "clinic_closure" USING btree ("organization_id","starts_on");