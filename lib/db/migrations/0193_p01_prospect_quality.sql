ALTER TABLE "prospect" ADD COLUMN "website_source" text;--> statement-breakpoint
ALTER TABLE "prospect" ADD COLUMN "verification" jsonb;--> statement-breakpoint
ALTER TABLE "prospect" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "prospect" ADD COLUMN "quality_score" integer;--> statement-breakpoint
ALTER TABLE "prospect" ADD COLUMN "quality_band" text;--> statement-breakpoint
ALTER TABLE "prospect" ADD COLUMN "quality_reasons" jsonb;--> statement-breakpoint
ALTER TABLE "prospect" ADD COLUMN "phone_status" text;--> statement-breakpoint
ALTER TABLE "prospect" ADD COLUMN "phone_line_type" text;--> statement-breakpoint
ALTER TABLE "prospect" ADD COLUMN "phone_source" text;--> statement-breakpoint
ALTER TABLE "prospect" ADD COLUMN "phone_validated_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "idx_prospect_quality" ON "prospect" USING btree ("quality_band","quality_score");