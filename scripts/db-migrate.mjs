// Auto-applies pending DB migrations on container startup by calling the app's
// own /api/admin/migrate route (idempotent drizzle migrate) once the server is
// up. Runs alongside `node server.js` in the Docker CMD.
//
// Why call the route instead of running drizzle here directly: Next's
// standalone output bundles drizzle-orm INTO the compiled server, so the route
// resolves it — but a raw Node script can't resolve drizzle-orm from the
// pnpm-nested standalone node_modules (it isn't hoisted). This script therefore
// uses only built-in fetch and delegates the actual migrate to the route, which
// reads CRON_SECRET + DATABASE_URL from the container env.
//
// Skips cleanly when CRON_SECRET is unset (e.g. local `node server.js`). A
// failure is logged but does NOT stop the server (the app stays up; migrations
// can be re-applied by redeploying) — App Runner has already marked the server
// healthy by the time this runs. That stays: taking the container down because
// a migration threw turns one stuck schema into an outage.
//
// WHAT CHANGED (DREAMCRM-46): every failure line here starts with `ERROR`, so
// `.github/workflows/error-scan.yml` — which filters the App Runner application
// log group on `?ERROR ?Error ?error: ?Unhandled ?FATAL` every 30 minutes —
// actually SEES it. Before, the two failure paths printed `[migrate]
// unauthorized …` and `[migrate] gave up after retries: …`, neither of which
// matches any term in that pattern, so the one alarm already pointed at these
// logs read straight past them. `tests/guards/migration-check.test.ts` derives
// the terms from the workflow rather than restating them.
//
// This is the SECOND signal, not the first. error-scan warns and never fails;
// the assertion that turns a deploy red is `scripts/migration-check.mjs`.
const base = `http://127.0.0.1:${process.env.PORT || 3000}`
const secret = process.env.CRON_SECRET

if (!secret) {
  console.log('[migrate] CRON_SECRET not set — skipping auto-migrate')
  process.exit(0)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let lastErr = 'unknown'
// Retry for ~90s while the server finishes booting.
for (let i = 0; i < 45; i++) {
  try {
    const res = await fetch(`${base}/api/admin/migrate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}` },
    })
    const body = await res.json().catch(() => ({}))
    if (res.ok && body.ok) {
      console.log('[migrate] pending migrations applied')
      process.exit(0)
    }
    if (res.status === 401) {
      console.error('[migrate] ERROR: unauthorized — CRON_SECRET mismatch; pending migrations were NOT applied')
      process.exit(1)
    }
    lastErr = `HTTP ${res.status} ${JSON.stringify(body)}`
  } catch (err) {
    // Server not accepting connections yet — keep waiting.
    lastErr = err instanceof Error ? err.message : String(err)
  }
  await sleep(2000)
}

console.error('[migrate] ERROR: gave up after retries; pending migrations were NOT applied:', lastErr)
process.exit(1)
