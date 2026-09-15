-- DREAMCRM-32 — `connect_refund`.
--
-- One row per refunded charge on a clinic's connected Stripe account, so a
-- refund on a MEMBERSHIP subscription (which has a row in none of the three
-- tables `recordConnectRefund` searches — the `membership` row tracks the
-- subscription, not its charges) reaches a record instead of a log line
-- nobody reads. `attached_to = 'none'` is that record, and the clinic sees it
-- under Payments -> Online as "Refunds we couldn't match".
--
-- NO PRODUCTION PRECONDITION. This creates a new table and its own indexes;
-- there is no existing data it can conflict with, so it applies cleanly on
-- any state of the database.
--
-- The unique index on `shop_config.stripe_account_id` was SPLIT OUT of this
-- migration (DREAMCRM-45 planning decision, 2026-09-15) and parked at
-- `lib/db/migrations/parked/one-stripe-account-per-clinic.sql`. It is the one
-- statement here that could fail against real data, and a failed migration is
-- silently skipped on this deploy path — taking every later migration with
-- it. Everything above had no reason to wait for it.

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
CREATE INDEX "connect_refund_org_attached_idx" ON "connect_refund" USING btree ("organization_id","attached_to","refunded_at");