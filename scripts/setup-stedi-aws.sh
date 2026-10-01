#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# Stedi (insurance eligibility) — AWS-side setup for the insurance tool.
#
# Idempotent, like setup-sms-aws.sh: safe to re-run; every step checks before
# it changes. Run with credentials that can touch Secrets Manager and App
# Runner in account 952078552817.
#
#   STEDI_API_KEY=<key> ./scripts/setup-stedi-aws.sh                # test mode
#   STEDI_API_KEY=<key> ./scripts/setup-stedi-aws.sh --mode live --confirm-baa
#   ./scripts/setup-stedi-aws.sh --driver sandbox                   # switch off
#
# What it does, in order:
#   1. Preflight — verifies the credentials and the account.
#   2. Secrets  — stores STEDI_API_KEY in dreamcrm/app-secrets (merged into
#                 the existing JSON map; never printed). With no STEDI_API_KEY
#                 in the environment, an existing stored key is left alone;
#                 with one, it REPLACES the stored key — that is how a
#                 rotation lands.
#   3. Service  — adds INSURANCE_DRIVER + STEDI_MODE (+ STEDI_DEFAULT_NPI
#                 when --npi is given) as plain env vars and STEDI_API_KEY as
#                 a runtime secret ref to the App Runner service, MERGED into
#                 the existing maps — App Runner replaces the whole map on
#                 update, so a naive write would drop every other variable.
#                 This triggers a rolling deployment of the same image.
#
# THE KEY DECIDES WHAT HAPPENS, so match the key to the mode:
#   --mode test (default)  needs a Stedi TEST key. A test key only answers
#                          Stedi's predefined mock requests and sends nothing
#                          to a payer. A LIVE key in test mode reaches real
#                          payers, is billed per check, and is mislabelled
#                          "Test payer answer" in the product — never do that.
#   --mode live            needs a LIVE key, an executed Stedi BAA
#                          (docs/COMPLIANCE.md — PHI leaves the platform), and
#                          each practice's NPI on its profile (or --npi as the
#                          platform fallback). The --confirm-baa flag is the
#                          written acknowledgement; the script refuses without it.
# ─────────────────────────────────────────────────────────────────────────────

REGION="${AWS_REGION:-us-east-1}"
ACCOUNT="952078552817"
SECRET_ID="dreamcrm/app-secrets"
SERVICE_NAME="dreamcrm"

MODE="test"
DRIVER="stedi"
NPI=""
CONFIRM_BAA="no"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) MODE="${2:-}"; shift 2 ;;
    --driver) DRIVER="${2:-}"; shift 2 ;;
    --npi) NPI="${2:-}"; shift 2 ;;
    --confirm-baa) CONFIRM_BAA="yes"; shift ;;
    -h|--help) sed -n '4,40p' "$0"; exit 0 ;;
    *) echo "ERROR: unknown argument $1" >&2; exit 1 ;;
  esac
done

case "$MODE" in test|live) ;; *) echo "ERROR: --mode must be test or live" >&2; exit 1 ;; esac
case "$DRIVER" in stedi|sandbox) ;; *) echo "ERROR: --driver must be stedi or sandbox" >&2; exit 1 ;; esac
if [[ "$MODE" == "live" && "$CONFIRM_BAA" != "yes" ]]; then
  echo "ERROR: --mode live sends patient data to real payers. Pass --confirm-baa only once" >&2
  echo "       Stedi's BAA is executed (docs/COMPLIANCE.md)." >&2
  exit 1
