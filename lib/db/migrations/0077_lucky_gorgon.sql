CREATE TABLE "patient_tag" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT 'gray' NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patient_tag_assignment" (
	"patient_id" text NOT NULL,
	"tag_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"assigned_by" text,
	"assigned_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "patient_tag_assignment_patient_id_tag_id_pk" PRIMARY KEY("patient_id","tag_id")
);
--> statement-breakpoint
ALTER TABLE "patient_tag" ADD CONSTRAINT "patient_tag_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_tag" ADD CONSTRAINT "patient_tag_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_tag_assignment" ADD CONSTRAINT "patient_tag_assignment_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_tag_assignment" ADD CONSTRAINT "patient_tag_assignment_tag_id_patient_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."patient_tag"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_tag_assignment" ADD CONSTRAINT "patient_tag_assignment_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_tag_assignment" ADD CONSTRAINT "patient_tag_assignment_assigned_by_user_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "patient_tag_org_name_idx" ON "patient_tag" USING btree ("organization_id",lower("name"));--> statement-breakpoint
CREATE INDEX "patient_tag_assignment_tag_idx" ON "patient_tag_assignment" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "patient_tag_assignment_org_idx" ON "patient_tag_assignment" USING btree ("organization_id");