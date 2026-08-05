#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# SMS (AWS End User Messaging) — one-time AWS-side setup, Phase 5 limb 3.
#
# Idempotent, like setup-cron-schedules.sh: safe to re-run; every step checks
# before it changes. Run with credentials that can touch IAM, Secrets Manager
# and App Runner in account 952078552817 (the dreamcrm IAM user works).
#
# What it does, in order:
#   1. Preflight — verifies the credentials and the account.
#   2. IAM      — inline policy DreamCRMSmsVoice on the App Runner instance
#                 role: the registration machine's actions, the send action,
#                 and nothing else (least privilege; ReleasePhoneNumber is
#                 deliberately absent — nothing in the app releases numbers).
#   3. Secrets  — adds SMS_WEBHOOK_SECRET to dreamcrm/app-secrets if absent
#                 (generated here, never printed).
#   4. DLR pipe — the delivery-receipt pipeline, number-independent: SNS
#                 topic dreamcrm-sms-events (policy lets sms-voice publish),
#                 configuration set dreamcrm-sms with a TEXT_ALL event
#                 destination pointing at it, and an HTTPS subscription to
#                 the webhook. NOTE: the subscription only CONFIRMS once the
#                 webhook route is deployed (merged to main) — until then it
#                 sits pending (pending subscriptions expire after ~3 days;
#                 re-running this script re-subscribes, it is idempotent).
#   5. Service  — adds SMS_DRIVER=aws + SMS_CONFIGURATION_SET (plain env
#                 vars) and SMS_WEBHOOK_SECRET (runtime secret ref) to the
#                 App Runner service, MERGED into the existing maps — App
#                 Runner replaces the whole map on update, so a naive write
#                 would drop every other variable. This triggers a rolling
#                 deployment of the same image.
#
# What it deliberately does NOT do: the two-way (inbound) SNS wiring. That
# needs a provisioned phone number, which only exists after the first
# clinic's registration is approved. When it is, run the block printed at
# the end.
# ─────────────────────────────────────────────────────────────────────────────

REGION="${AWS_REGION:-us-east-1}"
ACCOUNT="952078552817"
ROLE="DreamCRMAppRunnerInstanceRole"
POLICY_NAME="DreamCRMSmsVoice"
SECRET_ID="dreamcrm/app-secrets"
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
        "Sid": "SmsRegistrationMachine",
        "Effect": "Allow",
        "Action": [
          "sms-voice:CreateRegistration",
          "sms-voice:PutRegistrationFieldValue",
          "sms-voice:SubmitRegistrationVersion",
          "sms-voice:CreateRegistrationAssociation",
          "sms-voice:DescribeRegistrations",
          "sms-voice:DescribeRegistrationVersions",
          "sms-voice:DescribeRegistrationTypeDefinitions",
          "sms-voice:DescribeRegistrationFieldDefinitions",
          "sms-voice:DescribeRegistrationFieldValues",
          "sms-voice:RequestPhoneNumber",
          "sms-voice:DescribePhoneNumbers",
          "sms-voice:SendTextMessage",
          "sms-voice:TagResource"
        ],
        "Resource": "*"
      }
    ]
  }' >/dev/null
echo "    policy in place"

echo "==> Secrets Manager: SMS_WEBHOOK_SECRET in $SECRET_ID"
CURRENT=$(aws secretsmanager get-secret-value --secret-id "$SECRET_ID" --query SecretString --output text)
if echo "$CURRENT" | python3 -c "import json,sys; d=json.load(sys.stdin); sys.exit(0 if 'SMS_WEBHOOK_SECRET' in d else 1)"; then
  echo "    already present — leaving it alone"
