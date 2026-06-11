import { NextResponse } from 'next/server'
import { sendDueScheduledCampaigns } from '@/lib/services/marketing-scheduled'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * Dispatch scheduled marketing campaigns whose time has arrived.
 *
 * Campaigns saved with "Send later" (status='scheduled' + scheduledAt) had no
 * sender until now. This cron finds every due one and sends it. Each campaign
 * is atomically claimed (scheduled → active) so an overlapping run can't
 * double-send.
 *
 * Triggered every ~15 minutes by EventBridge; guarded by CRON_SECRET (same
 * pattern as auto-send-reviews). Idempotent via the atomic claim.
 *
 * Returns `{ ok, due, claimed, skipped, failed, results, errors }`.
 */
async function run(request: Request) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    const result = await sendDueScheduledCampaigns()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'unknown' }, { status: 500 })
  }
}

export const POST = run
export const GET = run
