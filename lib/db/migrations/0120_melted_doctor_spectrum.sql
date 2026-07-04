CREATE TABLE "prospect_meeting" (
	"id" text PRIMARY KEY NOT NULL,
	"prospect_id" text NOT NULL,
	"token" text NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"duration_min" integer DEFAULT 30 NOT NULL,
	"host_time_zone" text NOT NULL,
	"attendee_name" text,
	"attendee_email" text,
	"note" text,
	"reminded_at" timestamp with time zone,
	"created_by_user_id" text,
	"booked_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "prospect_meeting" ADD CONSTRAINT "prospect_meeting_prospect_id_prospect_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospect"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_pmtg_token" ON "prospect_meeting" USING btree ("token");--> statement-breakpoint
CREATE INDEX "idx_pmtg_prospect" ON "prospect_meeting" USING btree ("prospect_id");--> statement-breakpoint
CREATE INDEX "idx_pmtg_schedule" ON "prospect_meeting" USING btree ("status","scheduled_at");