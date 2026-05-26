// Applies any pending Drizzle migrations on container startup, then exits.
// Run before `node server.js` in the Docker CMD so every deploy auto-applies
// its own migrations (no manual /api/admin/migrate curl). Idempotent — drizzle
// only runs migrations not yet in the journal table.
//
// Failure mode is intentional + safe: a non-zero exit stops the container from
// booting, so App Runner fails the health check and keeps the PREVIOUS version
// serving (the app never goes down on a bad migration — the deploy just shows
// failed). Skips cleanly when DATABASE_URL is unset (e.g. local `node` runs).
import path from 'node:path'
import process from 'node:process'
import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'

const url = process.env.DATABASE_URL
if (!url) {
  console.log('[migrate] DATABASE_URL not set — skipping')
  process.exit(0)
}

// Mirror lib/db/pgSsl: no SSL for local, relaxed verification for RDS.
const ssl = /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false }
const pool = new Pool({ connectionString: url, ssl })

try {
  await migrate(drizzle(pool), {
    migrationsFolder: path.join(process.cwd(), 'lib/db/migrations'),
  })
  console.log('[migrate] up to date')
} catch (err) {
  console.error('[migrate] failed:', err instanceof Error ? err.message : err)
  process.exit(1)
} finally {
  await pool.end().catch(() => {})
}