else
  NEW_SECRET=$(openssl rand -hex 32)
  UPDATED=$(echo "$CURRENT" | NEW_SECRET="$NEW_SECRET" python3 -c "
import json, sys, os
d = json.load(sys.stdin)
d['SMS_WEBHOOK_SECRET'] = os.environ['NEW_SECRET']
print(json.dumps(d))
")
  aws secretsmanager put-secret-value --secret-id "$SECRET_ID" --secret-string "$UPDATED" >/dev/null
  echo "    generated and stored (not printed)"
fi
SECRET_ARN=$(aws secretsmanager describe-secret --secret-id "$SECRET_ID" --query ARN --output text)

# ── DLR pipeline (delivery receipts) — number-independent ───────────────────
CONFIG_SET="dreamcrm-sms"
EVENTS_TOPIC="dreamcrm-sms-events"

echo "==> SNS: events topic $EVENTS_TOPIC"
TOPIC_ARN=$(aws sns create-topic --name "$EVENTS_TOPIC" --query TopicArn --output text)
aws sns set-topic-attributes --topic-arn "$TOPIC_ARN" --attribute-name Policy \
  --attribute-value "{
    \"Version\": \"2012-10-17\",
    \"Statement\": [{
      \"Sid\": \"AllowSmsVoicePublish\",
      \"Effect\": \"Allow\",
      \"Principal\": { \"Service\": \"sms-voice.amazonaws.com\" },
      \"Action\": \"sns:Publish\",
      \"Resource\": \"$TOPIC_ARN\",
      \"Condition\": { \"StringEquals\": { \"aws:SourceAccount\": \"$ACCOUNT\" } }
    }]
  }"
echo "    topic ready (sms-voice may publish)"

echo "==> Configuration set: $CONFIG_SET → $EVENTS_TOPIC (TEXT_ALL)"
if ! aws pinpoint-sms-voice-v2 describe-configuration-sets \
      --configuration-set-names "$CONFIG_SET" --query 'ConfigurationSets[0]' \
      --output text >/dev/null 2>&1; then
  aws pinpoint-sms-voice-v2 create-configuration-set \
    --configuration-set-name "$CONFIG_SET" >/dev/null
fi
HAS_DEST=$(aws pinpoint-sms-voice-v2 describe-configuration-sets \
  --configuration-set-names "$CONFIG_SET" \
  --query "ConfigurationSets[0].EventDestinations[?EventDestinationName=='sns-events'] | length(@)" \
  --output text)
if [[ "$HAS_DEST" == "0" || "$HAS_DEST" == "None" ]]; then
  aws pinpoint-sms-voice-v2 create-event-destination \
    --configuration-set-name "$CONFIG_SET" \
    --event-destination-name sns-events \
    --matching-event-types TEXT_ALL \
    --sns-destination "TopicArn=$TOPIC_ARN" >/dev/null
fi
echo "    configuration set wired"

