import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { sendDueTrialReminders } from '@/lib/services/billing-notifications'
import { reconcileOverdueTrials } from '@/lib/services/billing'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * Email trialing clinics whose next reminder milestone is due, so an owner who
 * isn't logging in still hears in time: a no-card trial is asked for a card
 * before the lock wall (3 days / 1 day / ended), and a trial with the card on
 * file is told the day it is charged (a week out, and the day before).
 * Per-milestone idempotency (recorded on clinic_profile) makes the cadence
 * forgiving — running it a few times a day sends each clinic each milestone
 * exactly once.
 *
 * FIRST it reconciles: any card-on-file trial still recorded as running hours
 * past its end date is re-read from Stripe (`reconcileOverdueTrials`), which
 * is what stops a lost webhook from leaving a clinic "on trial" forever. A
 * failure there never blocks the emails.
 *
 * Wiring: EventBridge schedule rule → POST/GET with
 * `Authorization: Bearer ${CRON_SECRET}` (same pattern as the other crons).
 * Returns `{ ok, scanned, sent, skipped, failed, reconciled }`.
 */
async function run(request: Request) {
  const denied = requireCronAuth(request)
  if (denied) return denied
  try {
    let reconciled: { checked: number; failed: number } | { error: string }
    try {
      reconciled = await reconcileOverdueTrials()
    } catch (err) {
      console.error('[cron/trial-reminders] overdue-trial reconcile failed', err)
      reconciled = { error: err instanceof Error ? err.message : 'unknown' }
    }
    const result = await sendDueTrialReminders()
    return NextResponse.json({ ok: true, ...result, reconciled })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'unknown' }, { status: 500 })
  }
}

export const POST = run
export const GET = run
