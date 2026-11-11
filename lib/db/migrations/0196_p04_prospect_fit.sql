ALTER TABLE "prospect_discovery_task" ADD COLUMN "refresh_pulled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "prospect_discovery_task" ADD COLUMN "refresh_pulled_reason" text;