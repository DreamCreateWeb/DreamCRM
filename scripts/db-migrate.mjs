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
// healthy by the time this runs.
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
      console.error('[migrate] unauthorized — CRON_SECRET mismatch')
      process.exit(1)
    }
    lastErr = `HTTP ${res.status} ${JSON.stringify(body)}`
  } catch (err) {
    // Server not accepting connections yet — keep waiting.
    lastErr = err instanceof Error ? err.message : String(err)
  }
  await sleep(2000)
}

console.error('[migrate] gave up after retries:', lastErr)
process.exit(1)
