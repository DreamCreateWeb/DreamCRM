#!/usr/bin/env bash
set -euo pipefail
# ─────────────────────────────────────────────────────────────────────────────
# setup-serper.sh — wire the grader's search-visibility axis to Serper
# (docs/marketing-engine.md, slice 2 v2).
#
# What it does (idempotent — safe to re-run, also how you ROTATE the key):
#   1. Adds/updates SERPER_API_KEY in Secrets Manager dreamcrm/app-secrets.
#   2. Maps it into the App Runner service's RuntimeEnvironmentSecrets,
#      MERGING into the live source configuration (update-service replaces
#      the whole map, so a naive write would drop every other secret).
#      The update triggers a rolling deployment of the same image (~3-5 min);
#      the grader's search axis starts rendering on the first run after.
#
# Usage (e.g. AWS CloudShell, or anywhere with account creds):
#   SERPER_API_KEY_VALUE=<key> bash scripts/setup-serper.sh
# ─────────────────────────────────────────────────────────────────────────────

REGION="${AWS_REGION:-us-east-1}"
ACCOUNT="952078552817"
SECRET_ID="dreamcrm/app-secrets"
SERVICE_NAME="dreamcrm"

if [[ -z "${SERPER_API_KEY_VALUE:-}" ]]; then
  echo "ERROR: set SERPER_API_KEY_VALUE=<your serper.dev key> and re-run" >&2
  exit 1
fi

echo "==> Preflight"
IDENTITY_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
if [[ "$IDENTITY_ACCOUNT" != "$ACCOUNT" ]]; then
  echo "ERROR: credentials belong to account $IDENTITY_ACCOUNT, expected $ACCOUNT" >&2
  exit 1
fi
echo "    account $ACCOUNT, region $REGION"

echo "==> Serper: validating the key with one live query"
HTTP=$(curl -sS -o /tmp/serper-probe.json -w "%{http_code}" --max-time 15 \
  -X POST https://google.serper.dev/search \
  -H "X-API-KEY: $SERPER_API_KEY_VALUE" -H 'content-type: application/json' \
  -d '{"q":"dentist","num":1,"gl":"us"}')
if [[ "$HTTP" != "200" ]]; then
  echo "ERROR: Serper answered HTTP $HTTP — check the key before storing it" >&2
  exit 1
fi
echo "    key works"

echo "==> Secrets Manager: SERPER_API_KEY in $SECRET_ID"
CURRENT=$(aws secretsmanager get-secret-value --secret-id "$SECRET_ID" --query SecretString --output text)
UPDATED=$(echo "$CURRENT" | python3 -c "
import json, sys, os
d = json.load(sys.stdin)
d['SERPER_API_KEY'] = os.environ['SERPER_API_KEY_VALUE']
print(json.dumps(d))
")
aws secretsmanager put-secret-value --secret-id "$SECRET_ID" --secret-string "$UPDATED" >/dev/null
echo "    stored (not printed)"
SECRET_ARN=$(aws secretsmanager describe-secret --secret-id "$SECRET_ID" --query ARN --output text)

echo "==> App Runner: SERPER_API_KEY on service $SERVICE_NAME"
SERVICE_ARN=$(aws apprunner list-services --region "$REGION" \
  --query "ServiceSummaryList[?ServiceName=='$SERVICE_NAME'].ServiceArn | [0]" --output text)
if [[ -z "$SERVICE_ARN" || "$SERVICE_ARN" == "None" ]]; then
  echo "ERROR: App Runner service '$SERVICE_NAME' not found in $REGION" >&2
  exit 1
fi

aws apprunner describe-service --region "$REGION" --service-arn "$SERVICE_ARN" \
  --query Service.SourceConfiguration > /tmp/apprunner-source.json

python3 - "$SECRET_ARN" <<'PY'
import json, sys

secret_arn = sys.argv[1]
with open('/tmp/apprunner-source.json') as f:
    src = json.load(f)

img = src['ImageRepository']['ImageConfiguration']
sec = img.get('RuntimeEnvironmentSecrets') or {}

want_ref = f'{secret_arn}:SERPER_API_KEY::'
changed = sec.get('SERPER_API_KEY') != want_ref
sec['SERPER_API_KEY'] = want_ref
img['RuntimeEnvironmentSecrets'] = sec

with open('/tmp/apprunner-source-updated.json', 'w') as f:
    json.dump(src, f)
with open('/tmp/apprunner-changed', 'w') as f:
    f.write('yes' if changed else 'no')
PY

if [[ "$(cat /tmp/apprunner-changed)" == "no" ]]; then
  echo "    mapping already in place — a rolling deploy still picks up a ROTATED value"
  aws apprunner start-deployment --region "$REGION" --service-arn "$SERVICE_ARN" >/dev/null
  echo "    deployment started (~3-5 min)"
else
  aws apprunner update-service --region "$REGION" \
    --service-arn "$SERVICE_ARN" \
    --source-configuration file:///tmp/apprunner-source-updated.json >/dev/null
  echo "    service updating (rolling deployment, ~3-5 min)"
fi

echo "==> Done. When the rollout finishes, run a grade WITH a city filled in —"
echo "    the 'Your search visibility' section appears on the report."
