CREATE TABLE "zernio_account" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"platform" text NOT NULL,
	"account_id" text NOT NULL,
	"username" text,
	"display_name" text,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zernio_connection" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"zernio_profile_id" text,
	"status" text DEFAULT 'disconnected' NOT NULL,
	"last_error" text,
	"is_demo" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "zernio_account" ADD CONSTRAINT "zernio_account_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zernio_connection" ADD CONSTRAINT "zernio_connection_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "zernio_account_org_platform_account_idx" ON "zernio_account" USING btree ("organization_id","platform","account_id");