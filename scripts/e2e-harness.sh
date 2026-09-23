#!/usr/bin/env bash
# One-command local E2E harness (release program R3).
#
# Stands up everything the browser suite needs and runs it:
#   1. a throwaway local Postgres cluster (the prod RDS is VPC-only)
#   2. every drizzle migration, applied from scratch — which also proves a
#      fresh-database boot works, the same path the deploy takes
#   3. a production build + server on E2E_PORT
#   4. playwright against it
#
# Usage:  bash scripts/e2e-harness.sh [--skip-build] [--spec <filter>]
#                                     [--repeat <n>] [-- <playwright args…>]
# Teardown is automatic (trap), including on failure.
#
# ------------------------------- THE ARGUMENTS -------------------------------
#
# WHY THEY EXIST (DREAMCRM-105 deliverable 1). Until now the workflows ran this
# with no arguments at all, so the only shape of browser run anybody could ask
# for was "the whole suite, once". That is exactly the wrong instrument for the
# question a flake asks: `e2e/portal-billing.spec.ts` has failed twice in a
# week, always on a diff the browser suite never loads, and both times a plain
# re-run at the same SHA went green. "Fails about once a day and I cannot
# reproduce it" is not a fact anybody can act on; "8 of 50 repetitions failed"
# is. `--spec` and `--repeat` are how a run becomes that number, and
# `.github/workflows/e2e-flake-hunt.yml` is how you ask for one without a local
# Postgres.
#
#   --spec <filter>   Playwright's positional test filter — a path
#                     (`e2e/portal-billing.spec.ts`) or a substring of one.
#                     Repeatable. Also `E2E_SPEC`, space-separated, which is
#                     how the workflow passes it (see below).
#   --repeat <n>      `--repeat-each=<n>`: run every selected test n times.
#                     Also `E2E_REPEAT`.
#   --                Everything after it goes to playwright untouched.
#
# ANYTHING NOT RECOGNISED IS STILL FORWARDED, so the existing
# `pnpm test:e2e -- --grep foo` habits keep working and `--skip-build` keeps
# working from any position rather than only as `$1`.
#
# THE INPUTS ARE VALIDATED HERE RATHER THAN IN THE WORKFLOW, and that is the
# load-bearing half. A `workflow_dispatch` input is attacker-controlled text
# from anyone with repo write, so the workflow hands it over in `env:` and
# never interpolates it into a `run:` block — but "never interpolated" is a
# property of one file, and the next workflow to call this script would have to
# rediscover it. Validating the VALUES here makes the guarantee travel with the
# script: a spec filter is a path-shaped token, a repeat is a bounded integer,
# and anything else stops the run with a sentence instead of becoming an
# argument. `tests/guards/e2e-harness-args.test.ts` grades both halves.
set -euo pipefail

PORT="${E2E_PORT:-3100}"
# The SECOND app process (DREAMCRM-48) — see "the webhook server" below for
# why there are two.
WEBHOOK_PORT="${E2E_WEBHOOK_PORT:-$(( ${E2E_PORT:-3100} + 1 ))}"
PGPORT="${E2E_PGPORT:-55432}"
PGDIR="${E2E_PGDIR:-/tmp/e2e-pgdata}"
DB="dreamcrm_e2e"
# `|| true` IS LOAD-BEARING, and its absence was a live bug (DREAMCRM-105).
# With `set -o pipefail`, an `ls` that matches nothing fails, the pipeline
# fails, and the assignment's status is the pipeline's — so on any box WITHOUT
# `/usr/lib/postgresql` (a mac, a Windows checkout, a runner image that
# packages Postgres elsewhere) `set -e` killed the script on this line, silently,
# with `ls`'s exit code and no message. Which meant the fallback on the next
# three lines — and the friendly "No local postgres found" below it — were
# unreachable on every platform they were written for. It only ever worked
# where the glob already matched.
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
# Debian puts the binaries off PATH; anywhere else (CI runner images, a
# homebrew/apt install on a dev box) initdb is on PATH — use that.
if [[ -z "$PGBIN" ]] && command -v initdb >/dev/null 2>&1; then
  PGBIN="$(dirname "$(command -v initdb)")"
