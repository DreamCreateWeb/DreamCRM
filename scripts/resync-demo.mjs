// Calls the app's own /api/admin/resync-demo route after the server is up
// so the Acme Dental Demo gets walked through every self-heal branch on
// every deploy. Runs alongside `node server.js` in the Docker CMD,
// chained after db-migrate.mjs.
//
// Idempotent — createDemoClinic returns the existing demo + applies any
// pending backfills. A failure is logged but does NOT stop the server;
// next deploy retries. Skips cleanly when CRON_SECRET is unset
// (e.g. `node server.js` for local dev).
const base = `http://127.0.0.1:${process.env.PORT || 3000}`
const secret = process.env.CRON_SECRET

if (!secret) {
  console.log('[resync-demo] CRON_SECRET not set — skipping')
  process.exit(0)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let lastErr = 'unknown'
// Retry for ~90s while the server finishes booting. db-migrate.mjs already
// confirmed the server is up by the time this runs, so usually first try.
for (let i = 0; i < 45; i++) {
  try {
    const res = await fetch(`${base}/api/admin/resync-demo`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}` },
    })
    const body = await res.json().catch(() => ({}))
    if (res.ok && body.ok) {
      console.log('[resync-demo] demo clinic resynced')
      process.exit(0)
    }
    if (res.status === 401) {
      console.error('[resync-demo] unauthorized — CRON_SECRET mismatch')
      process.exit(1)
    }
    lastErr = `HTTP ${res.status} ${JSON.stringify(body)}`
  } catch (err) {
    lastErr = err instanceof Error ? err.message : String(err)
  }
  await sleep(2000)
}

console.error('[resync-demo] gave up after retries:', lastErr)
process.exit(1)
