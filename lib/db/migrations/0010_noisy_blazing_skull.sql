CREATE TYPE "public"."campaign_channel" AS ENUM('resend', 'gmail');--> statement-breakpoint
CREATE TYPE "public"."campaign_event_type" AS ENUM('sent', 'delivered', 'open', 'click', 'bounce', 'complaint', 'unsubscribe', 'failed');--> statement-breakpoint
CREATE TABLE "audiences" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" text,
	"name" text NOT NULL,
	"description" text,
	"filter" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"recipient_email" text NOT NULL,
	"customer_id" integer,
	"type" "campaign_event_type" NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "subject" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "preview_text" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "body_html" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "body_json" jsonb;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "audience_id" integer;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "send_channel" "campaign_channel" DEFAULT 'resend' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "scheduled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "send_stats" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "pipeline_stage" text DEFAULT 'new' NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "lead_source" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "lifecycle_stage" text DEFAULT 'lead' NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "last_activity_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "opted_out" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "audiences" ADD CONSTRAINT "audiences_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audiences" ADD CONSTRAINT "audiences_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_events" ADD CONSTRAINT "campaign_events_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_events" ADD CONSTRAINT "campaign_events_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_events_campaign_recipient_type_idx" ON "campaign_events" USING btree ("campaign_id","recipient_email","type","occurred_at");