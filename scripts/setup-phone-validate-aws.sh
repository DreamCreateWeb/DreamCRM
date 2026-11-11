#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Turn ON the carrier line check for prospect phone numbers (P-01).
#
# What this does (idempotent — safe to re-run):
#   1. IAM: an inline policy on the App Runner instance role allowing
#      Amazon Pinpoint's PhoneNumberValidate (`mobiletargeting:PhoneNumberValidate`).
#      That one operation is NOT part of the 2026-10-30 Pinpoint end of
#      support (AWS: "APIs related to SMS, voice, mobile push, OTP, and phone
#      number validate are not impacted"), so this keeps working.
#   2. App Runner: sets PHONE_VALIDATE_DRIVER=aws as a runtime environment
#      VARIABLE on the service (not a secret — it is a switch, not a key),
#      merged into the existing map (App Runner replaces the whole map on
#      update, so a naive write would drop every other variable). This
#      triggers a rolling deployment of the same image (~3–5 min).
#
# After the rollout: Platform → Prospecting → Settings shows the phone
# validation pill as ON, and the next enrich tick line-checks every number it
# verifies (about $0.006 a number, capped by budgets.phoneValidatePerMonth,
# default 1,500 — the meter sits beside the Places meter).
#
# Needs: the AWS CLI signed in to account 952078552817 with rights to
# iam:PutRolePolicy on DreamCRMAppRunnerInstanceRole and apprunner:UpdateService.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
ACCOUNT="952078552817"
ROLE="DreamCRMAppRunnerInstanceRole"
POLICY_NAME="DreamCRMPhoneValidate"
SERVICE_NAME="dreamcrm"

echo "==> Preflight"
IDENTITY_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
if [[ "$IDENTITY_ACCOUNT" != "$ACCOUNT" ]]; then
  echo "ERROR: credentials belong to account $IDENTITY_ACCOUNT, expected $ACCOUNT" >&2
  exit 1
fi
echo "    account $ACCOUNT confirmed"

echo "==> IAM: inline policy $POLICY_NAME on $ROLE"
aws iam put-role-policy \
  --role-name "$ROLE" \
  --policy-name "$POLICY_NAME" \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Sid": "ProspectPhoneLineCheck",
        "Effect": "Allow",
        "Action": ["mobiletargeting:PhoneNumberValidate"],
        "Resource": "*"
      }
    ]
  }'
echo "    policy in place"

echo "==> App Runner: PHONE_VALIDATE_DRIVER=aws on service $SERVICE_NAME"
SERVICE_ARN=$(aws apprunner list-services --region "$REGION" \
  --query "ServiceSummaryList[?ServiceName=='$SERVICE_NAME'].ServiceArn | [0]" --output text)
if [[ -z "$SERVICE_ARN" || "$SERVICE_ARN" == "None" ]]; then
  echo "ERROR: App Runner service '$SERVICE_NAME' not found in $REGION" >&2
  exit 1
fi

# A deploy may already be rolling (update-service rejects with
# OPERATION_IN_PROGRESS) — wait for RUNNING, up to ~10 minutes.
STATUS=""
for i in $(seq 1 40); do
  STATUS=$(aws apprunner describe-service --region "$REGION" --service-arn "$SERVICE_ARN" \
    --query Service.Status --output text)
  [[ "$STATUS" == "RUNNING" ]] && break
  echo "    service is $STATUS — waiting (${i}/40)"
  sleep 15
done
if [[ "$STATUS" != "RUNNING" ]]; then
  echo "ERROR: service never reached RUNNING — re-run once the current operation finishes" >&2
  exit 1
fi

WORK=$(mktemp -d)
aws apprunner describe-service --region "$REGION" --service-arn "$SERVICE_ARN" \
  --query Service.SourceConfiguration > "$WORK/source.json"

python3 - "$WORK" <<'PY'
import json, sys
work = sys.argv[1]
with open(f'{work}/source.json') as f:
    src = json.load(f)
img = src['ImageRepository']['ImageConfiguration']
env = img.get('RuntimeEnvironmentVariables') or {}
changed = env.get('PHONE_VALIDATE_DRIVER') != 'aws'
env['PHONE_VALIDATE_DRIVER'] = 'aws'
img['RuntimeEnvironmentVariables'] = env
with open(f'{work}/source-updated.json', 'w') as f:
    json.dump(src, f)
with open(f'{work}/changed', 'w') as f:
    f.write('yes' if changed else 'no')
PY

if [[ "$(cat "$WORK/changed")" == "no" ]]; then
  echo "    PHONE_VALIDATE_DRIVER=aws already set — nothing to deploy"
else
  aws apprunner update-service --region "$REGION" \
    --service-arn "$SERVICE_ARN" \
    --source-configuration "file://$WORK/source-updated.json" >/dev/null
  echo "    service updating (rolling deployment, ~3-5 min)"
fi
rm -rf "$WORK"

echo "==> Done. When the rollout finishes, Platform → Prospecting → Settings shows"
echo "    'Phone validation: on'; the line-check meter counts from the next enrich tick."
