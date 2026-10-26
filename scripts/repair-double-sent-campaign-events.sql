-- One-off data repair: the Resend webhook used to mint a SECOND 'sent'
-- campaign_events row for every campaign email (`email.sent`), beside the
-- send-time row lib/services/marketing-send.ts already writes. Fixed in code
-- on 2026-10-26 (the webhook now ignores `email.sent` for campaigns); this
-- heals the history so funnels, open rates and the frequency cap's trailing
-- 7-day read stop reading 2×.
--
-- The two rows are told apart by their meta: the send-time row carries
-- `{"channel": "resend"}` (or "gmail"/"sms"); the webhook row carries
-- `{"resendEmailId": ...}` and never a `channel` key. Prospect outreach rows
-- live in outreach_event and are untouched. Org-agnostic by design (the
-- duplicate existed for every org); touches campaign_events only — never a
-- patient row, never money.
--
-- Run the SELECT first and read the count; then, and only then, the DELETE.

-- 1. How many webhook-minted 'sent' rows exist, and for how many campaigns.
SELECT count(*) AS webhook_sent_rows, count(DISTINCT campaign_id) AS campaigns
FROM campaign_events
WHERE type = 'sent'
  AND meta ? 'resendEmailId'
  AND NOT (meta ? 'channel');

-- 2. The repair. Wrapped in a transaction so a surprising count can be rolled
--    back; COMMIT only when the deleted count matches step 1.
-- BEGIN;
-- DELETE FROM campaign_events
-- WHERE type = 'sent'
--   AND meta ? 'resendEmailId'
--   AND NOT (meta ? 'channel');
-- COMMIT;
