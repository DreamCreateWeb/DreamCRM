import { NextResponse } from 'next/server'
import { runRetentionAutomations } from '@/lib/services/retention-automation'
import { runBalanceReminderCadence } from '@/lib/services/balance-outreach'
import { runDuePlanCharges } from '@/lib/services/payment-plans'
import { runDueNpsSurveys } from '@/lib/services/nps'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * Create due retention-automation campaigns (birthday + reactivation).
 *
 * For every clinic with an automation enabled, this stamps a scheduled campaign
 * (idempotent via campaigns.automation_key) that the every-15-min
 * send-scheduled-campaigns cron then delivers compliantly. Birthday runs daily;
 * reactivation is keyed monthly so re-runs within the month are no-ops — so it's
 * safe to schedule this daily.
 *
 * Triggered by EventBridge; guarded by CRON_SECRET (same pattern as the other
 * crons). Returns `{ ok, scanned, created, alreadyCreated, emptyAudience, ... }`.
 */
async function run(request: Request) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    const result = await runRetentionAutomations()
    // Opt-in balance-reminder cadence rides the same daily tick. Best-effort —
    // a billing hiccup must never fail the birthday/reactivation job.
    const balance = await runBalanceReminderCadence().catch((err) => {
      console.warn('[retention-automations] balance cadence failed', err)
      return null
    })
    // Due payment-plan installments charge on the same daily tick (each
    // charge is idempotent-by-state: success advances nextChargeAt a month,
    // failure pushes the 3-day retry). Best-effort for the same reason.
    const planCharges = await runDuePlanCharges().catch((err) => {
      console.warn('[retention-automations] plan charges failed', err)
      return null
    })
    // Opt-in post-visit NPS surveys (3 days after completion) — same daily
    // tick, same best-effort posture.
    const nps = await runDueNpsSurveys().catch((err) => {
      console.warn('[retention-automations] NPS surveys failed', err)
      return null
    })
    return NextResponse.json({ ok: true, ...result, balanceOutreach: balance, paymentPlans: planCharges, npsSurveys: nps })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'unknown' }, { status: 500 })
  }
}

export const POST = run
export const GET = run
