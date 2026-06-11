import { NextResponse } from 'next/server'
import { runDueReminders } from '@/lib/services/reminder-automation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * Automated appointment reminders. The public booking form + confirmation email
 * promise patients a reminder before their visit; this cron makes that real.
 *
 * Triggered every ~30 minutes by EventBridge; guarded by CRON_SECRET (same
 * pattern as auto-send-reviews). Idempotent per appointment within its reminder
 * window (see lib/services/reminder-automation.ts), so the 30-min cadence never
 * double-sends.
 *
 * Returns `{ ok, orgsScanned, candidates, sent, alreadyReminded, skipped,
 * failed, errors }` so a future ops dashboard can surface batch health.
 */
async function run(request: Request) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    const result = await runDueReminders()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'unknown' }, { status: 500 })
  }
}

export const POST = run
export const GET = run
