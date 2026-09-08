CREATE TABLE "marketing_spend" (
	"id" serial PRIMARY KEY NOT NULL,
	"month" text NOT NULL,
	"channel" text NOT NULL,
	"amount_cents" integer DEFAULT 0 NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "marketing_spend_month_channel_idx" ON "marketing_spend" USING btree ("month","channel");