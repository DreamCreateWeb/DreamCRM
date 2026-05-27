CREATE TABLE "gsc_connection" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"connected_by_user_id" text,
	"site_url" text,
	"refresh_token_encrypted" text NOT NULL,
	"access_token" text,
	"access_expires_at" timestamp,
	"scope" text,
	"status" text DEFAULT 'needs_site' NOT NULL,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gsc_connection" ADD CONSTRAINT "gsc_connection_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gsc_connection" ADD CONSTRAINT "gsc_connection_connected_by_user_id_user_id_fk" FOREIGN KEY ("connected_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;