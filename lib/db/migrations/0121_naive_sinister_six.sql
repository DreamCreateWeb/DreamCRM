ALTER TABLE "prospect" ADD COLUMN "next_follow_up_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "prospect" ADD COLUMN "follow_up_reason" text;