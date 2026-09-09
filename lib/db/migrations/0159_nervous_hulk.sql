CREATE TABLE "event_capture" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"token" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text DEFAULT '' NOT NULL,
	"email" text NOT NULL,
	"practice_name" text NOT NULL,
	"role" text DEFAULT 'other' NOT NULL,
	"city" text,
	"photo_url" text,
	"photo_release_at" timestamp NOT NULL,
	"opt_in" integer DEFAULT 0 NOT NULL,
	"opt_in_at" timestamp,
	"grade_id" text,
	"prospect_id" text,
	"delivered_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_event" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"organizer" text,
	"state" text,
	"starts_on" text,
	"ends_on" text,
	"capture_token" text NOT NULL,
	"active" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_capture" ADD CONSTRAINT "event_capture_event_id_marketing_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."marketing_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_capture" ADD CONSTRAINT "event_capture_grade_id_practice_grade_id_fk" FOREIGN KEY ("grade_id") REFERENCES "public"."practice_grade"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_capture" ADD CONSTRAINT "event_capture_prospect_id_prospect_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospect"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_mcap_token" ON "event_capture" USING btree ("token");--> statement-breakpoint
CREATE INDEX "idx_mcap_event" ON "event_capture" USING btree ("event_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_mcap_email" ON "event_capture" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_mevt_slug" ON "marketing_event" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_mevt_token" ON "marketing_event" USING btree ("capture_token");