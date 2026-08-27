CREATE TABLE "practice_grade" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"email" text NOT NULL,
	"practice_name" text NOT NULL,
	"city" text,
	"state" text,
	"website_url" text,
	"place_id" text,
	"result" jsonb NOT NULL,
	"prospect_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "practice_grade" ADD CONSTRAINT "practice_grade_prospect_id_prospect_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospect"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_pgrd_token" ON "practice_grade" USING btree ("token");--> statement-breakpoint
CREATE INDEX "idx_pgrd_email" ON "practice_grade" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_pgrd_created" ON "practice_grade" USING btree ("created_at");