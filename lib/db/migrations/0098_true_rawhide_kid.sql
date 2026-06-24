CREATE INDEX "audiences_org_idx" ON "audiences" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "campaign_events_campaign_occurred_idx" ON "campaign_events" USING btree ("campaign_id","occurred_at");--> statement-breakpoint
CREATE INDEX "campaigns_org_status_idx" ON "campaigns" USING btree ("organization_id","status");