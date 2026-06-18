ALTER TABLE "campaigns" ADD COLUMN "automation_key" text;--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN "birthday_auto_send_enabled" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN "lapsed_reactivation_enabled" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "campaigns_org_automation_key_idx" ON "campaigns" USING btree ("organization_id","automation_key") WHERE "campaigns"."automation_key" is not null;