import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * One-time bootstrap endpoint used to apply the merged Drizzle migration
 * (lib/db/migrations/0000_third_guardsmen.sql) against the live Neon DB.
 *
 * SECURITY: This whole file is removed in a follow-up commit. While it
 * exists it's guarded by Bearer auth against ADMIN_BOOTSTRAP_TOKEN.
 *
 * USAGE:
 *   POST /api/admin/bootstrap
 *   Authorization: Bearer <ADMIN_BOOTSTRAP_TOKEN>
 *   Content-Type: application/json
 *   { "wipeFirst": true }    // DROP SCHEMA public CASCADE before applying
 */

function unauthorized() {
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
}

function checkAuth(request: Request): boolean {
  const expected = process.env.ADMIN_BOOTSTRAP_TOKEN
  if (!expected) return false
  const provided = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  // Constant-time compare
  if (provided.length !== expected.length) return false
  let mismatch = 0
  for (let i = 0; i < provided.length; i++) {
    mismatch |= provided.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return mismatch === 0
}

export async function POST(request: Request) {
  if (!checkAuth(request)) return unauthorized()

  const url = process.env.DATABASE_URL
  if (!url) return NextResponse.json({ error: 'DATABASE_URL not set' }, { status: 500 })

  const body = (await request.json().catch(() => ({}))) as { wipeFirst?: boolean }
  const wipeFirst = body.wipeFirst === true

  const migrationPath = path.join(
    process.cwd(),
    'lib',
    'db',
    'migrations',
    '0000_third_guardsmen.sql'
  )

  let sqlText: string
  try {
    sqlText = await readFile(migrationPath, 'utf8')
  } catch (err) {
    return NextResponse.json(
      { error: `failed to read migration: ${(err as Error).message}` },
      { status: 500 }
    )
  }

  const sql = neon(url)
  const results: Array<{ step: string; ok: boolean; error?: string }> = []

  if (wipeFirst) {
    try {
      await sql`DROP SCHEMA IF EXISTS public CASCADE`
      await sql`CREATE SCHEMA public`
      results.push({ step: 'wipe', ok: true })
    } catch (err) {
      results.push({ step: 'wipe', ok: false, error: (err as Error).message })
      return NextResponse.json({ ok: false, results }, { status: 500 })
    }
  }

  // Drizzle splits statements with "--> statement-breakpoint". Apply one at a time.
  const statements = sqlText
    .split(/-->\s*statement-breakpoint/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  let applied = 0
  for (const stmt of statements) {
    try {
      await sql.query(stmt)
      applied++
    } catch (err) {
      const message = (err as Error).message
      // Idempotency: tolerate "already exists" if not wiping
      if (!wipeFirst && /already exists/i.test(message)) {
        continue
      }
      results.push({ step: `stmt #${applied + 1}`, ok: false, error: message })
      return NextResponse.json(
        { ok: false, applied, total: statements.length, results, failedStatement: stmt.slice(0, 200) },
        { status: 500 }
      )
    }
  }

  // Verify by listing tables
  const tables = (await sql`
    select table_name from information_schema.tables
    where table_schema = 'public' order by table_name
  `) as Array<{ table_name: string }>

  results.push({ step: 'apply', ok: true })
  return NextResponse.json({
    ok: true,
    applied,
    total: statements.length,
    tableCount: tables.length,
    tables: tables.map((t) => t.table_name),
    results,
  })
}
