CREATE TABLE "referral_commission" (
	"id" serial PRIMARY KEY NOT NULL,
	"partner_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"stripe_invoice_id" text NOT NULL,
	"invoice_total_cents" integer NOT NULL,
	"percent_bps" integer NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" text DEFAULT 'accrued' NOT NULL,
	"accrued_at" timestamp DEFAULT now() NOT NULL,
	"payout_id" integer,
	CONSTRAINT "referral_commission_stripe_invoice_id_unique" UNIQUE("stripe_invoice_id")
);
--> statement-breakpoint
CREATE TABLE "referral_partner" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"company" text,
	"email" text NOT NULL,
	"status" text DEFAULT 'invited' NOT NULL,
	"default_percent_bps" integer DEFAULT 1000 NOT NULL,
	"default_term_months" integer,
	"terms_note" text,
	"stripe_connect_account_id" text,
	"payouts_enabled" integer DEFAULT 0 NOT NULL,
	"invite_token" text,
	"invite_sent_at" timestamp,
	"user_id" text,
	"is_demo" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "referral_partner_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "referral_payout" (
	"id" serial PRIMARY KEY NOT NULL,
	"partner_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"stripe_transfer_id" text,
	"status" text DEFAULT 'paid' NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN "referral_partner_id" text;--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN "referral_percent_bps" integer;--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN "referral_term_months" integer;--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN "referral_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "referral_commission" ADD CONSTRAINT "referral_commission_partner_id_referral_partner_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."referral_partner"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_commission" ADD CONSTRAINT "referral_commission_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_partner" ADD CONSTRAINT "referral_partner_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_payout" ADD CONSTRAINT "referral_payout_partner_id_referral_partner_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."referral_partner"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- clinic_profile.referral_partner_id → referral_partner (ON DELETE set null).
-- The Drizzle schema keeps this column FK-less to avoid a schema-file import
-- cycle; the constraint lives here so the DB still enforces referential
-- integrity (and a deleted partner detaches clinics rather than cascading).
ALTER TABLE "clinic_profile" ADD CONSTRAINT "clinic_profile_referral_partner_id_referral_partner_id_fk" FOREIGN KEY ("referral_partner_id") REFERENCES "public"."referral_partner"("id") ON DELETE set null ON UPDATE no action;