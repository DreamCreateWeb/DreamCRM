import { NextResponse } from 'next/server'
import { sendDueScheduledCampaigns } from '@/lib/services/marketing-scheduled'
import { sendDueScheduledMessages, requeueStuckScheduledMessages } from '@/lib/services/scheduled-messages'

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
 * It ALSO flushes due "send later" PATIENT MESSAGES (the /messages composer's
 * Schedule option) on the same already-provisioned 15-minute schedule, so that
 * feature ships without a new EventBridge rule. Same atomic-claim discipline.
 *
 * Triggered every ~15 minutes by EventBridge; guarded by CRON_SECRET (same
 * pattern as auto-send-reviews). Idempotent via the atomic claim.
 *
 * Returns `{ ok, due, claimed, skipped, failed, results, errors, messages }`.
 */
async function run(request: Request) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    // Re-arm any rows stuck mid-send from a prior crashed run, then flush.
    await requeueStuckScheduledMessages().catch(() => 0)
    const [result, messages] = await Promise.all([
      sendDueScheduledCampaigns(),
      // Best-effort — a scheduled-message failure must not fail the whole cron
      // (campaign sends are the primary job here).
      sendDueScheduledMessages().catch((err) => ({
        error: err instanceof Error ? err.message : 'unknown',
        due: 0,
        sent: 0,
        failed: 0,
      })),
    ])
    return NextResponse.json({ ok: true, ...result, messages })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'unknown' }, { status: 500 })
  }
}

export const POST = run
export const GET = run
