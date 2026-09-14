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
-- PARTIAL on purpose: stripe_account_id is null for every clinic that has not
-- connected Stripe, and again after disconnectShopStripe clears it, so a plain
-- unique index would be satisfied by those nulls and say nothing.
--
-- ============ IF THIS INDEX FAILS TO CREATE, NOTHING STOPS ================
--
-- Do not read a failure here as "the deploy halted safely". It does not halt.
-- Dockerfile:62 starts the server first and runs the migrator as
-- `(db-migrate && resync-demo) || true`; App Runner has already marked the
-- container healthy, scripts/db-migrate.mjs retries ~90s and exits 1 into that
-- `|| true`, /api/admin/migrate returns a 500 nobody alarms on, and
-- .github/workflows/deploy.yml has no migration step at all. So on a duplicate
-- the deploy goes GREEN, the new code ships, and this file is silently skipped
-- — and skipped again on every boot after.
--
-- Two consequences, both invisible:
--   * `connect_refund` above is never created, so every membership refund
--     falls into the console.warn in recordRefundReceipt — the exact defect
--     this migration exists to close, now failing in production with a green
--     tick beside it;
--   * drizzle applies migrations IN ORDER, so every later migration is
--     blocked behind this one for as long as the duplicate exists.
--
-- The fix is never to drop the index to get a deploy through. A duplicate is
-- not a migration problem — it is a live cross-tenant money defect, and the
-- two clinics have to be identified by a person before either row is touched:
--
--   select stripe_account_id, array_agg(organization_id)
--     from shop_config where stripe_account_id is not null
--    group by 1 having count(*) > 1;
--
-- This query must come back EMPTY against production before this migration
-- merges. It is a pre-merge check precisely because the post-merge one does
-- not exist (see above).
-- =========================================================================

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