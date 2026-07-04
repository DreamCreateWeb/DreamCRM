ALTER TABLE "outreach_sequence" ADD COLUMN "segment" text;--> statement-breakpoint
ALTER TABLE "prospect" ADD COLUMN "reply_draft" text;--> statement-breakpoint
ALTER TABLE "prospect_discovery_task" ADD COLUMN "entity_phase" text DEFAULT 'org' NOT NULL;