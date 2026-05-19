CREATE TABLE "inbox_action_log" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"message_id" text,
	"thread_id" text,
	"action" text NOT NULL,
	"actor_kind" text DEFAULT 'system' NOT NULL,
	"actor_user_id" text,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inbox_action_log" ADD CONSTRAINT "inbox_action_log_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_action_log" ADD CONSTRAINT "inbox_action_log_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inbox_action_log_org_idx" ON "inbox_action_log" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "inbox_action_log_message_idx" ON "inbox_action_log" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "inbox_action_log_thread_idx" ON "inbox_action_log" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "inbox_action_log_created_idx" ON "inbox_action_log" USING btree ("created_at");