CREATE TABLE "metric_snapshot" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" text,
	"metric" text NOT NULL,
	"bucket" text NOT NULL,
	"granularity" text NOT NULL,
	"value" numeric(20, 2) NOT NULL,
	"detail" jsonb,
	"captured_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "metric_snapshot" ADD CONSTRAINT "metric_snapshot_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "metric_snapshot_org_uq" ON "metric_snapshot" USING btree ("organization_id","metric","bucket","granularity");--> statement-breakpoint
CREATE UNIQUE INDEX "metric_snapshot_platform_uq" ON "metric_snapshot" USING btree ("metric","bucket","granularity") WHERE "metric_snapshot"."organization_id" IS NULL;--> statement-breakpoint
CREATE INDEX "metric_snapshot_org_metric_bucket_idx" ON "metric_snapshot" USING btree ("organization_id","metric","bucket" DESC NULLS LAST);