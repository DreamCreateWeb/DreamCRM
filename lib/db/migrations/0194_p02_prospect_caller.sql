CREATE TABLE "prospect_caller" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"status" text DEFAULT 'invited' NOT NULL,
	"invite_token" text,
	"invite_sent_at" timestamp with time zone,
	"invite_expires_at" timestamp with time zone,
	"user_id" text,
	"daily_target" integer DEFAULT 40 NOT NULL,
	"states" jsonb,
	"notes" text,
	"created_by_user_id" text,
	"last_active_at" timestamp with time zone,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "prospect_caller_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "prospect" ADD COLUMN "assigned_caller_id" text;--> statement-breakpoint
ALTER TABLE "prospect" ADD COLUMN "assigned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "prospect" ADD COLUMN "caller_cooldown_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "prospect_call_log" ADD COLUMN "caller_id" text;--> statement-breakpoint
ALTER TABLE "prospect_caller" ADD CONSTRAINT "prospect_caller_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_pcal_user" ON "prospect_caller" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "prospect" ADD CONSTRAINT "prospect_assigned_caller_id_prospect_caller_id_fk" FOREIGN KEY ("assigned_caller_id") REFERENCES "public"."prospect_caller"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_call_log" ADD CONSTRAINT "prospect_call_log_caller_id_prospect_caller_id_fk" FOREIGN KEY ("caller_id") REFERENCES "public"."prospect_caller"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_prospect_assigned_caller" ON "prospect" USING btree ("assigned_caller_id","assigned_at");--> statement-breakpoint
CREATE INDEX "idx_pcall_caller" ON "prospect_call_log" USING btree ("caller_id","created_at");