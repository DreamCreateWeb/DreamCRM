ALTER TABLE "appointment_reminder_log" ADD COLUMN "provider_message_id" text;--> statement-breakpoint
ALTER TABLE "campaign_events" ADD COLUMN "provider_message_id" text;--> statement-breakpoint
CREATE INDEX "appt_reminder_provider_msg_idx" ON "appointment_reminder_log" USING btree ("provider_message_id");--> statement-breakpoint
CREATE INDEX "campaign_events_provider_msg_idx" ON "campaign_events" USING btree ("provider_message_id");