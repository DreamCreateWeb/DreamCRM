import 'server-only'
import { and, asc, eq, inArray, max, min, ne } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import {
  A1_PATIENT_FLOOR,
  activationProgress,
  dayNumber,
  stageOf,
  stuckFlags,
  type Activation,
  type ActivationKey,
  type FirstWeekRowInput,
} from '@/lib/first-week'
import { earliestOf, parseActivation } from '@/lib/activation'
import { listClinics } from '@/lib/services/clinics'
import { getReadinessReport } from '@/lib/services/readiness'
import { listActiveGoals } from '@/lib/services/goals'
import { listOpenProposals } from '@/lib/services/proposals'
import { countActionsSince } from '@/lib/services/action-ledger'
import { getSmsRegistration, smsDriver } from '@/lib/services/sms-registration'
import { getPmsConnectRequest } from '@/lib/services/pms-connect'
import { pmsVendorLabel } from '@/lib/pms-connect'
import type { ReadinessFact } from '@/lib/readiness'

/**
 * THE FIRST WEEK — the platform cockpit's service (docs/ACTIVATION.md
 * Part 5, slice S1). One row per clinic: where they are in their first
 * thirty days, what is connected (the readiness resolver's own facts),
 * what the machine did, when staff last signed in, which activation
 * events have happened, and why they are stuck.
 *
 * READ-TIME, BEST-EFFORT, PER CLINIC. Nothing is stored (S8 stamps the
 * activation events later); every read is wrapped so one clinic's broken
 * read never blanks the board for the others — a missing fact renders as
 * unknown, never as healthy. The demo clinic is excluded by default: its
 * seeded data would make it the only "activated" clinic on the list.
 */

/** The readiness facts the cockpit shows, in this order. */
export const SHOWN_FACTS: ReadonlyArray<ReadinessFact['id']> = ['pms', 'patients', 'gbp', 'inbox', 'payments', 'sms', 'hours', 'booking']

/** Bookings that came THROUGH us (not typed in by staff, not mirrored from the PMS). */
const OUR_BOOKING_SOURCES = ['booking_widget', 'recall_campaign', 'invite', 'portal']

/** Carrier-side SMS states: the door is pending on us (and the carriers), not the clinic. */
const SMS_PENDING_ON_US = new Set(['brand_pending', 'campaign_pending', 'number_pending', 'suspended'])

export interface FirstWeekRow extends FirstWeekRowInput {
  orgId: string
  name: string
  slug: string
  isDemo: boolean
  day: number
  stage: ReturnType<typeof stageOf>
  subscriptionStatus: string | null
  billingMode: string | null
  goal: string | null
  facts: Array<{ id: string; label: string; grade: string; summary: string; href: string }>
  doors: { insurance: boolean; digest: boolean; siteLive: boolean }
  smsState: string | null
  /** The clinic asked us to connect their PMS (S4) and the bridge is not bound yet. */
  pmsRequest: { vendor: string; status: string; at: Date } | null
  progress: { done: ActivationKey[]; next: ActivationKey | null }
  stuck: string[]
}

export interface FirstWeekBoard {
  rows: FirstWeekRow[]
  generatedAt: Date
  counts: { inFirstMonth: number; stuck: number; noData: number }
}

async function safe<T>(label: string, fallback: T, read: () => Promise<T>): Promise<T> {
  try {
    return await read()
  } catch (e) {
    console.error(`[first-week] ${label} failed:`, e)
    return fallback
  }
}

async function earliest(read: () => Promise<Array<{ at: Date | string | null }>>): Promise<Date | null> {
  const rows = await read()
  const at = rows[0]?.at
  return at ? new Date(at) : null
}

const EMPTY_ACTIVATION: Activation = { a1: null, a2: null, a3: null, a4: null, a5: null }

