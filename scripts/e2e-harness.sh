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
# Usage:  bash scripts/e2e-harness.sh [--skip-build]
# Teardown is automatic (trap), including on failure.
set -euo pipefail

PORT="${E2E_PORT:-3100}"
PGPORT="${E2E_PGPORT:-55432}"
PGDIR="${E2E_PGDIR:-/tmp/e2e-pgdata}"
DB="dreamcrm_e2e"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"
# Debian puts the binaries off PATH; anywhere else (CI runner images, a
# homebrew/apt install on a dev box) initdb is on PATH — use that.
if [[ -z "$PGBIN" ]] && command -v initdb >/dev/null 2>&1; then
  PGBIN="$(dirname "$(command -v initdb)")"
fi
SKIP_BUILD=0
# shift so "$@" passed to playwright below never carries our own flag
[[ "${1:-}" == "--skip-build" ]] && { SKIP_BUILD=1; shift; }

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

echo "--- playwright ---"
# The original dev container pre-installs browsers at /opt/pw-browsers; only
# default to it when it exists — a CI runner uses Playwright's own cache from
# `playwright install`.
if [[ -z "${PLAYWRIGHT_BROWSERS_PATH:-}" && -d /opt/pw-browsers ]]; then
  export PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
fi
E2E_BASE_URL="http://127.0.0.1:$PORT" \
  npx playwright test "$@"
