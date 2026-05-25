import { NextResponse } from 'next/server'
import path from 'node:path'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'
import { pgSsl } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

// One-shot migration runner, invoked from inside the VPC (the running app can
// reach the private RDS instance; an out-of-VPC operator cannot). Guarded by
// CRON_SECRET. Idempotent — drizzle only applies pending migrations.
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const url = process.env.DATABASE_URL
  if (!url) {
    return NextResponse.json({ error: 'DATABASE_URL not set' }, { status: 503 })
  }

  const pool = new Pool({ connectionString: url, ssl: pgSsl(url) })
  try {
    const db = drizzle(pool)
    await migrate(db, { migrationsFolder: path.join(process.cwd(), 'lib/db/migrations') })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  } finally {
    await pool.end().catch(() => {})
  }
}
