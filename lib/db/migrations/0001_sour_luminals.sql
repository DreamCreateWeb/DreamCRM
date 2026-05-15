ALTER TABLE "billing_profiles" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "billing_profiles" ADD COLUMN "stripe_subscription_id" text;--> statement-breakpoint
ALTER TABLE "billing_profiles" ADD COLUMN "stripe_price_id" text;--> statement-breakpoint
ALTER TABLE "billing_profiles" ADD COLUMN "stripe_status" text;--> statement-breakpoint
ALTER TABLE "billing_profiles" ADD CONSTRAINT "billing_profiles_stripe_customer_id_unique" UNIQUE("stripe_customer_id");--> statement-breakpoint
ALTER TABLE "billing_profiles" ADD CONSTRAINT "billing_profiles_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id");