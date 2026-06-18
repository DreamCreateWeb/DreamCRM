CREATE TABLE "daily_digest_log" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"sent_on" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN "daily_digest_enabled" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_digest_log" ADD CONSTRAINT "daily_digest_log_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_digest_log" ADD CONSTRAINT "daily_digest_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "daily_digest_log_user_day_idx" ON "daily_digest_log" USING btree ("user_id","sent_on");