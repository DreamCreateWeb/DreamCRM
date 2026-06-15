CREATE TABLE "gbp_post" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"account_id" text NOT NULL,
	"zernio_post_id" text,
	"post_type" text DEFAULT 'standard' NOT NULL,
	"summary" text NOT NULL,
	"image_url" text,
	"cta_type" text,
	"cta_url" text,
	"event_title" text,
	"event_start_at" timestamp with time zone,
	"event_end_at" timestamp with time zone,
	"offer_coupon_code" text,
	"offer_redeem_url" text,
	"offer_terms" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"google_url" text,
	"last_error" text,
	"is_demo" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gbp_post" ADD CONSTRAINT "gbp_post_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gbp_post_org_created_idx" ON "gbp_post" USING btree ("organization_id","created_at");