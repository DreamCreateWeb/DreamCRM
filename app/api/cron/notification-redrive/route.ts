import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { redriveFailedNotificationEmails } from '@/lib/services/notifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// At most 100 rows a tick, each one network round-trip under `deliver()`'s
// 10s deadline; this leaves the worst case room rather than cutting it off
// mid-row.
export const maxDuration = 300

/**
 * NOTIFICATION RE-DRIVE (ML-32). Every 15 minutes, re-attempt the staff
 * alert emails that the dispatch could not land. The bell row commits first
 * and the email is a network call after it; `notifications.email_sent_at`
 * has recorded "never went out" since DREAMCRM-106, and until this route the
 * only thing that acted on it was a keyed dispatch happening to replay —
 * which nearly no notification is.
 *
 * Bounded: three re-attempts inside 24h, backing off from the row's own
 * `created_at` (5, 10, 20 minutes). Shut-down clinics are skipped; demo orgs
 * never email; a re-attempt that fails bumps that row and reports one strike
 * for that clinic per day (`staff_alert` in lib/services/engine-failures.ts).
 * After the last failure the tray row says "Email didn’t go out".
 *
 * Wiring: EventBridge schedule rule → POST/GET with
 * `Authorization: Bearer ${CRON_SECRET}` (same pattern as the other crons).
 */
async function run(request: Request) {
  const denied = requireCronAuth(request)
  if (denied) return denied
  try {
    const result = await redriveFailedNotificationEmails()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'unknown' }, { status: 500 })
  }
}

export { run as GET, run as POST }
