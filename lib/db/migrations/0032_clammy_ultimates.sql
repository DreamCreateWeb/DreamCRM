CREATE TABLE "membership" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"patient_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"stripe_subscription_id" text,
	"benefits_used" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"current_period_start" timestamp,
	"current_period_end" timestamp,
	"started_at" timestamp,
	"cancelled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membership_plan" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"billing_interval" text DEFAULT 'annual' NOT NULL,
	"price_cents" integer NOT NULL,
	"benefits" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"discount_percent" integer DEFAULT 0 NOT NULL,
	"stripe_product_id" text,
	"stripe_price_id" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"featured" integer DEFAULT 0 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_config" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"stripe_account_id" text,
	"stripe_account_status" text DEFAULT 'none' NOT NULL,
	"charges_enabled" integer DEFAULT 0 NOT NULL,
	"payouts_enabled" integer DEFAULT 0 NOT NULL,
	"pickup_enabled" integer DEFAULT 1 NOT NULL,
	"shipping_enabled" integer DEFAULT 0 NOT NULL,
	"flat_shipping_cents" integer,
	"free_shipping_threshold_cents" integer,
	"tax_enabled" integer DEFAULT 0 NOT NULL,
	"platform_fee_bps" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"storefront_enabled" integer DEFAULT 0 NOT NULL,
	"membership_enabled" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_coupon" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"code" text NOT NULL,
	"discount_type" text DEFAULT 'percent' NOT NULL,
	"discount_value" integer NOT NULL,
	"patient_id" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"single_use" integer DEFAULT 1 NOT NULL,
	"min_subtotal_cents" integer,
	"active" integer DEFAULT 1 NOT NULL,
	"expires_at" timestamp,
	"used_at" timestamp,
	"used_order_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_order" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"patient_id" text,
	"email" text NOT NULL,
	"name" text,
	"phone" text,
	"fulfillment_type" text DEFAULT 'pickup' NOT NULL,
	"shipping_address" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"fulfillment_status" text DEFAULT 'unfulfilled' NOT NULL,
	"subtotal_cents" integer DEFAULT 0 NOT NULL,
	"shipping_cents" integer DEFAULT 0 NOT NULL,
	"tax_cents" integer DEFAULT 0 NOT NULL,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"coupon_id" text,
	"stripe_checkout_session_id" text,
	"stripe_payment_intent_id" text,
	"tracking_number" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"paid_at" timestamp,
	"fulfilled_at" timestamp,
	"cancelled_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_order_item" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"variant_id" text,
	"product_name" text NOT NULL,
	"variant_name" text,
	"sku" text,
	"unit_price_cents" integer NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_product" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"category" text DEFAULT 'other' NOT NULL,
	"images" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"fulfillment" text DEFAULT 'both' NOT NULL,
	"fsa_eligible" integer DEFAULT 0 NOT NULL,
	"featured" integer DEFAULT 0 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_product_variant" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"name" text DEFAULT 'Default' NOT NULL,
	"sku" text,
	"price_cents" integer NOT NULL,
	"compare_at_cents" integer,
	"inventory_qty" integer,
	"options" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_plan_id_membership_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."membership_plan"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_plan" ADD CONSTRAINT "membership_plan_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_config" ADD CONSTRAINT "shop_config_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_coupon" ADD CONSTRAINT "shop_coupon_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_coupon" ADD CONSTRAINT "shop_coupon_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_order" ADD CONSTRAINT "shop_order_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_order" ADD CONSTRAINT "shop_order_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_order" ADD CONSTRAINT "shop_order_coupon_id_shop_coupon_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."shop_coupon"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_order_item" ADD CONSTRAINT "shop_order_item_order_id_shop_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."shop_order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_order_item" ADD CONSTRAINT "shop_order_item_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_product" ADD CONSTRAINT "shop_product_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_product_variant" ADD CONSTRAINT "shop_product_variant_product_id_shop_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."shop_product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_product_variant" ADD CONSTRAINT "shop_product_variant_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "membership_org_status_idx" ON "membership" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "membership_patient_idx" ON "membership" USING btree ("patient_id");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_plan_org_slug_idx" ON "membership_plan" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_coupon_org_code_idx" ON "shop_coupon" USING btree ("organization_id","code");--> statement-breakpoint
CREATE INDEX "shop_order_org_status_idx" ON "shop_order" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "shop_order_patient_idx" ON "shop_order" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "shop_order_item_order_idx" ON "shop_order_item" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_product_org_slug_idx" ON "shop_product" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "shop_product_org_status_idx" ON "shop_product" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "shop_variant_product_idx" ON "shop_product_variant" USING btree ("product_id");