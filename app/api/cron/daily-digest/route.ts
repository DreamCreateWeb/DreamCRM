import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { runDailyDigest } from '@/lib/services/daily-digest'
import { runProspectingDigest } from '@/lib/services/prospecting-digest'
import { sendWeeklyStandups } from '@/lib/services/standup'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Morning digest — email each opted-in clinic's staff their follow-ups due,
 * visits to confirm, and new leads, linking back to /my-day. Idempotent per
 * user per day via daily_digest_log; demo clinics skipped; quiet when a person
 * has nothing waiting. CRON_SECRET-gated. Scheduled once daily (early morning).
 */
/**
 * The per-clinic walk inside is BUDGETED and RESUMABLE (lib/cron-budget.ts):
 * it stops before this route's maxDuration does and the next tick picks up
 * after the last clinic served. `sweep.completed: false` in the response means
 * the tick ran out of time, not that anything failed — read `sweep.remaining`
 * for how many are waiting.
 */
async function run(request: Request) {
  const denied = requireCronAuth(request)
  if (denied) return denied
  try {
    const result = await runDailyDigest()
    // The platform's own hunt digest rides the same daily tick (separate
    // recipients + content; best-effort so a clinic-digest hiccup and this
    // never take each other down).
    const prospecting = await runProspectingDigest().catch((err) => {
      console.warn('[daily-digest] prospecting digest failed', err)
      return null
    })
    // The weekly standup (Transformation Phase 2) rides the same daily tick:
    // it internally fires only on each clinic's LOCAL Monday, once per week.
    // Best-effort — the narrator never takes the morning to-dos down.
    const standup = await sendWeeklyStandups().catch((err) => {
      console.warn('[daily-digest] weekly standup failed', err)
      return null
    })
    return NextResponse.json({ ok: true, ...result, prospecting, standup })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'unknown' }, { status: 500 })
  }
}

export const POST = run
export const GET = run
