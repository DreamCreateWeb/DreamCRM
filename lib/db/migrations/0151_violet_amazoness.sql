CREATE TABLE "goal" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"objective" text NOT NULL,
	"service_focus" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by_user_id" text,
	"baseline_new_patients" integer DEFAULT 0 NOT NULL,
	"baseline_at" timestamp DEFAULT now() NOT NULL,
	"is_demo" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "goal" ADD CONSTRAINT "goal_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal" ADD CONSTRAINT "goal_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "goal_org_status_idx" ON "goal" USING btree ("organization_id","status","created_at");