import { NextResponse } from 'next/server'
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
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    const result = await runFollowupRules()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'unknown' }, { status: 500 })
  }
}

export const POST = run
export const GET = run
