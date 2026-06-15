#!/usr/bin/env bash
#
# setup-cron-schedules.sh — idempotently ensure the EventBridge schedule rules
# that drive DreamCRM's cron routes (the app runs on AWS App Runner, so the dead
# vercel.json crons do nothing; EventBridge API-destination rules POST to
# /api/cron/* with `Authorization: Bearer $CRON_SECRET`).
#
# WHO RUNS THIS: the orchestrator / an operator with platform AWS creds
# (us-east-1). Run it once after this PR merges + deploys; re-running is safe
# (create-if-missing, update-if-different).
#
# HOW THE TWO PRE-EXISTING RULES WERE MADE (for reference — this script mirrors
# the same shape for the four it manages):
#   1. A shared EventBridge *connection* `dreamcrm-cron` was created once,
#      carrying the API-key auth header (Authorization: Bearer <CRON_SECRET>):
#        aws events create-connection \
#          --name dreamcrm-cron \
#          --authorization-type API_KEY \
#          --auth-parameters '{"ApiKeyAuthParameters":{"ApiKeyName":"Authorization","ApiKeyValue":"Bearer <CRON_SECRET>"}}'
#      (Rotate CRON_SECRET => `aws events update-connection` with the new value.)
#   2. For gmail-watch-renew + publish-scheduled-posts, an *API destination*
#      (the URL + POST + connection) and a *rule* (the schedule) + *target*
#      (rule -> API destination, using the invoke role) were created — exactly
#      what create_one() below does. This script does NOT recreate the
#      connection; it looks it up and reuses its ARN.
#
# REQUIREMENTS:
#   - aws CLI v2, authed to account 952078552817, region us-east-1.
#   - The connection `dreamcrm-cron` already exists (carries the Bearer header).
#   - The invoke role `DreamCRMEventBridgeCron` already exists.
#
set -euo pipefail

REGION="us-east-1"
ACCOUNT_ID="952078552817"
CONNECTION_NAME="dreamcrm-cron"
ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/DreamCRMEventBridgeCron"
BASE_URL="https://www.dreamcreatestudio.com"

# name | route (under /api/cron/) | schedule-expression
# Cadences:
#   auto-send-reviews        hourly   — per-appointment idempotent
#   pms-sync                 hourly   — 15-min concurrency guard makes overlap safe
#   send-reminders           30 min   — idempotent per appointment within its window
#   send-scheduled-campaigns 15 min   — atomic claim prevents double-send
#   customize-services       hourly   — durable net for the Welcome Interview's
#                                       fire-and-forget per-service AI rewrites;
#                                       idempotent (skips services with a blob)
#   sync-google-reviews      hourly   — Zernio: pull Google + Facebook reviews
#                                       (idempotent upsert by org+platform+id;
#                                       demo connections never network)
#   sync-gbp                 hourly   — Zernio: pull GBP hours/address/phone/
#                                       photos (NON-force, so it respects any
#                                       manual *_source edits; demo never networks)
JOBS=(
  "auto-send-reviews|auto-send-reviews|rate(1 hour)"
  "pms-sync|pms-sync|rate(1 hour)"
  "send-reminders|send-reminders|rate(30 minutes)"
  "send-scheduled-campaigns|send-scheduled-campaigns|rate(15 minutes)"
  "customize-services|customize-services|rate(1 hour)"
  "sync-google-reviews|sync-google-reviews|rate(1 hour)"
  "sync-gbp|sync-gbp|rate(1 hour)"
)

echo "==> DreamCRM cron schedules (region ${REGION})"

# Look up (do NOT create) the shared connection ARN.
CONNECTION_ARN="$(aws events describe-connection \
  --region "$REGION" \
  --name "$CONNECTION_NAME" \
  --query 'ConnectionArn' --output text 2>/dev/null || true)"

if [[ -z "$CONNECTION_ARN" || "$CONNECTION_ARN" == "None" ]]; then
  echo "ERROR: connection '${CONNECTION_NAME}' not found in ${REGION}." >&2
  echo "       Create it first (see the header of this script), then re-run." >&2
  exit 1
