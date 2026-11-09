ALTER TABLE "clinic_profile" ADD COLUMN "referral_source" text;--> statement-breakpoint
ALTER TABLE "referral_partner" ADD COLUMN "share_code" text;--> statement-breakpoint
ALTER TABLE "referral_partner" ADD CONSTRAINT "referral_partner_share_code_unique" UNIQUE("share_code");