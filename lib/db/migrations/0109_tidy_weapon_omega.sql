CREATE TABLE "patient_referral_link" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"patient_id" text NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "patient" ADD COLUMN "referred_by_patient_id" text;--> statement-breakpoint
ALTER TABLE "patient_referral_link" ADD CONSTRAINT "patient_referral_link_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_referral_link" ADD CONSTRAINT "patient_referral_link_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "patient_referral_link_token_idx" ON "patient_referral_link" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "patient_referral_link_patient_idx" ON "patient_referral_link" USING btree ("organization_id","patient_id");