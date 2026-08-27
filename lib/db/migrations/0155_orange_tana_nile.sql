DROP INDEX "marketing_pageview_day_path_channel_idx";--> statement-breakpoint
ALTER TABLE "marketing_pageview" ADD COLUMN "campaign" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "marketing_pageview" ADD COLUMN "sessions" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "marketing_pageview_day_path_channel_campaign_idx" ON "marketing_pageview" USING btree ("day","path","channel","campaign");