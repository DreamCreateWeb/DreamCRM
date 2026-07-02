ALTER TABLE "patient" ADD COLUMN "is_demo_persona" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "zernio_connection" ADD COLUMN "preferred_gbp_account_id" text;--> statement-breakpoint
ALTER TABLE "notification_prefs" DROP COLUMN "push_everything";