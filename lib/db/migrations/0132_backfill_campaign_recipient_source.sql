-- Backfill campaigns.recipient_source from the targeted audience. Rows created
-- before createMarketingCampaign stamped the column fell to the schema default
-- ('customers') even when they targeted a patient audience — which skipped the
-- frequency cap, sent with platform branding, and hid them from the Growth
-- analytics scorecard (analytics.ts filters recipient_source='patients').
-- The audience is who the campaign actually emails, so it is the source of truth.
UPDATE campaigns c
SET recipient_source = a.recipient_source
FROM audiences a
WHERE c.audience_id = a.id
  AND a.recipient_source IN ('customers', 'patients')
  AND c.recipient_source <> a.recipient_source;
