CREATE TABLE "email_snippet" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"created_by_user_id" text,
	"name" text NOT NULL,
	"body" text NOT NULL,
	"shortcut" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_message" ADD COLUMN "patient_id" text;--> statement-breakpoint
ALTER TABLE "email_message" ADD COLUMN "intent" text;--> statement-breakpoint
ALTER TABLE "email_message" ADD COLUMN "thread_summary" text;--> statement-breakpoint
ALTER TABLE "email_snippet" ADD CONSTRAINT "email_snippet_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_snippet" ADD CONSTRAINT "email_snippet_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_snippet_org_idx" ON "email_snippet" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "email_message" ADD CONSTRAINT "email_message_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_message_patient_idx" ON "email_message" USING btree ("patient_id");