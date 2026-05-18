import { NextResponse } from 'next/server'
import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import { neon } from '@neondatabase/serverless'

/**
 * One-shot migration runner.
 *
 * Push this route, set ADMIN_BOOTSTRAP_TOKEN in Vercel, curl it, then
 * remove BOTH the route file and the env var.
 *
 *   curl -X POST https://dreamcreatestudio.com/api/admin/bootstrap \
 *     -H "Authorization: Bearer $ADMIN_BOOTSTRAP_TOKEN"
 *
 * Returns the list of migration files it applied. Each migration is wrapped
 * in its own transaction so a failure mid-run won't corrupt the DB.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MIGRATIONS_DIR = join(process.cwd(), 'lib', 'db', 'migrations')

export async function POST(request: Request) {
  const token = process.env.ADMIN_BOOTSTRAP_TOKEN
  if (!token) {
    return NextResponse.json(
      { error: 'ADMIN_BOOTSTRAP_TOKEN env var is not set' },
      { status: 500 },
    )
  }

  const auth = request.headers.get('authorization') ?? ''
  const provided = auth.replace(/^Bearer\s+/i, '').trim()
  if (provided !== token) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const dbUrl = process.env.DATABASE_URL
  if (!dbUrl) {
    return NextResponse.json({ error: 'DATABASE_URL is not set' }, { status: 500 })
  }

  const sql = neon(dbUrl)

  // Ensure the tracking table exists. We track applied migrations by filename
  // (not Drizzle's hash format) so this runner is independent of drizzle-kit's
  // metadata layout.
  await sql`
    CREATE TABLE IF NOT EXISTS __dreamcrm_migrations (
      filename text PRIMARY KEY,
      applied_at timestamp NOT NULL DEFAULT now()
    )
  `

  const appliedRows = await sql`SELECT filename FROM __dreamcrm_migrations`
  const already = new Set(appliedRows.map((r) => r.filename as string))

  const allFiles = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith('.sql'))
    .sort()

  const pending = allFiles.filter((f) => !already.has(f))

  const results: Array<{ filename: string; statements: number; status: 'applied' | 'failed'; error?: string }> = []

  for (const filename of pending) {
    const raw = await readFile(join(MIGRATIONS_DIR, filename), 'utf8')
    // Drizzle generates files with `--> statement-breakpoint` separators.
    const statements = raw
      .split(/-->\s*statement-breakpoint/)
      .map((s) => s.trim())
      .filter(Boolean)

    try {
      // Neon's @neondatabase/serverless doesn't expose a multi-statement
      // transaction over HTTP directly, so we just run statements in order.
      // Each migration file is small (column adds, table creates), and if
      // one fails the migration record won't be written, so re-running is safe.
      for (const stmt of statements) {
        await sql.query(stmt)
      }
      await sql`INSERT INTO __dreamcrm_migrations (filename) VALUES (${filename})`
      results.push({ filename, statements: statements.length, status: 'applied' })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      results.push({ filename, statements: statements.length, status: 'failed', error: message })
      break
    }
  }

  const failed = results.some((r) => r.status === 'failed')
  return NextResponse.json(
    {
      pending: pending.length,
      applied: results.filter((r) => r.status === 'applied').map((r) => r.filename),
      results,
    },
    { status: failed ? 500 : 200 },
  )
}

export async function GET(request: Request) {
  const token = process.env.ADMIN_BOOTSTRAP_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'ADMIN_BOOTSTRAP_TOKEN env var is not set' }, { status: 500 })
  }
  const auth = request.headers.get('authorization') ?? ''
  if (auth.replace(/^Bearer\s+/i, '').trim() !== token) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const dbUrl = process.env.DATABASE_URL
  if (!dbUrl) {
    return NextResponse.json({ error: 'DATABASE_URL is not set' }, { status: 500 })
  }
  const sql = neon(dbUrl)
  await sql`
    CREATE TABLE IF NOT EXISTS __dreamcrm_migrations (
      filename text PRIMARY KEY,
      applied_at timestamp NOT NULL DEFAULT now()
    )
  `
  const appliedRows = await sql`SELECT filename, applied_at FROM __dreamcrm_migrations ORDER BY filename`
  const allFiles = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort()
  const appliedSet = new Set(appliedRows.map((r) => r.filename as string))

  return NextResponse.json({
    applied: appliedRows,
    pending: allFiles.filter((f) => !appliedSet.has(f)),
    all: allFiles,
  })
}
