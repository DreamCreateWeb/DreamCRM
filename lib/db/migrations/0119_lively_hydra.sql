CREATE TABLE "prospect_contact" (
	"id" text PRIMARY KEY NOT NULL,
	"prospect_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"role" text DEFAULT 'unknown' NOT NULL,
	"source" text DEFAULT 'crawl_mailto' NOT NULL,
	"verify_status" text DEFAULT 'unknown' NOT NULL,
	"verify_reason" text,
	"verified_at" timestamp with time zone,
	"rank" integer DEFAULT 0 NOT NULL,
	"is_primary" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "prospect_contact" ADD CONSTRAINT "prospect_contact_prospect_id_prospect_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospect"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_pcon_prospect_email" ON "prospect_contact" USING btree ("prospect_id","email");--> statement-breakpoint
CREATE INDEX "idx_pcon_prospect" ON "prospect_contact" USING btree ("prospect_id");