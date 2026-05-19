import { NextRequest, NextResponse } from 'next/server'
import { readFileSync, readdirSync } from 'fs'
import path from 'path'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'

const APPLIED_TABLE = '_dreamcrm_migrations_applied'

async function ensureLedger() {
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS ${APPLIED_TABLE} (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `))
}

async function listApplied(): Promise<Set<string>> {
  const rows = await db.execute<{ filename: string }>(sql.raw(`SELECT filename FROM ${APPLIED_TABLE}`))
  const list = Array.isArray(rows) ? rows : (rows as { rows?: { filename: string }[] }).rows ?? []
  return new Set(list.map((r) => r.filename))
}

async function markApplied(filename: string) {
  await db.execute(sql.raw(`INSERT INTO ${APPLIED_TABLE} (filename) VALUES ('${filename.replace(/'/g, "''")}')
    ON CONFLICT (filename) DO NOTHING`))
}

const TOLERABLE_PG_CODES = new Set(['42P07', '42701', '42710'])

async function runMigrationFile(filename: string, sqlText: string): Promise<{ ok: true; skipped: number } | { ok: false; error: string }> {
  const statements = sqlText.split(/-->\s*statement-breakpoint/i).map((s) => s.trim()).filter(Boolean)
  let skipped = 0
  for (const stmt of statements) {
    try {
      await db.execute(sql.raw(stmt))
    } catch (err) {
      const code = (err as { code?: string; cause?: { code?: string } }).code
        ?? (err as { cause?: { code?: string } }).cause?.code
      if (code && TOLERABLE_PG_CODES.has(code)) { skipped++; continue }
      return { ok: false, error: `${filename}: ${(err as Error).message}` }
    }
  }
  return { ok: true, skipped }
}

export async function POST(req: NextRequest) {
  const expected = process.env.ADMIN_BOOTSTRAP_TOKEN
  if (!expected) return NextResponse.json({ error: 'ADMIN_BOOTSTRAP_TOKEN is not set' }, { status: 503 })
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (token !== expected) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await ensureLedger()
  const applied = await listApplied()
  const dir = path.join(process.cwd(), 'lib', 'db', 'migrations')
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  const results: Array<{ filename: string; status: string; skipped?: number; error?: string }> = []

  for (const filename of files) {
    if (applied.has(filename)) { results.push({ filename, status: 'already-applied' }); continue }
    const sqlText = readFileSync(path.join(dir, filename), 'utf8')
    const result = await runMigrationFile(filename, sqlText)
    if (result.ok) {
      await markApplied(filename)
      results.push({ filename, status: 'applied', skipped: result.skipped })
    } else {
      results.push({ filename, status: 'failed', error: result.error })
      return NextResponse.json({ ok: false, results }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true, results })
}
