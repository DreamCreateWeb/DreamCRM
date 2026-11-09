import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { runDailyDigest } from '@/lib/services/daily-digest'
import { runProspectingDigest } from '@/lib/services/prospecting-digest'
import { sendWeeklyStandups } from '@/lib/services/standup'
import { reconcileActivationStamps } from '@/lib/services/activation'
import { runMetricSnapshots } from '@/lib/services/metric-snapshot'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** The UTC hour of the platform-global daily jobs (prospecting digest, activation reconcile). */
const PLATFORM_DAILY_UTC_HOUR = 13

/**
 * Morning digest — email each opted-in clinic's staff their follow-ups due,
 * visits to confirm, and new leads, linking back to /my-day. Idempotent per
 * user per day via daily_digest_log; demo clinics skipped; quiet when a person
 * has nothing waiting. CRON_SECRET-gated. Scheduled HOURLY (ML-33): each
 * clinic is mailed once per clinic-local day at or after 7 AM there, keyed by
 * its local day in daily_digest_log (lib/services/daily-digest.ts).
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
    // The platform-global jobs below are NOT clinic-local, so they keep the
    // old once-a-day cadence on their own day-key: they run on the 13:00 UTC
    // tick only (the hour the route used to fire daily).
    const dailyTick = new Date().getUTCHours() === PLATFORM_DAILY_UTC_HOUR
    const prospecting = !dailyTick ? null : await runProspectingDigest().catch((err) => {
      console.warn('[daily-digest] prospecting digest failed', err)
      return null
    })
    // The weekly standup (Transformation Phase 2) rides the same daily tick:
    // it internally fires only on each clinic's LOCAL Monday, once per week.
    // Best-effort — the narrator never takes the morning to-dos down.
    // Hourly now: it gates itself on the clinic's local Monday AND local 7 AM,
    // once per week (standup_last_sent_at), so every tick may call it.
    const standup = await sendWeeklyStandups().catch((err) => {
      console.warn('[daily-digest] weekly standup failed', err)
      return null
    })
    // S8: the activation stamps' daily reconcile — every real clinic with an
    // event still unstamped gets the rails' own first-time written in.
    // Best-effort, same as its siblings.
    const activation = !dailyTick ? null : await reconcileActivationStamps().catch((err) => {
      console.warn('[daily-digest] activation reconcile failed', err)
      return null
    })
    // ML-38: the daily metrics snapshot rides the same hourly tick — each
    // clinic's own local yesterday is recorded on the first tick after its
    // midnight (idempotent upserts; the later ticks cost one read a clinic),
    // plus the platform's UTC day and the hunt's last full UTC hour.
    // Best-effort, like its siblings.
    const metrics = await runMetricSnapshots().catch((err) => {
      console.warn('[daily-digest] metric snapshot failed', err)
      return null
    })
    return NextResponse.json({ ok: true, ...result, prospecting, standup, activation, metrics })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'unknown' }, { status: 500 })
  }
}

export const POST = run
export const GET = run
