CREATE TABLE "clinic_domain_purchase" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"domain" text NOT NULL,
	"status" text DEFAULT 'registering' NOT NULL,
	"purchase_price_cents" integer NOT NULL,
	"renewal_price_cents" integer,
	"currency" text DEFAULT 'usd' NOT NULL,
	"stripe_payment_intent_id" text,
	"dry_run" integer DEFAULT 0 NOT NULL,
	"error" text,
	"purchased_at" timestamp,
	"renews_at" timestamp,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clinic_domain_purchase" ADD CONSTRAINT "clinic_domain_purchase_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_domain_purchase" ADD CONSTRAINT "clinic_domain_purchase_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clinic_domain_purchase_org_idx" ON "clinic_domain_purchase" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "clinic_domain_purchase_active_domain_idx" ON "clinic_domain_purchase" USING btree ("domain") WHERE "clinic_domain_purchase"."status" in ('registering', 'active') and "clinic_domain_purchase"."dry_run" = 0;