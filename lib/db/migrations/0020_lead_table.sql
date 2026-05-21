CREATE TABLE "lead" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"preferred_date" text,
	"message" text,
	"source_page" text,
	"referrer" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"status" text DEFAULT 'new' NOT NULL,
	"converted_to_patient_id" text,
	"contacted_at" timestamp,
	"converted_at" timestamp,
	"archived_at" timestamp,
	"archived_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_converted_to_patient_id_patient_id_fk" FOREIGN KEY ("converted_to_patient_id") REFERENCES "public"."patient"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_org_status_idx" ON "lead" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "lead_org_created_idx" ON "lead" USING btree ("organization_id","created_at");