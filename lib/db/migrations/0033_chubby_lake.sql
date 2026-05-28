CREATE TABLE "pms_connection" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"connected_by_user_id" text,
	"provider" text NOT NULL,
	"status" text DEFAULT 'not_connected' NOT NULL,
	"customer_key_encrypted" text,
	"sync_direction" text DEFAULT 'two_way' NOT NULL,
	"auto_sync_enabled" integer DEFAULT 1 NOT NULL,
	"last_sync_at" timestamp,
	"last_sync_status" text,
	"last_error" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pms_entity_map" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"external_id" text NOT NULL,
	"internal_id" text NOT NULL,
	"origin" text DEFAULT 'pms' NOT NULL,
	"content_hash" text,
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pms_sync_run" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"trigger" text DEFAULT 'manual' NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"triggered_by_user_id" text
);
--> statement-breakpoint
CREATE TABLE "pms_write_op" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"internal_id" text NOT NULL,
	"external_id" text,
	"operation" text DEFAULT 'create' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"request_payload" jsonb,
	"response_body" jsonb,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "patient" ADD COLUMN "pms_balance_cents" integer;--> statement-breakpoint
ALTER TABLE "patient" ADD COLUMN "pms_balance_updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "pms_connection" ADD CONSTRAINT "pms_connection_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pms_connection" ADD CONSTRAINT "pms_connection_connected_by_user_id_user_id_fk" FOREIGN KEY ("connected_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pms_entity_map" ADD CONSTRAINT "pms_entity_map_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pms_sync_run" ADD CONSTRAINT "pms_sync_run_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pms_sync_run" ADD CONSTRAINT "pms_sync_run_triggered_by_user_id_user_id_fk" FOREIGN KEY ("triggered_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pms_write_op" ADD CONSTRAINT "pms_write_op_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pms_entity_map_external_idx" ON "pms_entity_map" USING btree ("organization_id","entity_type","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pms_entity_map_internal_idx" ON "pms_entity_map" USING btree ("organization_id","entity_type","internal_id");--> statement-breakpoint
CREATE INDEX "pms_entity_map_org_type_idx" ON "pms_entity_map" USING btree ("organization_id","entity_type");--> statement-breakpoint
CREATE INDEX "pms_sync_run_org_started_idx" ON "pms_sync_run" USING btree ("organization_id","started_at");--> statement-breakpoint
CREATE INDEX "pms_write_op_org_status_idx" ON "pms_write_op" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "pms_write_op_org_created_idx" ON "pms_write_op" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "pms_write_op_internal_idx" ON "pms_write_op" USING btree ("organization_id","entity_type","internal_id");