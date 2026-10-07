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
import { getActivationStamps, readActivation } from '@/lib/services/activation'

/** The derived read lives beside the stamps now (S8); re-exported so nothing that imported it from here moves. */
export { readActivation }
import { listClinics } from '@/lib/services/clinics'
import { getReadinessReport } from '@/lib/services/readiness'
import { listActiveGoals } from '@/lib/services/goals'
import { listOpenProposals } from '@/lib/services/proposals'
import { countActionsSince } from '@/lib/services/action-ledger'
import { getSmsRegistration, smsDriver } from '@/lib/services/sms-registration'
import { getPmsConnectRequest, type PmsConnectRequestView } from '@/lib/services/pms-connect'
import { pmsVendorLabel } from '@/lib/pms-connect'
import { FEATURE_SWITCHES, type FeatureKey } from '@/lib/feature-switches'
import { getFeatureSwitchState } from '@/lib/services/feature-switches'
import { getClinicTimeZone } from '@/lib/services/clinic-timezone'
import { hoursTo, median } from '@/lib/activation-metrics'
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
  doors: { insurance: boolean; digest: boolean; siteLive: boolean; /** The S3 switches that are ON (audit round 1). */ switches: FeatureKey[] }
  /** The clinic's own zone — the cockpit's dates are the clinic's days, not UTC's. */
  timeZone: string
  smsState: string | null
  /** The clinic asked us to connect their PMS (S4) and the bridge is not bound yet. */
  pmsRequest: { vendor: string; status: string; at: Date } | null
  progress: { done: ActivationKey[]; next: ActivationKey | null }
  stuck: string[]
}

export interface FirstWeekBoard {
  rows: FirstWeekRow[]
  generatedAt: Date
  counts: {
    inFirstMonth: number
    stuck: number
    noData: number
    /** Median hours from org creation to A1 over the clinics shown that reached it (S8) — null when none has. */
    medianHoursToA1: number | null
  }
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

/** A stamp (written once when the event happened) beats the derived read; the derived read fills in before stamping existed. */
function mergeActivation(stamps: Activation, derived: Activation): Activation {
  return { a1: stamps.a1 ?? derived.a1, a2: stamps.a2 ?? derived.a2, a3: stamps.a3 ?? derived.a3, a4: stamps.a4 ?? derived.a4, a5: stamps.a5 ?? derived.a5 }
}

/** The clinic's activation as every surface should read it: the stamps, filled in by the rails. Never throws. */
export async function readMergedActivation(organizationId: string): Promise<Activation> {
  const [stamps, derived] = await Promise.all([getActivationStamps(organizationId), readActivation(organizationId)])
  return mergeActivation(stamps, derived)
}

/**
 * The doors pending on the PLATFORM for this clinic — the PMS bind, the
 * clinic's own connect request (S4) while nothing is bound, the SMS carrier
 * review. One home: the cockpit's stuck rule and the morning digest's
 * "still on us" line (S7) read the same list. Best-effort per read.
 */
export async function listPendingOnUs(organizationId: string): Promise<FirstWeekRowInput['pendingOnUs']> {
  return (await readPendingOnUs(organizationId)).pendingOnUs
}

/** The list plus the clinic's open connect request (the cockpit row names the vendor). */
export async function readPendingOnUs(
  organizationId: string,
): Promise<{ pendingOnUs: FirstWeekRowInput['pendingOnUs']; openRequest: PmsConnectRequestView | null }> {
  const [sms, pms, pmsRequest] = await Promise.all([
    safe('sms', null, async () => {
      if (smsDriver() === 'none') return null
      const view = await getSmsRegistration(organizationId)
      // `updatedAt` moves on every poll of the carrier, which reset the
      // stuck clock each run (audit round 1); the state's own stamp, or
      // the row's birth, is when this door became ours.
      const [cfg] = await db
        .select({ stateAt: schema.clinicSmsConfig.a2pStatusUpdatedAt, createdAt: schema.clinicSmsConfig.createdAt })
        .from(schema.clinicSmsConfig)
        .where(eq(schema.clinicSmsConfig.organizationId, organizationId))
        .limit(1)
      return { state: view.state, since: cfg?.stateAt ?? cfg?.createdAt ?? null }
    }),
    safe('pms', null, async () => {
      const [c] = await db
        .select({ status: schema.pmsConnection.status, since: schema.pmsConnection.updatedAt })
        .from(schema.pmsConnection)
        .where(eq(schema.pmsConnection.organizationId, organizationId))
        .limit(1)
      return c ?? null
    }),
    safe('pmsRequest', null, () => getPmsConnectRequest(organizationId)),
  ])
  const pendingOnUs: FirstWeekRowInput['pendingOnUs'] = []
  if (pms && pms.status !== 'connected' && pms.status !== 'not_connected') pendingOnUs.push({ label: 'The PMS connection', since: pms.since })
  // The clinic asked (S4's front door) and nothing is bound yet: ours.
  const openRequest =
    pmsRequest && pms?.status !== 'connected' && (pmsRequest.status === 'requested' || pmsRequest.status === 'scheduled') ? pmsRequest : null
  if (openRequest) pendingOnUs.push({ label: `Connecting ${pmsVendorLabel(openRequest.vendor, openRequest.vendorName)}`, since: openRequest.updatedAt })
  if (sms && SMS_PENDING_ON_US.has(sms.state) && sms.since) pendingOnUs.push({ label: 'Texting (carriers)', since: sms.since })
  return { pendingOnUs, openRequest }
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
  const [report, goals, open, work, profile, pending, signIn, activation, sms, switches, timeZone] = await Promise.all([
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
    readPendingOnUs(clinic.orgId),
    lastStaffSignIn(clinic.orgId),
    readActivation(clinic.orgId),
    safe('sms', null, async () => (smsDriver() === 'none' ? null : { state: (await getSmsRegistration(clinic.orgId)).state })),
    safe('switches', null, () => getFeatureSwitchState(clinic.orgId)),
    safe('tz', 'America/New_York', () => getClinicTimeZone(clinic.orgId)),
  ])
  const { pendingOnUs, openRequest } = pending

  const facts = SHOWN_FACTS.map((id) => report?.facts.find((f) => f.id === id)).filter((f): f is ReadinessFact => !!f)
  const oldestOpen = open.reduce<Date | null>((acc, p) => (acc == null || p.createdAt < acc ? p.createdAt : acc), null)

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
    digestOn: profile?.digest === 1,
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
    doors: {
      insurance: profile?.insurance != null,
      digest: profile?.digest === 1,
      siteLive: profile?.siteLive != null,
      switches: switches ? FEATURE_SWITCHES.filter((f) => f.key !== 'insurance' && switches[f.key]).map((f) => f.key) : [],
    },
    timeZone,
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
      medianHoursToA1: median(rows.flatMap((r) => (r.activation.a1 ? [hoursTo(r.createdAt, r.activation.a1)] : []))),
    },
  }
}
