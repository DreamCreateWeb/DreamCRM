import { NextResponse } from 'next/server'
import { sendDueTrialReminders } from '@/lib/services/billing-notifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * Email trialing clinics whose next reminder milestone is due (3 days / 1 day /
 * ends-today / ended) so an owner who isn't logging in still gets warned before
 * the lock wall. Per-milestone idempotency (recorded on clinic_profile) makes
 * the cadence forgiving — running it a few times a day sends each clinic each
 * milestone exactly once.
 *
 * Wiring: EventBridge schedule rule → POST/GET with
 * `Authorization: Bearer ${CRON_SECRET}` (same pattern as the other crons).
 * Returns `{ ok, scanned, sent, skipped, failed }`.
 */
async function run(request: Request) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    const result = await sendDueTrialReminders()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'unknown' }, { status: 500 })
  }
}

export const POST = run
export const GET = run
