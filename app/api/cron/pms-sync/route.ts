import { NextResponse } from 'next/server'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { runImport } from '@/lib/services/pms/sync'
import { sendNotificationEmail } from '@/lib/email'
import { notifyOrgMembers } from '@/lib/services/notifications'
import { reportAutomationFailure } from '@/lib/services/engine-failures'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Cron-wide soft deadline (kept under maxDuration) + a per-org cap, so one
// huge first import can't starve every other clinic in a single invocation.
// A budget-capped org just resumes next hour from its parked cursor.
const CRON_BUDGET_MS = 250_000
const PER_ORG_BUDGET_MS = 90_000

// NexHealth calls are metered ($0.10 past the free tier) and `updated_since`
// deltas mean a sync's cost is per-RUN, not per-row — so halving the run
// cadence halves the steady-state bill. The gate: skip a NexHealth org whose
// last sync landed under ~105 minutes ago, which lands them on every OTHER
// hourly tick (~2h cadence). 105 rather than 120 so EventBridge jitter can't
// make an org alternate between 2h and 3h gaps. Open Dental (self-hosted,
// free calls) keeps the hourly cadence; the manual "Sync now" button is a
// different code path and is never gated.
const NEXHEALTH_MIN_INTERVAL_MS = 105 * 60 * 1000

/** Pure cadence rule, exported for tests. */
export function shouldSkipForCadence(
  provider: string,
  lastSyncAt: Date | null,
  now: Date = new Date(),
): boolean {
  if (provider !== 'nexhealth') return false
  if (!lastSyncAt) return false // never synced — run immediately
  return now.getTime() - lastSyncAt.getTime() < NEXHEALTH_MIN_INTERVAL_MS
}

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
      .select({
        organizationId: schema.pmsConnection.organizationId,
        provider: schema.pmsConnection.provider,
        lastSyncAt: schema.pmsConnection.lastSyncAt,
      })
      .from(schema.pmsConnection)
      .where(
        and(eq(schema.pmsConnection.status, 'connected'), eq(schema.pmsConnection.autoSyncEnabled, 1)),
      )

    const results: Array<{ organizationId: string; status: string; error: string | null; alerted: boolean; resuming?: boolean }> = []
    let succeeded = 0
    let failed = 0
    let resuming = 0
    let deferred = 0
    let skipped = 0

    // THE KILL (owner ruling): a shut-down clinic's PMS sync stops — for
    // NexHealth every poll is metered money spent on a dead account. Paying
    // resumes the sync on the next tick; the delta mark parks untouched.
    const { listShutDownOrgIds } = await import('@/lib/services/billing-state')
    const shutDown = await listShutDownOrgIds()

    // PENDING WRITES OVERRIDE THE CADENCE (write-back v1): the queue only
    // flushes inside a sync run, so the cost-saving every-other-tick rhythm
    // would make a queued booking — or worse, a CANCELLATION — wait up to
    // ~2h. A pending write is patient-facing state the practice's schedule
    // is wrong about; the next hourly tick must carry it.
    let pendingWriteOrgs = new Set<string>()
    try {
      const rows = await db
        .selectDistinct({ organizationId: schema.pmsWriteOp.organizationId })
        .from(schema.pmsWriteOp)
        .where(inArray(schema.pmsWriteOp.status, ['pending', 'error']))
      pendingWriteOrgs = new Set(rows.map((r) => r.organizationId))
    } catch {
      /* unreadable → no override; writes flush on the normal cadence */
    }

    const cronDeadline = Date.now() + CRON_BUDGET_MS
    for (const conn of connections) {
      if (shutDown.has(conn.organizationId)) {
        skipped++
        continue
      }
      // Metered-provider cadence gate (see NEXHEALTH_MIN_INTERVAL_MS above).
      if (
        shouldSkipForCadence(conn.provider, conn.lastSyncAt) &&
        !pendingWriteOrgs.has(conn.organizationId)
      ) {
        skipped++
        continue
      }
      // Out of cron time — leave the rest for next hour (their cursors, if any,
      // are already parked, so nothing is lost).
      if (Date.now() >= cronDeadline) {
        deferred++
        continue
      }
      const orgBudget = Math.min(PER_ORG_BUDGET_MS, cronDeadline - Date.now())
      try {
        const r = await runImport(conn.organizationId, { trigger: 'scheduled', softBudgetMs: orgBudget })
        // A budget-capped run (resumeAvailable) is HEALTHY progress, not a
        // failure — it must not trip the failure-streak alert. Only a real
        // error / data-skip partial alerts.
        const isRealFailure = r.status === 'error' || (r.status === 'partial' && !r.resumeAvailable)
        const alerted = isRealFailure ? await maybeAlertFailure(conn.organizationId) : false
        // TELL THE GUARDIAN (Phase 4 open item #1). `maybeAlertFailure` is
        // the PMS module's own streak email; this is the ledger entry the
        // Guardian counts, so a practice whose bridge has been down for days
        // stops reporting `healthy`. Only on a REAL failure — a
        // budget-capped resume is healthy progress, and calling it a break
        // would be the crying-wolf shape this phase keeps refusing.
        if (isRealFailure) await reportAutomationFailure(conn.organizationId, 'pms_sync')
        if (r.resumeAvailable) resuming++
        else if (r.status === 'success') succeeded++
        else failed++
        results.push({ organizationId: conn.organizationId, status: r.status, error: r.error, alerted, resuming: r.resumeAvailable })
      } catch (err) {
        // A throw here means runImport bailed BEFORE writing a sync_run row —
        // usually transient/benign (the concurrency guard saw an overlapping
        // run) or a config issue (no Customer Key). We don't alert on it (the
        // streak rule keys off real sync_run rows, and an overlap isn't a
        // failure); just record it and keep the loop going so one bad org can't
        // stop the rest.
        failed++
        const message = err instanceof Error ? err.message : 'unknown'
        results.push({ organizationId: conn.organizationId, status: 'error', error: message, alerted: false })
      }
    }

    return NextResponse.json({ ok: true, scanned: connections.length, succeeded, failed, resuming, deferred, skipped, results })
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
