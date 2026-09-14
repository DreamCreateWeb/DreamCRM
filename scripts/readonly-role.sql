-- ============================================================================
-- dreamcrm_readonly — the SELECT-only role behind /api/admin/read-check.
--
-- WHO RUNS THIS: the owner (or an operator with a psql path to the production
-- database), ONCE, by hand. Run it from inside the VPC the same way any other
-- production database work happens. docs/PROD-READ-ACCESS.md is the runbook.
--
-- THIS FILE IS NOT A MIGRATION AND MUST NEVER BECOME ONE. Migrations apply on
-- boot via Dockerfile:62 — `(node scripts/db-migrate.mjs && node
-- scripts/resync-demo.mjs) || true` — which swallows the exit code. A silently
-- skipped GRANT would leave DATABASE_URL_READONLY pointing at a role that does
-- not exist; the route fails closed with a 503, which is safe and completely
-- invisible. Worse, running privilege changes through the one path already
-- known to hide its own failures (RELEASE.md Part 5, entry S2) is how the next
-- person learns that the script "applied cleanly" and protected nothing.
--
-- EDITING THIS FILE DOES NOT CHANGE PRODUCTION. Read that twice. CI can go
-- green on a correct REVOKE that nobody ever ran. After any edit here: run the
-- statement against production, then dispatch the `readonly-role-privileges`
-- check and confirm it returns ZERO ROWS. That check is scheduled daily for
-- exactly this reason.
-- ============================================================================

-- 1. The role. Generate the password with a CSPRNG, somewhere it will not be
--    captured: `openssl rand -base64 32`. Do not paste it into a shell whose
--    history is on, and do not commit it.
CREATE ROLE dreamcrm_readonly LOGIN PASSWORD '<<<REPLACE: openssl rand -base64 32>>>';

REVOKE ALL     ON DATABASE :"dbname" FROM dreamcrm_readonly;
GRANT  CONNECT ON DATABASE :"dbname" TO   dreamcrm_readonly;
GRANT  USAGE   ON SCHEMA   public    TO   dreamcrm_readonly;

-- 2. Cost bounds. A catalog entry is reviewed for what it RETURNS, not for what
--    it COSTS, and these run against the production primary.
--
--    Honest about what these are: all three are USERSET GUCs, so any session
--    connecting as this role can SET them back. They bound a careless catalog
--    entry — the case that will actually happen — and they do NOT bound someone
--    holding the password. The real write protection is the one below it:
--    INSERT/UPDATE/DELETE are never granted at all, and that cannot be unset.
ALTER ROLE dreamcrm_readonly SET statement_timeout                   = '30s';
ALTER ROLE dreamcrm_readonly SET idle_in_transaction_session_timeout = '60s';
ALTER ROLE dreamcrm_readonly SET default_transaction_read_only       = on;

-- 3. Read on everything...
GRANT SELECT ON ALL TABLES IN SCHEMA public TO dreamcrm_readonly;

-- NOTE: there is deliberately NO `ALTER DEFAULT PRIVILEGES` here.
-- It would auto-grant SELECT on every future table, which reads like
-- convenience and behaves like a trapdoor: a credential-bearing table added
-- six months from now would be readable in production the moment it booted,
-- while the guard test passed and this file still said it was revoked. Without
-- it, a new table is simply ungranted — a check that needs one gets a single
-- GRANT, reviewed, at the time. Wrong should error, not leak.

-- 4. ...except the tables that hold credentials. WHOLE-TABLE revoke, which is
--    the only form that works: in PostgreSQL a table-level privilege covers
--    every column, and a column-level REVOKE cannot subtract from it. The
--    column-level system only ADDS where no table-level grant exists. So
--    `GRANT SELECT ON ALL TABLES` followed by
--    `REVOKE SELECT (confirm_token) ON appointment` leaves confirm_token
--    readable — that was the defect caught in review before this shipped.
--
--    DEFAULT-CLOSED. These 19 tables are entirely unreadable. When a catalog
--    entry genuinely needs columns from one, add a narrow
--    `GRANT SELECT (col, ...) ON <table> TO dreamcrm_readonly;` below, in the
--    same PR as the entry, where the review gate will see it. Getting such an
--    enumeration wrong then produces a permission ERROR, not a leaked token.
--    As of this writing the catalog needs none: its only table is shop_config.
--
--    Keep this list in step with CREDENTIAL_COLUMNS in lib/read-checks.ts —
--    the guard test fails if they disagree, on purpose. They are two lists
--    because they catch different things: this one changes production, that one
--    notices when production and this file have drifted apart.
REVOKE SELECT ON
  account,                      -- password hash, OAuth access/refresh/id tokens
  session,                      -- live session tokens
  verification,                 -- `value` = password-reset / email-verify material
  gsc_connection,               -- encrypted refresh token + access token
  email_account,                -- encrypted refresh token + access token
  pms_connection,               -- Open Dental customer key (encrypted at rest)
  appointment,                  -- confirm_token
  appointment_waitlist_offer,   -- token
  review_request,               -- token
  clinic_profile,               -- calendar_feed_token (the .ics feed IS the auth)
  referral_partner,             -- invite_token
  balance_payment_request,      -- token: the /b pay-my-balance landing (money)
  payment_plan,                 -- token: the /i landing, accepts and saves a card (money)
  nps_response,                 -- token: the /n survey landing
  patient_referral_link,        -- token
  prospect_meeting,             -- token: the /d demo self-booking landing
  practice_grade,               -- token: the practice-grader report
  marketing_event,              -- capture_token
  event_capture                 -- token
FROM dreamcrm_readonly;

-- 5. ACCEPTANCE TEST — do not believe any of the above until you have run it.
--    A script that appears to have applied cleanly and has silently protected
--    nothing is exactly the failure this catches.
--
--    The test is catalog entry `readonly-role-privileges`, and it is NOT
--    restated here on purpose: a third copy of the credential list would be a
--    third thing to keep in step, and the one most likely to rot unnoticed
--    (same reasoning as the docs/E2E.md axe-count guard). Run it the way every
--    later run of it will happen — dispatch it:
--
--      gh workflow run read-check.yml \
--        -f check=readonly-role-privileges \
--        -f reason='DREAMCRM-42 role setup verification'
--
--    It must report ZERO ROWS. Any row names a credential column this role can
--    still read. It is also scheduled daily, so drift after today surfaces on
--    its own. Full sequence: docs/PROD-READ-ACCESS.md.
