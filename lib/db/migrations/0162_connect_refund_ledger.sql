-- DREAMCRM-32.
--
-- `connect_refund`: one row per refunded charge on a clinic's connected
-- account, so a refund on a MEMBERSHIP subscription (which has no row in the
-- three tables recordConnectRefund searches) reaches a record instead of a
-- log line nobody reads.
--
-- `shop_config_stripe_account_idx`: a connected Stripe account belongs to
-- exactly ONE clinic. Connect webhooks name a tenant only by `event.account`,
-- so orgIdForConnectedAccount resolves a TENANT from this column on a money
-- write path with `.limit(1)`; two rows sharing an id would file one clinic's
-- refund in another clinic's records by coin-toss.
--
-- IF THIS INDEX FAILS TO CREATE, DO NOT DROP IT TO GET THE DEPLOY THROUGH.
-- A duplicate here is not a migration problem, it is a live cross-tenant
-- money defect, and the two clinics involved have to be identified by a
-- person before either row is touched:
--   select stripe_account_id, array_agg(organization_id)
--     from shop_config where stripe_account_id is not null
--    group by 1 having count(*) > 1;
-- PARTIAL on purpose: stripe_account_id is null for every clinic that has not
-- connected Stripe, and again after disconnectShopStripe clears it.

CREATE TABLE "connect_refund" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"stripe_payment_intent_id" text NOT NULL,
	"refunded_amount_cents" integer DEFAULT 0 NOT NULL,
	"charge_amount_cents" integer DEFAULT 0 NOT NULL,
	"attached_to" text DEFAULT 'none' NOT NULL,
	"refunded_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "connect_refund" ADD CONSTRAINT "connect_refund_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "connect_refund_intent_idx" ON "connect_refund" USING btree ("organization_id","stripe_payment_intent_id");--> statement-breakpoint
CREATE INDEX "connect_refund_org_attached_idx" ON "connect_refund" USING btree ("organization_id","attached_to","refunded_at");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_config_stripe_account_idx" ON "shop_config" USING btree ("stripe_account_id") WHERE "shop_config"."stripe_account_id" is not null;