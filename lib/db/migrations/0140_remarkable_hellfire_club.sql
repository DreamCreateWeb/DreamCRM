CREATE TABLE "platform_config" (
	"id" text PRIMARY KEY NOT NULL,
	"config" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
