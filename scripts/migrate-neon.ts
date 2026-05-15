// One-shot migration runner using the Neon HTTP driver (no WebSocket needed).
// Run with: pnpm tsx scripts/migrate-neon.ts
import { neon } from '@neondatabase/serverless'
import { readFileSync } from 'fs'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set in .env.local')
  process.exit(1)
}

const sql = neon(url)

async function run() {
  const migrationPath = resolve(process.cwd(), 'lib/db/migrations/0002_tranquil_rumiko_fujikawa.sql')
  const raw = readFileSync(migrationPath, 'utf-8')

  const statements = raw
    .split('--> statement-breakpoint')
    .map(s => s.trim())
    .filter(Boolean)

  console.log(`Running ${statements.length} statements…`)
  for (const stmt of statements) {
    await sql.query(stmt)
    console.log('  ✓', stmt.slice(0, 60).replace(/\s+/g, ' '))
  }
  console.log('Migration complete.')
}

run().catch(err => {
  console.error('Migration failed:', err.message)
  process.exit(1)
})
