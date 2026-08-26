CREATE TABLE "marketing_pageview" (
	"id" serial PRIMARY KEY NOT NULL,
	"day" date NOT NULL,
	"path" text NOT NULL,
	"channel" text NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN "signup_attribution" jsonb;--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN "hide_powered_by" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "marketing_pageview_day_path_channel_idx" ON "marketing_pageview" USING btree ("day","path","channel");