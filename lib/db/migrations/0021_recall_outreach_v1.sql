ALTER TYPE "public"."campaign_channel" ADD VALUE 'twilio_sms';--> statement-breakpoint
ALTER TYPE "public"."campaign_event_type" ADD VALUE 'booked';--> statement-breakpoint
CREATE TABLE "clinic_sms_config" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"twilio_phone_number" text,
	"twilio_phone_number_sid" text,
	"a2p_brand_sid" text,
	"a2p_campaign_sid" text,
	"a2p_status" text DEFAULT 'none' NOT NULL,
	"a2p_status_updated_at" timestamp,
	"monthly_send_count" integer DEFAULT 0 NOT NULL,
	"monthly_send_count_reset_at" timestamp,
	"monthly_send_budget_cents" integer,
	"last_error_meta" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" text,
	"kind" text DEFAULT 'custom' NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"subject" text NOT NULL,
	"preview_text" text,
	"body_html" text NOT NULL,
	"body_json" jsonb,
	"default_channel" "campaign_channel" DEFAULT 'resend' NOT NULL,
	"default_audience_slug" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "patient" ADD COLUMN "marketing_email_opt_in" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "patient" ADD COLUMN "marketing_email_opt_in_at" timestamp;--> statement-breakpoint
ALTER TABLE "patient" ADD COLUMN "marketing_email_opt_out_at" timestamp;--> statement-breakpoint
ALTER TABLE "patient" ADD COLUMN "marketing_sms_opt_in" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "patient" ADD COLUMN "marketing_sms_opt_in_at" timestamp;--> statement-breakpoint
ALTER TABLE "patient" ADD COLUMN "marketing_sms_opt_out_at" timestamp;--> statement-breakpoint
ALTER TABLE "patient" ADD COLUMN "marketing_opt_in_source" text;--> statement-breakpoint
ALTER TABLE "audiences" ADD COLUMN "recipient_source" text DEFAULT 'customers' NOT NULL;--> statement-breakpoint
ALTER TABLE "audiences" ADD COLUMN "patient_filter" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_events" ADD COLUMN "patient_id" text;--> statement-breakpoint
ALTER TABLE "campaign_events" ADD COLUMN "booked_appointment_id" text;--> statement-breakpoint
ALTER TABLE "campaign_events" ADD COLUMN "booked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "recipient_source" text DEFAULT 'customers' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "template_id" integer;--> statement-breakpoint
ALTER TABLE "clinic_sms_config" ADD CONSTRAINT "clinic_sms_config_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_templates" ADD CONSTRAINT "campaign_templates_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_templates" ADD CONSTRAINT "campaign_templates_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_template_org_name_idx" ON "campaign_templates" USING btree ("organization_id","name");--> statement-breakpoint
ALTER TABLE "campaign_events" ADD CONSTRAINT "campaign_events_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_events" ADD CONSTRAINT "campaign_events_booked_appointment_id_appointment_id_fk" FOREIGN KEY ("booked_appointment_id") REFERENCES "public"."appointment"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "patient_org_marketing_email_idx" ON "patient" USING btree ("organization_id","marketing_email_opt_in");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_events_campaign_patient_type_idx" ON "campaign_events" USING btree ("campaign_id","patient_id","type","occurred_at");