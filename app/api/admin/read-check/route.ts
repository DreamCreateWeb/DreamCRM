import { NextResponse } from 'next/server'
import { requireAdminReadAuth } from '@/lib/cron-auth'
import { Pool } from 'pg'
import { pgSsl } from '@/lib/db'
import { findReadCheck } from '@/lib/read-checks'
import { rateLimitPublicAction } from '@/lib/services/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Hard cap on rows returned. A check that goes wrong dumps a bounded amount. */
const MAX_ROWS = 100

/**
 * One-shot READ-ONLY production check, invoked from inside the VPC — the same
 * shape as `/api/admin/migrate` (the running app can reach the private RDS
 * instance; an out-of-VPC operator cannot), and deliberately the weakest of the
 * four routes behind that allowlist: migrate runs pending DDL, this runs a fixed
 * list of literal SELECTs under a SELECT-only role.
 *
 * Normally called by `.github/workflows/read-check.yml`, so that no agent
 * machine ever holds a database credential. See docs/PROD-READ-ACCESS.md.
 *
 * THE FOUR THINGS THIS ROUTE MUST KEEP DOING — each is load-bearing:
 *
 *  1. Connect ONLY as DATABASE_URL_READONLY, and 503 when it is unset. It must
 *     never fall back to DATABASE_URL. That fallback is precisely how a
 *     read-only endpoint silently becomes a write-capable one, and it would do
 *     so at the exact moment someone was misconfiguring production.
 *  2. Take SQL only from the catalog. See the header of lib/read-checks.ts.
 *  3. Use its OWN small pool. The shared `db` is max: 10 for the whole app
 *     (lib/db/index.ts); a check dispatched by anyone must not be able to eat
 *     the connections real patient traffic needs.
 *  4. Never echo the request body, the Authorization header, or a raw driver
 *     error back to the caller. Errors are logged server-side and answered with
 *     a fixed string.
 */
export async function POST(request: Request) {
  const denied = requireAdminReadAuth(request)
  if (denied) return denied

  // Kept because it is nearly free — NOT the brute-force control. The limiter
  // is documented fail-OPEN and keys on x-forwarded-for; entropy in
  // ADMIN_READ_SECRET is what actually bounds guessing. See lib/cron-auth.ts.
  const allowed = await rateLimitPublicAction('admin-read-check', { limit: 30, windowMs: 5 * 60_000 })
  if (!allowed) {
    return NextResponse.json({ error: 'rate limited' }, { status: 429 })
  }

  let checkId: unknown
  try {
    checkId = (await request.json())?.check
  } catch {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 })
  }
  if (typeof checkId !== 'string') {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 })
  }

  // Unknown ids get a generic 400 that does not repeat the input back, so this
  // cannot be used to probe the catalog or reflect content into a log.
  const check = findReadCheck(checkId)
  if (!check) {
    return NextResponse.json({ error: 'unknown check' }, { status: 400 })
  }

  const url = process.env.DATABASE_URL_READONLY
  if (!url) {
    // FAIL CLOSED. Never `?? process.env.DATABASE_URL` — see (1) above.
    return NextResponse.json({ error: 'read-only database not configured' }, { status: 503 })
  }

  const pool = new Pool({ connectionString: url, ssl: pgSsl(url), max: 2 })
  try {
    const result = await pool.query(check.sql)
    const rows = result.rows.slice(0, MAX_ROWS)
    return NextResponse.json({
      ok: true,
      check: check.id,
      question: check.question,
      rowCount: result.rows.length,
      truncated: result.rows.length > MAX_ROWS,
      rows,
    })
  } catch (err) {
    // Kept out of the RESPONSE: the driver's message can quote the failing SQL
    // and the response is bound for a shared Actions log.
    //
    // Not "kept out of every shared log", which would be untrue. This lands in
    // the App Runner log group that error-scan.yml filters on `?Error ?error:`
    // and prints into a job summary. For SELECT-only catalog queries the
    // message is unlikely to carry row data, but the honest claim is "not in
    // the response", not "nowhere anyone can read".
    console.error(`[read-check] ${check.id} failed:`, err)
    return NextResponse.json({ error: 'check failed' }, { status: 500 })
  } finally {
    await pool.end().catch(() => {})
  }
}
