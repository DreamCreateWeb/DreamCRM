ALTER TABLE "clinic_sms_config" RENAME COLUMN "twilio_phone_number" TO "sms_phone_number";--> statement-breakpoint
ALTER TABLE "clinic_sms_config" RENAME COLUMN "twilio_phone_number_sid" TO "provider_phone_number_id";--> statement-breakpoint
ALTER TABLE "clinic_sms_config" RENAME COLUMN "a2p_brand_sid" TO "brand_registration_id";--> statement-breakpoint
ALTER TABLE "clinic_sms_config" RENAME COLUMN "a2p_campaign_sid" TO "campaign_registration_id";--> statement-breakpoint
ALTER TABLE "clinic_sms_config" ADD COLUMN "ein" text;--> statement-breakpoint
ALTER TABLE "clinic_sms_config" ADD COLUMN "entity_type" text;--> statement-breakpoint
ALTER TABLE "clinic_sms_config" ADD COLUMN "brand_contact_name" text;--> statement-breakpoint
ALTER TABLE "clinic_sms_config" ADD COLUMN "brand_contact_email" text;