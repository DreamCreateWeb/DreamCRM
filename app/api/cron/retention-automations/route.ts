import { NextResponse } from 'next/server'
import { runRetentionAutomations } from '@/lib/services/retention-automation'

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
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'unknown' }, { status: 500 })
  }
}

export const POST = run
export const GET = run