echo "==> SNS: webhook subscription on $EVENTS_TOPIC"
# Endpoint carries the token — read it from Secrets Manager, never print it.
WEBHOOK_ENDPOINT=$(aws secretsmanager get-secret-value --secret-id "$SECRET_ID" \
  --query SecretString --output text | python3 -c "
import json, sys
d = json.load(sys.stdin)
print('https://www.dreamcreatestudio.com/api/webhooks/sms?token=' + d['SMS_WEBHOOK_SECRET'])
")
CONFIRMED=$(aws sns list-subscriptions-by-topic --topic-arn "$TOPIC_ARN" \
  --query "Subscriptions[?Protocol=='https' && SubscriptionArn!='PendingConfirmation'] | length(@)" \
  --output text)
if [[ "$CONFIRMED" == "0" || "$CONFIRMED" == "None" ]]; then
  aws sns subscribe --topic-arn "$TOPIC_ARN" --protocol https \
    --notification-endpoint "$WEBHOOK_ENDPOINT" >/dev/null
  echo "    subscribed — confirms automatically once the webhook route is DEPLOYED"
  echo "    (pending subscriptions expire in ~3 days; re-run this script after merge if needed)"
else
  echo "    already confirmed — leaving it alone"
fi

echo "==> App Runner: SMS env on service $SERVICE_NAME"
SERVICE_ARN=$(aws apprunner list-services --region "$REGION" \
  --query "ServiceSummaryList[?ServiceName=='$SERVICE_NAME'].ServiceArn | [0]" --output text)
if [[ -z "$SERVICE_ARN" || "$SERVICE_ARN" == "None" ]]; then
  echo "ERROR: App Runner service '$SERVICE_NAME' not found in $REGION" >&2
  exit 1
fi

# MERGE into the existing maps — update-service REPLACES RuntimeEnvironment*
# wholesale, so we reconstruct the full image configuration from the live
# service and only add our two keys.
aws apprunner describe-service --region "$REGION" --service-arn "$SERVICE_ARN" \
  --query Service.SourceConfiguration > /tmp/apprunner-source.json

python3 - "$SECRET_ARN" <<'PY'
import json, sys

secret_arn = sys.argv[1]
with open('/tmp/apprunner-source.json') as f:
    src = json.load(f)

img = src['ImageRepository']['ImageConfiguration']
env = img.get('RuntimeEnvironmentVariables') or {}
sec = img.get('RuntimeEnvironmentSecrets') or {}

changed = False
if env.get('SMS_DRIVER') != 'aws':
    env['SMS_DRIVER'] = 'aws'
    changed = True
if env.get('SMS_CONFIGURATION_SET') != 'dreamcrm-sms':
    env['SMS_CONFIGURATION_SET'] = 'dreamcrm-sms'
    changed = True
want_ref = f'{secret_arn}:SMS_WEBHOOK_SECRET::'
if sec.get('SMS_WEBHOOK_SECRET') != want_ref:
    sec['SMS_WEBHOOK_SECRET'] = want_ref
    changed = True

img['RuntimeEnvironmentVariables'] = env
img['RuntimeEnvironmentSecrets'] = sec

with open('/tmp/apprunner-source-updated.json', 'w') as f:
    json.dump(src, f)
with open('/tmp/apprunner-changed', 'w') as f:
    f.write('yes' if changed else 'no')
PY

if [[ "$(cat /tmp/apprunner-changed)" == "no" ]]; then
  echo "    already configured — no service update needed"
else
  aws apprunner update-service --region "$REGION" \
    --service-arn "$SERVICE_ARN" \
    --source-configuration file:///tmp/apprunner-source-updated.json >/dev/null
  echo "    service updating (rolling deployment of the same image, ~3-5 min)"
fi
rm -f /tmp/apprunner-source.json /tmp/apprunner-source-updated.json /tmp/apprunner-changed

cat <<'NEXT'

==> Done. SMS_DRIVER=aws goes live when the service update finishes.
    The registration form appears at /integrations/sms; the 6-hourly
    sms-registration cron begins polling.

──────────────────────────────────────────────────────────────────────────────
LATER — after the first clinic's registration reaches 'approved' and a
number exists (this cannot be wired before then):

  1. Create the inbound topic + subscribe the webhook (token from the secret):
       aws sns create-topic --name dreamcrm-sms-inbound
       aws sns subscribe --topic-arn <TOPIC_ARN> --protocol https \
         --notification-endpoint \
         "https://www.dreamcreatestudio.com/api/webhooks/sms?token=<SMS_WEBHOOK_SECRET>"
     (The webhook auto-confirms the subscription.)

  2. Point the number at the topic AND flip self-managed opt-outs — the ops
     contract says these travel together (from that moment STOP/HELP replies
     are the app's to send):
       aws pinpoint-sms-voice-v2 update-phone-number \
         --phone-number-id <PHONE_NUMBER_ID> \
         --two-way-enabled --two-way-channel-arn <TOPIC_ARN> \
         --self-managed-opt-outs-enabled

  3. Allow SNS→topic publishing for the SMS service if prompted, and add
     "sms-voice:UpdatePhoneNumber" to the DreamCRMSmsVoice policy only if
     you want the app (not ops) to do step 2 in future.
──────────────────────────────────────────────────────────────────────────────
NEXT
