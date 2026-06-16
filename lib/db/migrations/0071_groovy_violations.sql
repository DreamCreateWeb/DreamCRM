ALTER TABLE "membership" DROP CONSTRAINT "membership_plan_id_membership_plan_id_fk";
--> statement-breakpoint
ALTER TABLE "analytics_events" DROP CONSTRAINT "analytics_events_organization_id_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_plan_id_membership_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."membership_plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;