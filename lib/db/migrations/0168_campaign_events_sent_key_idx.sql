-- The frequency cap's read path (R1·S5 ledger entry, 2026-08-17; fixed 2026-10-05).
--
-- `partitionByFrequencyCap` / `partitionByPriorAutomationSend`
-- (lib/services/marketing-frequency.ts) ask "how many 'sent' rows does THIS
-- PERSON have in the window", keyed by patient_id OR recipient_email, joined to
-- campaigns for the org. Every index on campaign_events was campaign_id-leading
-- (0010, 0021, 0098, 0145's provider-message lookup), so that read scanned the
-- table on every campaign send and every automation pass.
--
-- Two PARTIAL indexes on `type = 'sent'`, the only type the cap counts. Two,
-- not one: the predicate is an OR across the two keys, and Postgres can only
-- BitmapOr it when BOTH arms have an index — a patient-only index would have
-- left the planner on the same sequential scan.
--
-- NO PRODUCTION PRECONDITION. Plain (non-unique) indexes over existing columns;
-- they cannot fail on existing data.
--
-- LOCK NOTE (deploy path): `CREATE INDEX` without CONCURRENTLY takes a SHARE
-- lock and blocks WRITES to `campaign_events` while it builds. Drizzle applies a
-- boot's migrations in one transaction, which rules CONCURRENTLY out. Each build
-- scans the table once; on today's row counts that is well under a second, on a
-- container App Runner has already marked healthy.

CREATE INDEX "campaign_events_sent_patient_idx" ON "campaign_events" USING btree ("patient_id","occurred_at") WHERE "campaign_events"."type" = 'sent';--> statement-breakpoint
CREATE INDEX "campaign_events_sent_email_idx" ON "campaign_events" USING btree ("recipient_email","occurred_at") WHERE "campaign_events"."type" = 'sent';