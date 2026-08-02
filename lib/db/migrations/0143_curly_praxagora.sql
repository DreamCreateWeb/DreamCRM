ALTER TABLE "campaign_events" ALTER COLUMN "recipient_email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_events" ADD COLUMN "recipient_phone" text;