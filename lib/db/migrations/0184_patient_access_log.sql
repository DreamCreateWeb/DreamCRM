CREATE TABLE "patient_access_log" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"patient_id" text,
	"user_id" text NOT NULL,
	"action" text NOT NULL,
	"detail" jsonb,
	"at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "patient_access_log" ADD CONSTRAINT "patient_access_log_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "patient_access_log_patient_at_idx" ON "patient_access_log" USING btree ("organization_id","patient_id","at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "patient_access_log_user_at_idx" ON "patient_access_log" USING btree ("organization_id","user_id","at" DESC NULLS LAST);