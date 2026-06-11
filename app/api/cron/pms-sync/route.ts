import { NextResponse } from 'next/server'
import { and, desc, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { runImport } from '@/lib/services/pms/sync'
import { sendNotificationEmail } from '@/lib/email'
import { notifyOrgMembers } from '@/lib/services/notifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * Scheduled PMS auto-sync. Until now `runImport` was only ever called from the
 * manual "Sync now" button, so the `pms_connection.autoSyncEnabled` toggle was
 * read by nothing and DreamCRM-originated bookings only reached Open Dental
 * when staff happened to click sync. This cron makes the toggle real: every org
 * with an active, auto-sync-enabled connection gets imported (which also flushes
 * the outbound write-op queue) on a schedule.
 *
 * Triggered hourly by EventBridge; guarded by CRON_SECRET (same pattern as
 * auto-send-reviews). The 15-min concurrency guard inside `runImport` makes an
 * overlapping run safe, so the cadence is forgiving.
 *
 * On a scheduled run that ENDS in failure we also alert the clinic — once per
 * failure streak — so a silently-broken sync (the #1 reliability complaint in
 * the integrations research) surfaces instead of rotting.
 *
 * Returns per-org results JSON so a future ops dashboard can read batch health.
 */
async function run(request: Request) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const connections = await db
      .select({ organizationId: schema.pmsConnection.organizationId, provider: schema.pmsConnection.provider })
      .from(schema.pmsConnection)
      .where(
        and(eq(schema.pmsConnection.status, 'connected'), eq(schema.pmsConnection.autoSyncEnabled, 1)),
      )

    const results: Array<{ organizationId: string; status: string; error: string | null; alerted: boolean }> = []
    let succeeded = 0
    let failed = 0

    for (const conn of connections) {
      try {
        const r = await runImport(conn.organizationId, { trigger: 'scheduled' })
        const alerted = r.status === 'error' || r.status === 'partial'
          ? await maybeAlertFailure(conn.organizationId)
          : false
        if (r.status === 'success') succeeded++
        else failed++
        results.push({ organizationId: conn.organizationId, status: r.status, error: r.error, alerted })
      } catch (err) {
        // A throw here means runImport bailed BEFORE writing a sync_run row —
        // usually transient/benign (the 15-min concurrency guard saw an
        // overlapping run) or a config issue (no Customer Key). We don't
        // alert on it (the streak rule keys off real sync_run rows, and an
        // overlap isn't a failure); just record it and keep the loop going so
        // one bad org can't stop the rest.
        failed++
        const message = err instanceof Error ? err.message : 'unknown'
        results.push({ organizationId: conn.organizationId, status: 'error', error: message, alerted: false })
      }
    }

    return NextResponse.json({ ok: true, scanned: connections.length, succeeded, failed, results })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'unknown' }, { status: 500 })
  }
}

// Matches health.ts STREAK_THRESHOLD (the point at which a run streak is
// classified `repeated_failure`). Kept in sync deliberately.
const REPEATED_FAILURE_THRESHOLD = 3

/**
 * Count consecutive non-success runs from most-recent backwards. `runImport`
 * has already written this run's row, so runs[0] is the run we just did.
 * Mirrors the consecutive-failure logic in deriveIntegrationsHealth.
 */
export function consecutiveFailuresFrom(runs: Array<{ status: string }>): number {
  let n = 0
  for (const r of runs) {
    if (r.status === 'error' || r.status === 'partial') n++
    else break
  }
  return n
}

/**
 * Decide whether THIS failure should alert the clinic. Deterministic + de-duped
 * per streak so a persistently-broken connection doesn't email every hour:
 * alert only when this is the FIRST failure after a good run (streak start) OR
 * exactly the 3rd consecutive failure (the `repeated_failure` threshold the
 * health module uses). At all other points in a streak we stay quiet.
 *
 * Exported pure so the rule is unit-testable without a DB.
 */
export function shouldAlertForFailureStreak(consecutiveFailures: number): boolean {
  return consecutiveFailures === 1 || consecutiveFailures === REPEATED_FAILURE_THRESHOLD
}

async function maybeAlertFailure(organizationId: string): Promise<boolean> {
  const runs = await db
    .select({ status: schema.pmsSyncRun.status })
    .from(schema.pmsSyncRun)
    .where(eq(schema.pmsSyncRun.organizationId, organizationId))
    .orderBy(desc(schema.pmsSyncRun.startedAt))
    .limit(5)

  if (!shouldAlertForFailureStreak(consecutiveFailuresFrom(runs))) return false
  await sendFailureAlert(organizationId)
  return true
}

async function sendFailureAlert(organizationId: string): Promise<void> {
  const title = 'PMS sync is failing — bookings may not be reaching Open Dental'
  const body =
    "DreamCRM's automatic sync with your practice management system just failed. " +
    'New online bookings may not be reaching Open Dental, and patient data here may be stale. ' +
    'Open Integrations to run a manual sync or check the connection.'

  // In-app + (preference-gated) email to every owner/admin.
  await notifyOrgMembers(
    organizationId,
    {
      bucket: 'candidates',
      type: 'pms_sync_failing',
      title,
      body,
      linkPath: '/integrations',
    },
    { roles: ['owner', 'admin'] },
  )

  // Plus a direct email to the clinic's contact address (clinic_profile.email)
  // — covers the case where no member has email notifications on. Best-effort.
  try {
    const [profile] = await db
      .select({ email: schema.clinicProfile.email, displayName: schema.clinicProfile.displayName })
      .from(schema.clinicProfile)
      .where(eq(schema.clinicProfile.organizationId, organizationId))
      .limit(1)
    if (profile?.email) {
      await sendNotificationEmail({
        to: profile.email,
        name: profile.displayName ?? null,
        title,
        body,
        linkPath: '/integrations',
      })
    }
  } catch (err) {
    console.warn('[cron/pms-sync] clinic-email alert failed', err)
  }
}

export const POST = run
export const GET = run
