CREATE TABLE "stripe_webhook_event" (
	"event_id" text PRIMARY KEY NOT NULL,
	"event_type" text,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
