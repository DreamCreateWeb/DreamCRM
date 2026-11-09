import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { syncMailboxes } from '@/lib/services/gmail-sync'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * The Gmail mailbox sync (ML-59) — every 5 minutes. /inbox renders from the
 * synced copy; this keeps the copy fresh: a budgeted, resumable walk over
 * connected mailboxes (wanted ones first), the delta sync plus the three
 * best-effort backfills. Walled clinics are skipped; a mailbox that throws
 * costs its clinic one `inbox_sync` strike a day and never stops the walk.
 * The Gmail push webhook covers the moment it matters. CRON_SECRET-gated.
 */
async function run(request: Request) {
  const denied = requireCronAuth(request)
  if (denied) return denied
  try {
    const result = await syncMailboxes()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'unknown' }, { status: 500 })
  }
}

export async function GET(request: Request) {
  return run(request)
}

export async function POST(request: Request) {
  return run(request)
}
