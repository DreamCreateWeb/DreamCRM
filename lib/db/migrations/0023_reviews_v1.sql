CREATE TABLE "clinic_review_config" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"google_place_id" text,
	"healthgrades_url" text,
	"facebook_page_id" text,
	"yelp_business_slug" text,
	"min_days_between_requests" integer DEFAULT 365 NOT NULL,
	"nps_enabled" integer DEFAULT 0 NOT NULL,
	"auto_send_enabled" integer DEFAULT 0 NOT NULL,
	"auto_send_delay_hours" integer DEFAULT 48 NOT NULL,
	"private_feedback_email" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_request" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"patient_id" text NOT NULL,
	"appointment_id" text,
	"requested_by_user_id" text,
	"channel" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp,
	"clicked_at" timestamp,
	"completed_at" timestamp,
	"selected_site" text,
	"token" text NOT NULL,
	"error_message" text,
	"rating" integer,
	"private_feedback" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clinic_review_config" ADD CONSTRAINT "clinic_review_config_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_request" ADD CONSTRAINT "review_request_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_request" ADD CONSTRAINT "review_request_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_request" ADD CONSTRAINT "review_request_appointment_id_appointment_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointment"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_request" ADD CONSTRAINT "review_request_requested_by_user_id_user_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "review_request_token_idx" ON "review_request" USING btree ("token");--> statement-breakpoint
CREATE INDEX "review_request_org_status_idx" ON "review_request" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "review_request_org_sent_idx" ON "review_request" USING btree ("organization_id","sent_at");--> statement-breakpoint
CREATE INDEX "review_request_patient_idx" ON "review_request" USING btree ("organization_id","patient_id");