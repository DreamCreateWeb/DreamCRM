CREATE TABLE "nps_response" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"patient_id" text NOT NULL,
	"appointment_id" text,
	"token" text NOT NULL,
	"score" integer,
	"comment" text,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"responded_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "nps_response" ADD CONSTRAINT "nps_response_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nps_response" ADD CONSTRAINT "nps_response_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "nps_response_token_idx" ON "nps_response" USING btree ("token");--> statement-breakpoint
CREATE INDEX "nps_response_org_idx" ON "nps_response" USING btree ("organization_id","sent_at");--> statement-breakpoint
CREATE INDEX "nps_response_patient_idx" ON "nps_response" USING btree ("patient_id","sent_at");