/** The five activation events, each the FIRST time it happened, read from the rails that already record it. */
export async function readActivation(organizationId: string): Promise<Activation> {
  const ev = schema.campaignEvents
  const [pmsAt, gbpAt, patientFloorAt, reminderAt, campaignAt, bookingAt, reviewAt, formAt] = await Promise.all([
    safe('a1.pms', null, () =>
      earliest(() =>
        db
          .select({ at: min(schema.pmsConnection.createdAt) })
          .from(schema.pmsConnection)
          .where(and(eq(schema.pmsConnection.organizationId, organizationId), eq(schema.pmsConnection.status, 'connected')))
          .limit(1),
      ),
    ),
    safe('a1.gbp', null, () =>
      earliest(() =>
        db
          .select({ at: min(schema.zernioConnection.createdAt) })
          .from(schema.zernioConnection)
          .where(and(eq(schema.zernioConnection.organizationId, organizationId), eq(schema.zernioConnection.status, 'connected')))
          .limit(1),
      ),
    ),
    safe('a1.patients', null, () =>
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
    safe('a2.reminders', null, () =>
      earliest(() =>
        db
          .select({ at: min(schema.appointmentReminderLog.sentAt) })
          .from(schema.appointmentReminderLog)
          .where(eq(schema.appointmentReminderLog.organizationId, organizationId))
          .limit(1),
      ),
    ),
    safe('a2.campaigns', null, () =>
      earliest(() =>
        db
          .select({ at: min(ev.occurredAt) })
          .from(ev)
          .innerJoin(schema.campaigns, eq(schema.campaigns.id, ev.campaignId))
          .where(and(eq(schema.campaigns.organizationId, organizationId), eq(ev.type, 'sent')))
          .limit(1),
      ),
    ),
    safe('a3', null, () =>
      earliest(() =>
        db
          .select({ at: min(schema.appointment.createdAt) })
          .from(schema.appointment)
          .where(and(eq(schema.appointment.organizationId, organizationId), inArray(schema.appointment.source, OUR_BOOKING_SOURCES)))
          .limit(1),
      ),
    ),
    safe('a4', null, () =>
      earliest(() =>
        db
          .select({ at: min(schema.reviewRequest.sentAt) })
          .from(schema.reviewRequest)
          .where(eq(schema.reviewRequest.organizationId, organizationId))
          .limit(1),
      ),
    ),
    safe('a5', null, () =>
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
    a1: earliestOf(pmsAt, gbpAt, patientFloorAt),
    a2: earliestOf(reminderAt, campaignAt),
    a3: bookingAt,
    a4: reviewAt,
    a5: formAt,
  }
}

/** A stamp (written once when the event happened) beats the derived read; the derived read fills in before stamping existed. */
function mergeActivation(stamps: Activation, derived: Activation): Activation {
  return { a1: stamps.a1 ?? derived.a1, a2: stamps.a2 ?? derived.a2, a3: stamps.a3 ?? derived.a3, a4: stamps.a4 ?? derived.a4, a5: stamps.a5 ?? derived.a5 }
}

/** The newest session of any non-patient member — "when did a human last open it". */
async function lastStaffSignIn(organizationId: string): Promise<Date | null> {
  return safe('sign-in', null, () =>
    earliest(() =>
      db
        .select({ at: max(schema.session.updatedAt) })
        .from(schema.session)
        .innerJoin(schema.member, eq(schema.member.userId, schema.session.userId))
        .where(and(eq(schema.member.organizationId, organizationId), ne(schema.member.role, 'patient')))
        .limit(1),
    ),
  )
}

async function buildRow(
  clinic: { orgId: string; name: string; slug: string; isDemo: boolean; createdAt: Date; patientCount: number; subscriptionStatus: string | null; billingMode?: string | null },
  now: Date,
): Promise<FirstWeekRow> {
  const since7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const [report, goals, open, work, profile, sms, pms, signIn, activation, pmsRequest] = await Promise.all([
    safe('readiness', null, () => getReadinessReport(clinic.orgId)),
    safe('goals', [], () => listActiveGoals(clinic.orgId)),
    safe('proposals', [], () => listOpenProposals(clinic.orgId, 50)),
    safe('ledger', {} as Record<string, number>, () => countActionsSince(clinic.orgId, since7, { until: now })),
    safe('profile', null, async () => {
      const [p] = await db
        .select({
          insurance: schema.clinicProfile.insuranceEnabledAt,
          digest: schema.clinicProfile.dailyDigestEnabled,
          siteLive: schema.clinicProfile.siteLiveAt,
          activation: schema.clinicProfile.activation,
        })
        .from(schema.clinicProfile)
        .where(eq(schema.clinicProfile.organizationId, clinic.orgId))
        .limit(1)
      return p ?? null
    }),
    safe('sms', null, async () => {
      if (smsDriver() === 'none') return null
      const view = await getSmsRegistration(clinic.orgId)
      const [cfg] = await db
        .select({ updatedAt: schema.clinicSmsConfig.updatedAt })
        .from(schema.clinicSmsConfig)
        .where(eq(schema.clinicSmsConfig.organizationId, clinic.orgId))
        .limit(1)
      return { state: view.state, since: cfg?.updatedAt ?? null }
    }),
    safe('pms', null, async () => {
      const [c] = await db
        .select({ status: schema.pmsConnection.status, since: schema.pmsConnection.updatedAt })
        .from(schema.pmsConnection)
        .where(eq(schema.pmsConnection.organizationId, clinic.orgId))
        .limit(1)
      return c ?? null
    }),
    lastStaffSignIn(clinic.orgId),
    readActivation(clinic.orgId),
    safe('pmsRequest', null, () => getPmsConnectRequest(clinic.orgId)),
  ])

  const facts = SHOWN_FACTS.map((id) => report?.facts.find((f) => f.id === id)).filter((f): f is ReadinessFact => !!f)
  const oldestOpen = open.reduce<Date | null>((acc, p) => (acc == null || p.createdAt < acc ? p.createdAt : acc), null)
  const pendingOnUs: FirstWeekRowInput['pendingOnUs'] = []
  if (pms && pms.status !== 'connected' && pms.status !== 'not_connected') pendingOnUs.push({ label: 'The PMS connection', since: pms.since })
  // The clinic asked (S4's front door) and nothing is bound yet: ours.
  const openRequest =
    pmsRequest && pms?.status !== 'connected' && (pmsRequest.status === 'requested' || pmsRequest.status === 'scheduled') ? pmsRequest : null
  if (openRequest) pendingOnUs.push({ label: `Connecting ${pmsVendorLabel(openRequest.vendor, openRequest.vendorName)}`, since: openRequest.updatedAt })
  if (sms && SMS_PENDING_ON_US.has(sms.state) && sms.since) pendingOnUs.push({ label: 'Texting (carriers)', since: sms.since })

  const input: FirstWeekRowInput = {
    createdAt: clinic.createdAt,
    facts: facts.map((f) => ({ id: f.id, grade: f.grade })),
    patientCount: clinic.patientCount,
    workLast7: Object.values(work).reduce((a, b) => a + b, 0),
    openCards: open.length,
    oldestOpenCardAt: oldestOpen,
    lastStaffSignInAt: signIn,
    activation: mergeActivation(parseActivation(profile?.activation), activation ?? EMPTY_ACTIVATION),
    pendingOnUs,
  }
  return {
    ...input,
    orgId: clinic.orgId,
    name: clinic.name,
    slug: clinic.slug,
    isDemo: clinic.isDemo,
    day: dayNumber(clinic.createdAt, now),
    stage: stageOf(input, now),
    subscriptionStatus: clinic.subscriptionStatus,
    billingMode: clinic.billingMode ?? null,
    goal: goals[0]?.objective ?? null,
    facts: facts.map((f) => ({ id: f.id, label: f.label, grade: f.grade, summary: f.summary, href: f.href })),
    doors: { insurance: profile?.insurance != null, digest: profile?.digest === 1, siteLive: profile?.siteLive != null },
    smsState: sms?.state ?? null,
    pmsRequest: openRequest ? { vendor: pmsVendorLabel(openRequest.vendor, openRequest.vendorName), status: openRequest.status, at: openRequest.updatedAt } : null,
    progress: activationProgress(input.activation),
    stuck: stuckFlags(input, now),
  }
}

export async function getFirstWeekBoard(opts: { now?: Date; includeDemo?: boolean } = {}): Promise<FirstWeekBoard> {
  const now = opts.now ?? new Date()
  const clinics = (await listClinics()).filter((c) => opts.includeDemo || !c.isDemo)
  const rows = await Promise.all(clinics.map((c) => buildRow(c, now)))
  // Stuck first (most reasons first), then newest.
  rows.sort((a, b) => b.stuck.length - a.stuck.length || b.createdAt.getTime() - a.createdAt.getTime())
  return {
    rows,
    generatedAt: now,
    counts: {
      inFirstMonth: rows.filter((r) => r.day < 30).length,
      stuck: rows.filter((r) => r.stuck.length > 0).length,
      noData: rows.filter((r) => r.activation.a1 == null).length,
    },
  }
}
