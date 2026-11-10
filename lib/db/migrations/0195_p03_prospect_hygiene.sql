ALTER TABLE "prospect" ADD COLUMN "merged_into_prospect_id" text;--> statement-breakpoint
ALTER TABLE "prospect" ADD COLUMN "dormant_from_status" text;--> statement-breakpoint
ALTER TABLE "prospect_discovery_task" ADD COLUMN "last_refreshed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "prospect_discovery_task" ADD COLUMN "last_refresh_error_at" timestamp with time zone;