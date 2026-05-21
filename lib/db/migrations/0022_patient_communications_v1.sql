CREATE TABLE "patient_message" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"patient_id" text NOT NULL,
	"channel" text NOT NULL,
	"direction" text NOT NULL,
	"body" text NOT NULL,
	"sent_by_user_id" text,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"delivered_at" timestamp,
	"read_by_patient_at" timestamp,
	"replied_at" timestamp,
	"external_id" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patient_thread" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"patient_id" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"assigned_user_id" text,
	"snoozed_until" timestamp,
	"last_message_at" timestamp,
	"last_message_direction" text,
	"last_message_channel" text,
	"unread_count_for_clinic" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "patient_message" ADD CONSTRAINT "patient_message_thread_id_patient_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."patient_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_message" ADD CONSTRAINT "patient_message_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_message" ADD CONSTRAINT "patient_message_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_message" ADD CONSTRAINT "patient_message_sent_by_user_id_user_id_fk" FOREIGN KEY ("sent_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_thread" ADD CONSTRAINT "patient_thread_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_thread" ADD CONSTRAINT "patient_thread_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_thread" ADD CONSTRAINT "patient_thread_assigned_user_id_user_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "patient_message_thread_sent_idx" ON "patient_message" USING btree ("thread_id","sent_at");--> statement-breakpoint
CREATE INDEX "patient_message_org_sent_idx" ON "patient_message" USING btree ("organization_id","sent_at");--> statement-breakpoint
CREATE INDEX "patient_thread_org_status_last_idx" ON "patient_thread" USING btree ("organization_id","status","last_message_at");--> statement-breakpoint
CREATE UNIQUE INDEX "patient_thread_org_patient_idx" ON "patient_thread" USING btree ("organization_id","patient_id");--> statement-breakpoint
CREATE INDEX "patient_thread_org_assigned_idx" ON "patient_thread" USING btree ("organization_id","assigned_user_id");