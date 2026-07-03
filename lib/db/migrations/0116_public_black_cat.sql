CREATE TABLE "outreach_enrollment" (
	"id" text PRIMARY KEY NOT NULL,
	"prospect_id" text NOT NULL,
	"sequence_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"current_step" integer DEFAULT 0 NOT NULL,
	"next_send_at" timestamp with time zone,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"stopped_at" timestamp with time zone,
	"stop_reason" text
);
--> statement-breakpoint
CREATE TABLE "outreach_event" (
	"id" text PRIMARY KEY NOT NULL,
	"prospect_id" text NOT NULL,
	"touch_log_id" text,
	"type" text NOT NULL,
	"meta" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_sequence" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_touch_log" (
	"id" text PRIMARY KEY NOT NULL,
	"enrollment_id" text NOT NULL,
	"prospect_id" text NOT NULL,
	"step_number" integer NOT NULL,
	"template_id" text,
	"subject" text NOT NULL,
	"body_html" text NOT NULL,
	"channel" text NOT NULL,
	"resend_email_id" text,
	"status" text DEFAULT 'sent' NOT NULL,
	"error" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_touch_template" (
	"id" text PRIMARY KEY NOT NULL,
	"sequence_id" text NOT NULL,
	"step_number" integer NOT NULL,
	"day_offset" integer NOT NULL,
	"subject_template" text NOT NULL,
	"body_template" text NOT NULL,
	"ai_personalize" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospect" (
	"id" text PRIMARY KEY NOT NULL,
	"npi_number" text,
	"name" text NOT NULL,
	"address_line1" text,
	"city" text,
	"state" text,
	"postal_code" text,
	"phone" text,
	"dedupe_hash" text,
	"taxonomy_code" text,
	"authorized_official_name" text,
	"authorized_official_title" text,
	"timezone" text,
	"status" text DEFAULT 'discovered' NOT NULL,
	"email" text,
	"email_source" text,
	"website_url" text,
	"google_place_id" text,
	"google_rating_tenths" integer,
	"review_count" integer,
	"business_status" text,
	"google_maps_uri" text,
	"enrichment" jsonb,
	"ai_verdict" jsonb,
	"opportunity_score" integer,
	"score_band" text,
	"score_reasons" jsonb,
	"enriched_at" timestamp with time zone,
	"scored_at" timestamp with time zone,
	"intent_signal" text,
	"intent_at" timestamp with time zone,
	"intent_summary" text,
	"talking_points" jsonb,
	"suppressed_reason" text,
	"suppressed_at" timestamp with time zone,
	"converted_organization_id" text,
	"agency_project_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospect_call_log" (
	"id" text PRIMARY KEY NOT NULL,
	"prospect_id" text NOT NULL,
	"outcome" text NOT NULL,
	"note" text,
	"called_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospect_discovery_task" (
	"id" text PRIMARY KEY NOT NULL,
	"state" text NOT NULL,
	"zip_prefix" text NOT NULL,
	"skip" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"found" integer DEFAULT 0 NOT NULL,
	"imported" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospect_suppression" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"domain" text,
	"reason" text NOT NULL,
	"prospect_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospecting_config" (
	"id" text PRIMARY KEY NOT NULL,
	"config" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospecting_counter" (
	"id" text PRIMARY KEY NOT NULL,
	"period" text NOT NULL,
	"kind" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "outreach_enrollment" ADD CONSTRAINT "outreach_enrollment_prospect_id_prospect_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospect"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_enrollment" ADD CONSTRAINT "outreach_enrollment_sequence_id_outreach_sequence_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."outreach_sequence"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_event" ADD CONSTRAINT "outreach_event_prospect_id_prospect_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospect"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_event" ADD CONSTRAINT "outreach_event_touch_log_id_outreach_touch_log_id_fk" FOREIGN KEY ("touch_log_id") REFERENCES "public"."outreach_touch_log"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_touch_log" ADD CONSTRAINT "outreach_touch_log_enrollment_id_outreach_enrollment_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."outreach_enrollment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_touch_template" ADD CONSTRAINT "outreach_touch_template_sequence_id_outreach_sequence_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."outreach_sequence"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect" ADD CONSTRAINT "prospect_converted_organization_id_organization_id_fk" FOREIGN KEY ("converted_organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_call_log" ADD CONSTRAINT "prospect_call_log_prospect_id_prospect_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospect"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_oenr_live_prospect" ON "outreach_enrollment" USING btree ("prospect_id") WHERE "outreach_enrollment"."status" IN ('active', 'paused_ooo');--> statement-breakpoint
CREATE INDEX "idx_oenr_due" ON "outreach_enrollment" USING btree ("status","next_send_at");--> statement-breakpoint
CREATE INDEX "idx_oevt_prospect_time" ON "outreach_event" USING btree ("prospect_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_otch_claim" ON "outreach_touch_log" USING btree ("enrollment_id","step_number");--> statement-breakpoint
CREATE INDEX "idx_otch_prospect" ON "outreach_touch_log" USING btree ("prospect_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_otpl_seq_step" ON "outreach_touch_template" USING btree ("sequence_id","step_number");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_prospect_npi" ON "prospect" USING btree ("npi_number");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_prospect_dedupe" ON "prospect" USING btree ("dedupe_hash");--> statement-breakpoint
CREATE INDEX "idx_prospect_state" ON "prospect" USING btree ("state");--> statement-breakpoint
CREATE INDEX "idx_prospect_status" ON "prospect" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_prospect_band" ON "prospect" USING btree ("score_band");--> statement-breakpoint
CREATE INDEX "idx_prospect_call_list" ON "prospect" USING btree ("status","intent_at");--> statement-breakpoint
CREATE INDEX "idx_pcall_prospect" ON "prospect_call_log" USING btree ("prospect_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_pdt_state_zip" ON "prospect_discovery_task" USING btree ("state","zip_prefix");--> statement-breakpoint
CREATE INDEX "idx_pdt_status" ON "prospect_discovery_task" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_psup_email" ON "prospect_suppression" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_psup_domain" ON "prospect_suppression" USING btree ("domain");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_pctr_period_kind" ON "prospecting_counter" USING btree ("period","kind");