fi
echo "    connection: ${CONNECTION_ARN}"

# Ensure one job: API destination + rule + target. Idempotent throughout.
create_one() {
  local name="$1" route="$2" schedule="$3"
  local dest_name="dreamcrm-${name}"
  local rule_name="dreamcrm-${name}"
  local endpoint="${BASE_URL}/api/cron/${route}"

  echo "==> ${name}"

  # ---- API destination (create-if-missing, update-if-different) ----
  local existing_endpoint existing_method existing_conn
  existing_endpoint="$(aws events describe-api-destination --region "$REGION" --name "$dest_name" \
    --query 'InvocationEndpoint' --output text 2>/dev/null || true)"

  if [[ -z "$existing_endpoint" || "$existing_endpoint" == "None" ]]; then
    aws events create-api-destination \
      --region "$REGION" \
      --name "$dest_name" \
      --connection-arn "$CONNECTION_ARN" \
      --invocation-endpoint "$endpoint" \
      --http-method POST \
      --invocation-rate-limit-per-second 10 >/dev/null
    echo "    api-destination: created (${endpoint})"
  else
    existing_method="$(aws events describe-api-destination --region "$REGION" --name "$dest_name" \
      --query 'HttpMethod' --output text 2>/dev/null || true)"
    existing_conn="$(aws events describe-api-destination --region "$REGION" --name "$dest_name" \
      --query 'ConnectionArn' --output text 2>/dev/null || true)"
    if [[ "$existing_endpoint" != "$endpoint" || "$existing_method" != "POST" || "$existing_conn" != "$CONNECTION_ARN" ]]; then
      aws events update-api-destination \
        --region "$REGION" \
        --name "$dest_name" \
        --connection-arn "$CONNECTION_ARN" \
        --invocation-endpoint "$endpoint" \
        --http-method POST >/dev/null
      echo "    api-destination: updated (${endpoint})"
    else
      echo "    api-destination: up to date"
    fi
  fi

  local dest_arn
  dest_arn="$(aws events describe-api-destination --region "$REGION" --name "$dest_name" \
    --query 'ApiDestinationArn' --output text)"

  # ---- Rule (put-rule is itself create-or-update / idempotent) ----
  local existing_schedule
  existing_schedule="$(aws events describe-rule --region "$REGION" --name "$rule_name" \
    --query 'ScheduleExpression' --output text 2>/dev/null || true)"
  if [[ "$existing_schedule" == "$schedule" ]]; then
    echo "    rule: up to date (${schedule})"
  else
    aws events put-rule \
      --region "$REGION" \
      --name "$rule_name" \
      --schedule-expression "$schedule" \
      --state ENABLED \
      --description "DreamCRM cron: POST /api/cron/${route}" >/dev/null
    echo "    rule: set (${schedule})"
  fi

  # ---- Target (put-targets is idempotent on target Id) ----
  # The route reads CRON_SECRET from the connection's auth header; no event
  # payload is needed (Input must be a JSON *string* when provided, so we send
  # an empty-object string). A static Id keeps re-runs from stacking
  # duplicate targets.
  aws events put-targets \
    --region "$REGION" \
    --rule "$rule_name" \
    --targets "[{\"Id\":\"${rule_name}-target\",\"Arn\":\"${dest_arn}\",\"RoleArn\":\"${ROLE_ARN}\",\"Input\":\"{}\"}]" >/dev/null
  echo "    target: linked rule -> api-destination"
}

for job in "${JOBS[@]}"; do
  IFS='|' read -r name route schedule <<<"$job"
  create_one "$name" "$route" "$schedule"
done

echo ""
echo "==> Done. Rules in place:"
for job in "${JOBS[@]}"; do
  IFS='|' read -r name _route schedule <<<"$job"
  printf '    %-32s %s\n' "dreamcrm-${name}" "$schedule"
done
echo ""
echo "Note: /api/cron/* is already in the middleware public-path allowlist, so"
echo "these POSTs reach the route (auth is the Bearer token, not a session)."
