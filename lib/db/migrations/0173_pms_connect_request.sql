-- The First Week (docs/ACTIVATION.md S4) — `pms_connect_request`: the
-- self-serve PMS connect request. A clinic cannot bind the NexHealth bridge
-- itself (the install is platform-side), but it can ASK in one form — which
-- system, the practice name as that system knows it, who to talk to, when.
-- One row per clinic (unique index); a re-submit updates it. `status` is the
-- platform's answer (requested → scheduled → connected / closed). The request
-- also lands in the clinic's support thread, so the owner hears it where they
-- already listen. Catalog-only: a new empty table.

CREATE TABLE "pms_connect_request" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"vendor" text NOT NULL,
	"vendor_name" text,
	"practice_name_in_pms" text,
	"contact_name" text NOT NULL,
	"contact_email" text NOT NULL,
	"contact_phone" text,
	"best_time" text,
	"notes" text,
	"status" text DEFAULT 'requested' NOT NULL,
	"requested_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pms_connect_request" ADD CONSTRAINT "pms_connect_request_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pms_connect_request" ADD CONSTRAINT "pms_connect_request_requested_by_user_id_user_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pms_connect_request_org_uq" ON "pms_connect_request" USING btree ("organization_id");