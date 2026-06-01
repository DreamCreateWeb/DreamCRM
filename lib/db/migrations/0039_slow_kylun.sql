CREATE TABLE "service_library" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT 'core' NOT NULL,
	"icon" text,
	"short_description" text,
	"hero_bullets" jsonb,
	"body" text,
	"process_steps" jsonb,
	"faq" jsonb,
	"related_slugs" jsonb,
	"origin" text DEFAULT 'platform' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "service_library_slug_unique" UNIQUE("slug")
);