fi
NPI_DIGITS="${NPI//[^0-9]/}"
if [[ -n "$NPI" && ${#NPI_DIGITS} -ne 10 ]]; then
  echo "ERROR: --npi must be a 10-digit NPI" >&2
  exit 1
fi

echo "==> Preflight"
IDENTITY_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
if [[ "$IDENTITY_ACCOUNT" != "$ACCOUNT" ]]; then
  echo "ERROR: credentials belong to account $IDENTITY_ACCOUNT, expected $ACCOUNT" >&2
  exit 1
fi
echo "    account $ACCOUNT confirmed · driver=$DRIVER mode=$MODE"

echo "==> Secrets Manager: STEDI_API_KEY in $SECRET_ID"
CURRENT=$(aws secretsmanager get-secret-value --secret-id "$SECRET_ID" --query SecretString --output text)
HAS_KEY="no"
KEY_CHANGED="no"
if echo "$CURRENT" | python3 -c "import json,sys; d=json.load(sys.stdin); sys.exit(0 if (d.get('STEDI_API_KEY') or '').strip() else 1)"; then
  HAS_KEY="yes"
fi
if [[ -n "${STEDI_API_KEY:-}" ]]; then
  UPDATED=$(echo "$CURRENT" | python3 -c "
import json, sys, os
d = json.load(sys.stdin)
d['STEDI_API_KEY'] = os.environ['STEDI_API_KEY'].strip()
print(json.dumps(d))
")
  aws secretsmanager put-secret-value --secret-id "$SECRET_ID" --secret-string "$UPDATED" >/dev/null
  if [[ "$HAS_KEY" == "yes" ]]; then echo "    replaced the stored key (not printed)"; else echo "    stored (not printed)"; fi
  HAS_KEY="yes"
  KEY_CHANGED="yes"
elif [[ "$HAS_KEY" == "yes" ]]; then
  echo "    already present — leaving it alone (set STEDI_API_KEY in the environment to replace it)"
elif [[ "$DRIVER" == "stedi" ]]; then
  echo "ERROR: no STEDI_API_KEY stored and none in the environment — the stedi driver would refuse every check." >&2
  echo "       Run again as: STEDI_API_KEY=<your Stedi $MODE key> $0 ${MODE:+--mode $MODE}" >&2
  exit 1
else
  echo "    none stored and none given — fine for --driver sandbox"
fi
SECRET_ARN=$(aws secretsmanager describe-secret --secret-id "$SECRET_ID" --query ARN --output text)

echo "==> App Runner: insurance env on service $SERVICE_NAME"
SERVICE_ARN=$(aws apprunner list-services --region "$REGION" \
  --query "ServiceSummaryList[?ServiceName=='$SERVICE_NAME'].ServiceArn | [0]" --output text)
if [[ -z "$SERVICE_ARN" || "$SERVICE_ARN" == "None" ]]; then
  echo "ERROR: App Runner service '$SERVICE_NAME' not found in $REGION" >&2
  exit 1
fi

# MERGE into the existing maps — update-service REPLACES RuntimeEnvironment*
# wholesale, so we reconstruct the full image configuration from the live
# service and only touch our keys.
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
aws apprunner describe-service --region "$REGION" --service-arn "$SERVICE_ARN" \
  --query Service.SourceConfiguration > "$WORK/source.json"

python3 - "$SECRET_ARN" "$DRIVER" "$MODE" "$NPI_DIGITS" "$HAS_KEY" "$WORK" <<'PY'
import json, sys

secret_arn, driver, mode, npi, has_key, work = sys.argv[1:7]
with open(f'{work}/source.json') as f:
    src = json.load(f)

img = src['ImageRepository']['ImageConfiguration']
env = img.get('RuntimeEnvironmentVariables') or {}
sec = img.get('RuntimeEnvironmentSecrets') or {}

changed = False
def set_env(key, value):
    global changed
    if env.get(key) != value:
        env[key] = value
        changed = True

set_env('INSURANCE_DRIVER', driver)
set_env('STEDI_MODE', mode)
if npi:
    set_env('STEDI_DEFAULT_NPI', npi)
# The secret ref only goes in once the key exists — App Runner resolves it at
# instance start, and a dangling ref fails the whole rollout.
if has_key == 'yes':
    want_ref = f'{secret_arn}:STEDI_API_KEY::'
    if sec.get('STEDI_API_KEY') != want_ref:
        sec['STEDI_API_KEY'] = want_ref
        changed = True

img['RuntimeEnvironmentVariables'] = env
img['RuntimeEnvironmentSecrets'] = sec

with open(f'{work}/source-updated.json', 'w') as f:
    json.dump(src, f)
with open(f'{work}/changed', 'w') as f:
    f.write('yes' if changed else 'no')
PY

if [[ "$(cat "$WORK/changed")" == "no" && "$KEY_CHANGED" == "yes" ]]; then
  # App Runner reads a secret ONCE, at instance start — a new value is
  # invisible to running instances until they are replaced. (The first run
  # of this script missed this and left production on the old key.)
  aws apprunner start-deployment --region "$REGION" --service-arn "$SERVICE_ARN" >/dev/null
  echo "    key changed — redeploying so instances pick it up (~3-5 min)"
elif [[ "$(cat "$WORK/changed")" == "no" ]]; then
  echo "    already configured — no service update needed"
else
  aws apprunner update-service --region "$REGION" \
    --service-arn "$SERVICE_ARN" \
    --source-configuration "file://$WORK/source-updated.json" >/dev/null
  echo "    service updating (rolling deployment of the same image, ~3-5 min)"
fi

cat <<NEXT

==> Done. INSURANCE_DRIVER=$DRIVER (STEDI_MODE=$MODE) goes live when the
    service update finishes. The tool stays PREVIEW — platform admins only —
    until canUseInsuranceTool is released (lib/insurance-eligibility.ts).

    Watch the rollout:
      aws apprunner list-operations --service-arn $SERVICE_ARN --max-results 1
NEXT