fi
SKIP_BUILD=0
# Collected rather than forwarded as "$@", so our own flags never reach
# playwright and playwright's own flags never reach our parser.
PW_ARGS=()
SPECS=()
REPEAT=""
# `--print-plan`: resolve the arguments, print the playwright invocation they
# produce, and stop before touching Postgres.
#
# It exists FOR THE GUARD (`tests/guards/e2e-harness-args.test.ts`). The
# refusal cases can be driven against the real script for free — they die in the
# parser, above the database — but the ACCEPTANCE cases cannot: on a runner that
# has Postgres, `bash scripts/e2e-harness.sh --repeat 8` inside `pnpm test`
# would initdb a cluster, build the app and run the browser suite from inside the
# unit gate. So the half of this parser that matters most — that `--repeat 08`
# is eight and that `E2E_SPEC` actually reaches playwright — would have been
# the untested half, which is precisely the arrangement §2d refuses.
PRINT_PLAN=0

# A SPEC FILTER IS A PATH-SHAPED TOKEN. Letters, digits, dot, dash, underscore
# and slash — everything a test path is made of and nothing a shell reacts to.
# Nothing here is ever eval'd, so this is not the only thing standing between a
# dispatch input and a shell; it is the thing that makes a bad input a SENTENCE
# rather than a silent eight-minute run of the wrong tests.
#
# AND IT MAY NOT START WITH A DASH (Sentinel, reviewing #680). The first version
# admitted a leading `-` because a dash is a legal character inside a path, and
# that quietly made the `--repeat` ceiling below bypassable: `E2E_SPEC` is
# word-split, so `E2E_SPEC='--repeat-each 500'` became two accepted "spec"
# tokens and planned as `playwright test --repeat-each 500`, exit 0, with
# REPEAT_MAX never consulted. Not a security hole — nothing here reaches a
# shell — but the header two screens up promises a bounded run and that promise
# was not true as written.
#
# The fix is the first character rather than a blocklist of flag names: a test
# path never begins with a dash, and every playwright flag does. Anything
# genuinely needing to pass a flag through already has the `--` escape hatch,
# where it is visible in the plan line instead of disguised as a filter.
SPEC_RE='^[A-Za-z0-9._/][A-Za-z0-9._/-]*$'

# THE CEILING ON `--repeat`, and it is a real guard rather than a shrug. A hunt
# is dispatched by hand with a number typed into a box; 500 instead of 50 is one
# keystroke, and on `e2e/portal-billing.spec.ts` (4 tests, 2 workers) it is the
# difference between ten minutes and most of a runner-day with nobody watching.
# 200 is comfortably above any hunt worth running — the two portal-billing
# occurrences are ~1-in-100 page loads, so 50 is already the useful order — and
# well under the workflow's own timeout, so the failure is a refusal at second
# zero instead of a cancellation at minute sixty.
REPEAT_MAX=200

die() { echo "e2e-harness: $1" >&2; exit 2; }

add_spec() {
  [[ -n "$1" ]] || die "--spec needs a value."
  [[ "$1" =~ $SPEC_RE ]] || die "--spec '$1' is not a test path (letters, digits, . _ - /, and it may not start with a dash — pass playwright flags after \`--\` instead)."
  SPECS+=("$1")
}

set_repeat() {
  [[ "$1" =~ ^[0-9]+$ ]] || die "--repeat '$1' is not a whole number."
  # `10#` forces base 10: a zero-padded `050` is octal to bash's arithmetic and
  # `--repeat 08` would die with a syntax error rather than run eight times.
  local n=$((10#$1))
  (( n >= 1 )) || die "--repeat must be at least 1."
  (( n <= REPEAT_MAX )) || die "--repeat $n is above the $REPEAT_MAX ceiling — see the header."
  REPEAT="$n"
}

# The env spellings come FIRST so an explicit flag beside them wins. A blank
# env var is "unset", not an error: `workflow_dispatch` sends '' for an input
# nobody filled in, and refusing that would make every default-valued dispatch
# fail.
if [[ -n "${E2E_SPEC:-}" ]]; then
  # Word-split on purpose — `E2E_SPEC` is a space-separated list, which is how
  # one dispatch box asks for two specs.
  for s in ${E2E_SPEC}; do add_spec "$s"; done
fi
[[ -n "${E2E_REPEAT:-}" ]] && set_repeat "${E2E_REPEAT}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-build) SKIP_BUILD=1; shift ;;
    --print-plan) PRINT_PLAN=1; shift ;;
    --spec) add_spec "${2:-}"; shift 2 ;;
    --spec=*) add_spec "${1#*=}"; shift ;;
    --repeat) set_repeat "${2:-}"; shift 2 ;;
    --repeat=*) set_repeat "${1#*=}"; shift ;;
    --) shift; PW_ARGS+=("$@"); break ;;
    *) PW_ARGS+=("$1"); shift ;;
  esac
