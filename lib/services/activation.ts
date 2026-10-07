import 'server-only'
import { and, asc, eq, gte, inArray, min, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { ACTIVATION_KEYS, earliestOf, parseActivation, type Activation, type ActivationKey } from '@/lib/activation'
import { A1_PATIENT_FLOOR } from '@/lib/first-week'
import { COHORT_DAYS, computeActivationMetrics, type ActivationMetrics } from '@/lib/activation-metrics'
import { sweepClinics } from '@/lib/services/cron-sweep'
import { openDoorsAtA1 } from '@/lib/services/feature-switches'
import { FEATURE_BY_KEY, doorsOpenedBy, parseDoorsClosed } from '@/lib/feature-switches'
import type { SweepProgress } from '@/lib/cron-budget'

/**
 * Activation stamps (docs/ACTIVATION.md Part 3). ONE write per key per
 * clinic, ever: `stampActivation` sets `activation->key` only where it is
 * still missing, and the RETURNING row is the atomic answer to "did this
 * call stamp it" — which is exactly the question the day-one kick asks
 * ("is this the first time?"), with no read-then-write race between two
 * imports landing at once.
 */

/** The jsonb merge fragment — exported so the boundary test can render it through drizzle's own dialect. */
export function stampFragment(key: ActivationKey, at: Date) {
  return sql`coalesce(${schema.clinicProfile.activation}, '{}'::jsonb) || jsonb_build_object(${key}::text, to_jsonb(${at.toISOString()}::text))`
}

/** The write-once guard: the key is still unset. */
export function unstampedGuard(key: ActivationKey) {
  return sql`(${schema.clinicProfile.activation} is null or ${schema.clinicProfile.activation}->>${key}::text is null)`
}

/** True iff THIS call stamped the key (it was unset); false when already stamped or the org has no profile row. Never throws. */
export async function stampActivation(organizationId: string, key: ActivationKey, at: Date = new Date()): Promise<boolean> {
  try {
    const rows = await db
      .update(schema.clinicProfile)
      .set({ activation: stampFragment(key, at) })
      .where(and(eq(schema.clinicProfile.organizationId, organizationId), unstampedGuard(key)))
      .returning({ organizationId: schema.clinicProfile.organizationId })
    return rows.length > 0
  } catch (e) {
    console.error('[activation] stamp failed:', e)
    return false
  }
}

export async function getActivationStamps(organizationId: string): Promise<Activation> {
  try {
    const [row] = await db
      .select({ activation: schema.clinicProfile.activation })
      .from(schema.clinicProfile)
      .where(eq(schema.clinicProfile.organizationId, organizationId))
      .limit(1)
    return parseActivation(row?.activation)
  } catch {
    return parseActivation(null)
  }
}

// ── The derived read (moved here from first-week.ts in S8) ────────────────

/** Bookings that came THROUGH us (not typed in by staff, not mirrored from the PMS). */
const OUR_BOOKING_SOURCES = ['booking_widget', 'recall_campaign', 'invite', 'portal']

/** A failed rail read is recorded by its KEY, so a key with any unread source is never stamped from the rest (audit round 2). */
function safeFor(failed: Set<ActivationKey>) {
  return async function safe<T>(key: ActivationKey, label: string, fallback: T, read: () => Promise<T>): Promise<T> {
    try {
      return await read()
    } catch (e) {
      console.error(`[activation] ${label} failed:`, e)
      failed.add(key)
      return fallback
    }
  }
}

async function earliest(read: () => Promise<Array<{ at: Date | string | null }>>): Promise<Date | null> {
  const rows = await read()
  const at = rows[0]?.at
  return at ? new Date(at) : null
}

/** The five activation events, each the FIRST time it happened, read from the rails that already record it. */
export async function readActivation(organizationId: string): Promise<Activation> {
  return (await readActivationDetailed(organizationId)).activation
}

/**
 * The derived read plus WHICH KEYS had a source that could not be read:
 * "unreadable ≠ empty" — a key with one unread rail is incomplete, and the
 * reconcile skips it rather than freezing a later instant in through the
 * write-once guard (audit round 2).
 */
export async function readActivationDetailed(organizationId: string): Promise<{ activation: Activation; incomplete: ActivationKey[] }> {
  const ev = schema.campaignEvents
  const failed = new Set<ActivationKey>()
  const safe = safeFor(failed)
  const [pmsAt, gbpAt, patientFloorAt, reminderAt, campaignAt, staffMessageAt, bookingAt, reviewAt, formAt] = await Promise.all([
    safe('a1', 'a1.pms', null, () =>
      earliest(() =>
        db
          .select({ at: min(schema.pmsConnection.createdAt) })
          .from(schema.pmsConnection)
          .where(and(eq(schema.pmsConnection.organizationId, organizationId), eq(schema.pmsConnection.status, 'connected')))
          .limit(1),
      ),
    ),
    // The Google connect's own instant is the GBP ACCOUNT row's connectedAt
    // (audit round 2): the zernio_connection row is minted at the start of
    // ANY connect attempt, social included, days before the OAuth finishes.
    safe('a1', 'a1.gbp', null, () =>
      earliest(() =>
        db
          .select({ at: min(schema.zernioAccount.connectedAt) })
          .from(schema.zernioAccount)
          .where(and(eq(schema.zernioAccount.organizationId, organizationId), eq(schema.zernioAccount.platform, 'googlebusiness')))
          .limit(1),
      ),
    ),
    safe('a1', 'a1.patients', null, () =>
      earliest(() =>
        db
          .select({ at: schema.patient.createdAt })
          .from(schema.patient)
          .where(eq(schema.patient.organizationId, organizationId))
          .orderBy(asc(schema.patient.createdAt))
          .offset(A1_PATIENT_FLOOR - 1)
          .limit(1),
      ),
    ),
    safe('a2', 'a2.reminders', null, () =>
      earliest(() =>
        db
          .select({ at: min(schema.appointmentReminderLog.sentAt) })
          .from(schema.appointmentReminderLog)
          .where(eq(schema.appointmentReminderLog.organizationId, organizationId))
          .limit(1),
      ),
    ),
    safe('a2', 'a2.campaigns', null, () =>
      earliest(() =>
        db
          .select({ at: min(ev.occurredAt) })
          .from(ev)
          .innerJoin(schema.campaigns, eq(schema.campaigns.id, ev.campaignId))
          .where(and(eq(schema.campaigns.organizationId, organizationId), eq(ev.type, 'sent')))
          .limit(1),
      ),
    ),
    // Part 3: "any channel, any sender incl. the machine" — a staff reply
    // from /messages is a first message too (audit round 1).
    safe('a2', 'a2.messages', null, () =>
      earliest(() =>
        db
          .select({ at: min(schema.patientMessage.sentAt) })
          .from(schema.patientMessage)
          .where(and(eq(schema.patientMessage.organizationId, organizationId), eq(schema.patientMessage.direction, 'outbound')))
          .limit(1),
      ),
    ),
    safe('a3', 'a3', null, () =>
      earliest(() =>
        db
          .select({ at: min(schema.appointment.createdAt) })
          .from(schema.appointment)
          .where(and(eq(schema.appointment.organizationId, organizationId), inArray(schema.appointment.source, OUR_BOOKING_SOURCES)))
          .limit(1),
      ),
    ),
    safe('a4', 'a4', null, () =>
      earliest(() =>
        db
          .select({ at: min(schema.reviewRequest.sentAt) })
          .from(schema.reviewRequest)
          .where(eq(schema.reviewRequest.organizationId, organizationId))
          .limit(1),
      ),
    ),
    safe('a5', 'a5', null, () =>
      earliest(() =>
        db
          .select({ at: min(schema.formSubmission.submittedAt) })
          .from(schema.formSubmission)
          .where(eq(schema.formSubmission.organizationId, organizationId))
          .limit(1),
      ),
    ),
  ])
  return {
    activation: {
      a1: earliestOf(pmsAt, gbpAt, patientFloorAt),
      a2: earliestOf(reminderAt, campaignAt, staffMessageAt),
      a3: bookingAt,
      a4: reviewAt,
      a5: formAt,
    },
    incomplete: ACTIVATION_KEYS.filter((k) => failed.has(k)),
  }
}

// ── S8: stamped, and measured ─────────────────────────────────────────────

/**
 * THE ONE STAMPING MECHANISM for A2–A5 (and A1 where the kick never ran):
 * the rails that already record each event are the truth, and the stamp is
 * the durable, cheap-to-read copy of it. For every key still unset, read the
 * FIRST time it happened and write that instant — not now — so a stamp made
 * a day late still carries the true time. Write-once by construction
 * (`stampActivation`'s guard); never throws. Returns the keys this call
 * stamped.
 *
 * Why not stamp at every send/booking/submission site: those are six-plus
 * writers across reminders, campaigns, three booking paths, review asks and
 * forms, and a stamp site missed is an event never counted. One reconcile
 * that reads the rails cannot miss one, and it backfills every clinic that
 * predates stamping for free.
 */
export async function reconcileActivation(organizationId: string, now: Date = new Date()): Promise<ActivationKey[]> {
  return (await reconcileActivationDetailed(organizationId, now)).stamped
}

/** The reconcile plus the keys it could NOT judge (a source unread) — the kick reads this so it never stamps "now" over an unread rail. */
export async function reconcileActivationDetailed(
  organizationId: string,
  now: Date = new Date(),
): Promise<{ stamped: ActivationKey[]; incomplete: ActivationKey[] }> {
  try {
    const stamps = await getActivationStamps(organizationId)
    const missing = ACTIVATION_KEYS.filter((k) => stamps[k] == null)
    if (missing.length === 0) return { stamped: [], incomplete: [] }
    const { activation: derived, incomplete } = await readActivationDetailed(organizationId)
    const stamped: ActivationKey[] = []
    for (const key of missing) {
      if (incomplete.includes(key)) continue
      const at = derived[key]
      if (!at || at.getTime() > now.getTime()) continue
      if (await stampActivation(organizationId, key, at)) stamped.push(key)
    }
    return { stamped, incomplete }
  } catch (e) {
    console.error('[activation] reconcile failed:', e)
    return { stamped: [], incomplete: [...ACTIVATION_KEYS] }
  }
}

export interface ReconcileRunResult {
  scanned: number
  stamped: Record<ActivationKey, number>
  errors: number
  sweep: SweepProgress
}

/**
 * The daily pass (rides the daily-digest tick): every real clinic with a key
 * still unset gets reconciled. Clinics with all five stamped cost one row
 * read and nothing else. Budgeted + resumable like the other daily walks.
 */
export async function reconcileActivationStamps(opts: { now?: Date } = {}): Promise<ReconcileRunResult> {
  const now = opts.now ?? new Date()
  const stamped: Record<ActivationKey, number> = { a1: 0, a2: 0, a3: 0, a4: 0, a5: 0 }
  let scanned = 0
  let errors = 0
  const rows = await db
    .select({
      orgId: schema.organization.id,
      activation: schema.clinicProfile.activation,
      myDayEnabledAt: schema.clinicProfile.myDayEnabledAt,
      followupsEnabledAt: schema.clinicProfile.followupsEnabledAt,
      doorsClosed: schema.clinicProfile.doorsClosed,
    })
    .from(schema.organization)
    .innerJoin(schema.clinicProfile, eq(schema.clinicProfile.organizationId, schema.organization.id))
    .where(and(eq(schema.organization.type, 'clinic'), eq(schema.organization.isDemo, false)))
  // Due: something unstamped — OR an A1 already on file whose doors never
  // opened and were never closed (round 3's self-sweep: a clinic whose A1
  // the daily pass stamped BEFORE the pass opened doors, with no later
  // kick to offer them — a bookings-only roster — would wait forever).
  const a1DoorsOwed = (r: (typeof rows)[number]) => {
    if (parseActivation(r.activation).a1 == null) return false
    const closed = parseDoorsClosed(r.doorsClosed)
    return doorsOpenedBy('a1').some((k) => r[FEATURE_BY_KEY[k].column as 'myDayEnabledAt' | 'followupsEnabledAt'] == null && !closed[k])
  }
  const due = rows.filter((r) => ACTIVATION_KEYS.some((k) => parseActivation(r.activation)[k] == null) || a1DoorsOwed(r))
  const sweep = await sweepClinics(
    'activation-reconcile',
    due,
    (r) => r.orgId,
    async (r) => {
      scanned++
      const keys = await reconcileActivation(r.orgId, now)
      for (const k of keys) stamped[k]++
      // A1 reached through the daily pass opens the A1 doors too (audit
      // round 2: the kick was the only caller, so a roster that crossed the
      // floor by bookings never got My Day / Follow-ups) — and so does an
      // A1 already on file whose doors are still owed. Honors a close.
      if (keys.includes('a1') || a1DoorsOwed(r)) await openDoorsAtA1(r.orgId, now)
    },
    { onError: () => { errors++ } },
  )
  return { scanned, stamped, errors, sweep }
}

export interface ActivationMetricsRead extends ActivationMetrics {
  /** The read FAILED — the numbers are empty, not zero. */
  unreadable: boolean
}

/** The cohort's numbers from the STAMPS (kept current by the reconcile), demo excluded. Never throws. */
export async function getActivationMetrics(opts: { now?: Date; cohortDays?: number } = {}): Promise<ActivationMetricsRead> {
  const now = opts.now ?? new Date()
  const cohortDays = opts.cohortDays ?? COHORT_DAYS
  try {
    const since = new Date(now.getTime() - cohortDays * 24 * 60 * 60 * 1000)
    const rows = await db
      .select({ createdAt: schema.organization.createdAt, activation: schema.clinicProfile.activation })
      .from(schema.organization)
      .innerJoin(schema.clinicProfile, eq(schema.clinicProfile.organizationId, schema.organization.id))
      .where(and(eq(schema.organization.type, 'clinic'), eq(schema.organization.isDemo, false), gte(schema.organization.createdAt, since)))
    const metrics = computeActivationMetrics(
      rows.map((r) => ({ createdAt: new Date(r.createdAt), activation: parseActivation(r.activation) })),
      now,
      cohortDays,
    )
    return { ...metrics, unreadable: false }
  } catch (e) {
    console.error('[activation] metrics read failed:', e)
    return { ...computeActivationMetrics([], now, cohortDays), unreadable: true }
  }
}
