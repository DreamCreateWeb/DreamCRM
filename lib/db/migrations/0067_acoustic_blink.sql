ALTER TABLE "clinic_profile" ADD COLUMN "social_addon" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN "social_addon_since" timestamp with time zone;