done

# The resolved playwright invocation, built once and used by both exits below.
PW_INVOCATION=()
(( ${#SPECS[@]} )) && PW_INVOCATION+=("${SPECS[@]}")
[[ -n "$REPEAT" ]] && PW_INVOCATION+=("--repeat-each=$REPEAT")
(( ${#PW_ARGS[@]} )) && PW_INVOCATION+=("${PW_ARGS[@]}")

if (( PRINT_PLAN )); then
  echo "playwright test ${PW_INVOCATION[*]-}"
  exit 0
fi

if [[ -z "$PGBIN" ]]; then
  echo "No local postgres found (expected /usr/lib/postgresql/*/bin or initdb on PATH)." >&2
  exit 1
fi

# Postgres refuses to run as root, so a root shell (the original dev
# container) delegates to the `postgres` user. Anywhere else — a GitHub
# Actions runner, a normal dev box — the current user owns the throwaway
# cluster directly and no su/chown is needed (or possible).
if [[ "$(id -u)" == "0" ]]; then
  as_pg() { su postgres -c "$1"; }
else
  as_pg() { bash -c "$1"; }
fi

cleanup() {
  echo "--- teardown ---"
  [[ -n "${SERVER_PID:-}" ]] && kill "$SERVER_PID" 2>/dev/null || true
  [[ -n "${WEBHOOK_PID:-}" ]] && kill "$WEBHOOK_PID" 2>/dev/null || true
  as_pg "$PGBIN/pg_ctl -D $PGDIR stop -m immediate" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "--- postgres ---"
rm -rf "$PGDIR"; mkdir -p "$PGDIR"
[[ "$(id -u)" == "0" ]] && chown -R postgres:postgres "$PGDIR"
as_pg "$PGBIN/initdb -D $PGDIR -U postgres --auth=trust" >/dev/null
as_pg "$PGBIN/pg_ctl -D $PGDIR -o '-p $PGPORT -k /tmp' -l /tmp/e2e-pg.log start" >/dev/null
for i in $(seq 1 30); do pg_isready -h 127.0.0.1 -p "$PGPORT" >/dev/null 2>&1 && break; sleep 1; done
psql -h 127.0.0.1 -p "$PGPORT" -U postgres -c "CREATE DATABASE $DB;" >/dev/null

export DATABASE_URL="postgresql://postgres@127.0.0.1:$PGPORT/$DB"
export BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET:-e2e-secret-not-a-real-key-000000}"
export BETTER_AUTH_URL="http://127.0.0.1:$PORT"
export NEXT_PUBLIC_APP_URL="http://127.0.0.1:$PORT"
export CRON_SECRET="${CRON_SECRET:-e2e-cron}"

# THE STRIPE BOUNDARY IS DELIBERATELY UNREACHABLE, and this line is what makes
# that a contract instead of an accident (DREAMCRM-33).
#
# `lib/stripe.ts` is a lazy Proxy: with no key, the FIRST property access
# throws "STRIPE_SECRET_KEY is not set" — synchronously, with no socket opened
# and no timeout to wait out. That is the deterministic stub the money-journey
# spec's outage half stands on: `e2e/portal-billing.spec.ts` drives a real
# patient through a real checkout attempt and asserts the written sentence a
# patient sees when Stripe is down, in a harness that has no network at all.
#
# Inheriting a key from a dev box's shell would silently turn that into a live
# call to Stripe — a slow, flaky test at best, and at worst a real API call
# from a test run. So unset it here rather than assuming it is absent.
unset STRIPE_SECRET_KEY

# THE ONE SECRET THE WEBHOOK SERVER NEEDS, EXPORTED UNDER ITS OWN NAME.
#
# Deliberately NOT exported as STRIPE_CONNECT_WEBHOOK_SECRET: that name would
# reach the main server too, and the main server's Stripe boundary is the
# contract the paragraph above protects. Playwright needs this value to SIGN
# with, so it is exported; only the webhook server is handed it under the name
# the route actually reads.
export E2E_STRIPE_WEBHOOK_SECRET="${E2E_STRIPE_WEBHOOK_SECRET:-whsec_e2e_not_a_real_signing_secret}"

echo "--- migrations (fresh database: also a deploy-path rehearsal) ---"
node scripts/migrate.mjs

echo "--- fixture ---"
node scripts/e2e-seed.mjs

if [[ "$SKIP_BUILD" == "0" ]]; then
  echo "--- build ---"
  pnpm build
fi

echo "--- server on :$PORT ---"
pnpm start --port "$PORT" > /tmp/e2e-server.log 2>&1 &
SERVER_PID=$!
for i in $(seq 1 60); do
  curl -sf "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && break
  sleep 1
done
curl -sf "http://127.0.0.1:$PORT/api/health" >/dev/null || { echo "server never became healthy:"; tail -20 /tmp/e2e-server.log; exit 1; }

# --- the webhook server (DREAMCRM-48) --------------------------------------
#
# A SECOND `next start` on the same build and the same database, differing
# from the first in exactly two environment variables.
#
# WHY IT CANNOT BE ONE SERVER. `app/api/webhooks/stripe-connect/route.ts`
# verifies the signature through `stripe.webhooks.constructEvent`, which is an
# INSTANCE method — it goes through the lazy Proxy in `lib/stripe.ts`, so with
# no STRIPE_SECRET_KEY the first property access throws and EVERY delivery,
# correctly signed or not, comes back 400 "invalid signature". Nothing past
# the signature could be walked at all. But putting a key on the MAIN server
# would break the contract the `unset` above protects: `portal-billing.spec.ts`
# drives a real checkout attempt and asserts what a patient sees when Stripe is
# down, and a server holding a key would answer that by opening a socket to
# api.stripe.com.
#
# So the boundary stays exactly where it was and the webhook gets its own
# process. The key here is FAKE, and no test may reach a path that spends it —
# which is not a hope, it is the assertion. Every case in
# `e2e/stripe-webhook-backstop.spec.ts` stops at one of the finalizer's
# pre-Stripe returns; a regression that walks past one turns the route 500 and
# the spec red. A real call to Stripe is the failure SIGNAL here, not a risk
# the suite quietly runs.
echo "--- webhook server on :$WEBHOOK_PORT ---"
STRIPE_SECRET_KEY="sk_test_e2e_not_a_real_key" \
  STRIPE_CONNECT_WEBHOOK_SECRET="$E2E_STRIPE_WEBHOOK_SECRET" \
  pnpm start --port "$WEBHOOK_PORT" > /tmp/e2e-webhook-server.log 2>&1 &
WEBHOOK_PID=$!
for i in $(seq 1 60); do
  curl -sf "http://127.0.0.1:$WEBHOOK_PORT/api/health" >/dev/null 2>&1 && break
  sleep 1
done
curl -sf "http://127.0.0.1:$WEBHOOK_PORT/api/health" >/dev/null || { echo "webhook server never became healthy:"; tail -20 /tmp/e2e-webhook-server.log; exit 1; }

echo "--- playwright ---"
# The original dev container pre-installs browsers at /opt/pw-browsers; only
# default to it when it exists — a CI runner uses Playwright's own cache from
# `playwright install`.
if [[ -z "${PLAYWRIGHT_BROWSERS_PATH:-}" && -d /opt/pw-browsers ]]; then
  export PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
fi

# SAY WHAT IS ABOUT TO RUN. A hunt's whole output is a ratio, and a ratio is
# worthless without its denominator: a dispatch whose `--spec` quietly matched
# nothing of what the reader meant, or whose `--repeat` never arrived, reports
# the same shape of green as a genuine clean 50. This line is printed into the
# run log above the playwright output so the denominator is on the same page as
# the result.
if (( ${#SPECS[@]} )) || [[ -n "$REPEAT" ]]; then
  echo "    spec filter: ${SPECS[*]:-(the whole suite)}"
  echo "    repetitions: ${REPEAT:-1} per test"
fi

E2E_BASE_URL="http://127.0.0.1:$PORT" \
  E2E_WEBHOOK_BASE_URL="http://127.0.0.1:$WEBHOOK_PORT" \
  npx playwright test ${PW_INVOCATION[@]+"${PW_INVOCATION[@]}"}
