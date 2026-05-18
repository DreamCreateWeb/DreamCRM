CREATE TABLE "email_account" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"connected_by_user_id" text NOT NULL,
	"provider" text NOT NULL,
	"email_address" text NOT NULL,
	"display_name" text,
	"refresh_token_encrypted" text NOT NULL,
	"access_token" text,
	"access_expires_at" timestamp with time zone,
	"scope" text,
	"history_id" text,
	"sync_status" text DEFAULT 'pending' NOT NULL,
	"sync_error" text,
	"last_sync_at" timestamp with time zone,
	"disabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_message" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"provider_message_id" text NOT NULL,
	"provider_thread_id" text,
	"folder" text DEFAULT 'inbox' NOT NULL,
	"from_name" text,
	"from_email" text NOT NULL,
	"to_emails" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cc_emails" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subject" text,
	"snippet" text,
	"body_text" text,
	"body_html" text,
	"is_read" boolean DEFAULT false NOT NULL,
	"is_starred" boolean DEFAULT false NOT NULL,
	"labels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_account" ADD CONSTRAINT "email_account_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_account" ADD CONSTRAINT "email_account_connected_by_user_id_user_id_fk" FOREIGN KEY ("connected_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_message" ADD CONSTRAINT "email_message_account_id_email_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."email_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_message" ADD CONSTRAINT "email_message_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_account_org_idx" ON "email_account" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "email_message_account_idx" ON "email_message" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "email_message_org_idx" ON "email_message" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "email_message_received_idx" ON "email_message" USING btree ("received_at");