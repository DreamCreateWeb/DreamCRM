ALTER TABLE "clinic_profile" ADD COLUMN "hours_source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN "address_source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN "phone_source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN "google_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN "google_photos" jsonb;