import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { runFollowupRules } from '@/lib/services/followup-rules'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * Smart follow-up rules — auto-create patient follow-ups from live conditions
 * (balance / overdue recall / unconfirmed visit) for every clinic that opted in.
 * Idempotent via patient_followup.rule_key, so an hourly cadence never
 * duplicates. CRON_SECRET-gated. Returns `{ ok, scanned, created, errors }`.
 */
async function run(request: Request) {
  const denied = requireCronAuth(request)
  if (denied) return denied
  try {
    const result = await runFollowupRules()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'unknown' }, { status: 500 })
  }
}

export const POST = run
export const GET = run
