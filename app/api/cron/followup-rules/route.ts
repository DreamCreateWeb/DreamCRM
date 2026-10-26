import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { runFollowupRules } from '@/lib/services/followup-rules'
import { resurfaceSnoozedThreads } from '@/lib/services/patient-messaging'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * Smart follow-up rules — auto-create patient follow-ups from live conditions
 * (balance / overdue recall / unconfirmed visit) for every clinic that opted in.
 * Idempotent via patient_followup.rule_key, so an hourly cadence never
 * duplicates. CRON_SECRET-gated. Returns `{ ok, scanned, created, errors }`.
 *
 * It ALSO flips run-out message snoozes back to 'open' and tells the assignee
 * (the same hourly rhythm the front desk's "remind me tomorrow" needs, and no
 * new EventBridge rule). Best-effort — a snooze sweep blip never fails the
 * follow-up rules, which are the primary job here. Returns `snoozes` beside
 * the rules' own counts.
 */
async function run(request: Request) {
  const denied = requireCronAuth(request)
  if (denied) return denied
  try {
    const [result, snoozes] = await Promise.all([
      runFollowupRules(),
      resurfaceSnoozedThreads().catch((err) => ({
        error: err instanceof Error ? err.message : 'unknown',
        resurfaced: 0,
        notified: 0,
      })),
    ])
    return NextResponse.json({ ok: true, ...result, snoozes })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'unknown' }, { status: 500 })
  }
}

export const POST = run
export const GET = run
