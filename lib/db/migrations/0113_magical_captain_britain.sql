CREATE TABLE "loyalty_event" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"patient_id" text NOT NULL,
	"kind" text NOT NULL,
	"points" integer NOT NULL,
	"source_id" text NOT NULL,
	"note" text,
	"created_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appointment" ADD COLUMN "arrived_at" timestamp;--> statement-breakpoint
ALTER TABLE "appointment" ADD COLUMN "seated_at" timestamp;--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN "loyalty" jsonb;--> statement-breakpoint
ALTER TABLE "loyalty_event" ADD CONSTRAINT "loyalty_event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_event" ADD CONSTRAINT "loyalty_event_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "loyalty_event_source_idx" ON "loyalty_event" USING btree ("organization_id","kind","source_id");--> statement-breakpoint
CREATE INDEX "loyalty_event_patient_idx" ON "loyalty_event" USING btree ("patient_id","created_at");--> statement-breakpoint
CREATE INDEX "loyalty_event_org_idx" ON "loyalty_event" USING btree ("organization_id","created_at");