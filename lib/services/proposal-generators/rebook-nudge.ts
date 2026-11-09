import 'server-only'
import { and, asc, eq, gte, inArray, lt } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { fileProposal } from '@/lib/services/proposals'
import { clinicDayStart, clinicMonthStart } from '@/lib/clinic-timezone'
import { formatClinicDate } from '@/lib/format-datetime'
import { suggestNextVisitDateKey } from '@/lib/next-visit'
import { formatDayKey } from '@/lib/dates'

/**
 * THE REBOOK NUDGE (ML-29, G1-17 — under ML-11's lane convention).
 *
 * A patient finishes a cleaning or checkup and walks out without the next
 * one on the calendar — the front desk saw it on the mark-done drawer
 * (`nextVisitBooked === false`, ML-04) and the day got busy. A week later,
 * if there is STILL nothing booked, this files ONE card: a short note with
 * the practice's own booking link, waiting for a yes; once a practice
 * grants `rebook_nudge`, the yes is the machine's own, inside the patient
 * send window (PATIENT_INBOX_CAPABILITIES).
 *
 * Selection — a completed HYGIENE visit (cleaning / checkup) that:
 *  - happened at least REBOOK_AFTER_DAYS clinic-local DAYS ago (a day
 *    boundary on the practice's calendar, never 7 × 24 UTC hours) and
 *    within REBOOK_WINDOW_DAYS — a visit a month back is the recall
 *    engine's to chase, not a "you just left";
 *  - belongs to an active patient with an email and marketing email opt-in
 *    (this is outreach, so the consent spine applies — an opt-out is louder
 *    than anything here);
 *  - has NO live visit on the books after it — `nextVisitBooked` is the
 *    moment's answer at mark-done; the truth now is re-read from the
 *    appointment table, so a patient who booked since is never nudged;
 *  - is not already in this month's outreach: the recall campaign, the
 *    empty-chair invitation, the welcome and reactivation automations all
 *    reach for the same people through the same inbox, so a patient a
 *    campaign already wrote to this clinic-local month — or one sitting in
 *    a campaign that is scheduled or sending right now — stands down here
 *    (the mutual stand-down: the executor re-checks at the tap, so whoever
 *    goes first wins and the other side retires);
 *  - at most MAX_REBOOK_NUDGES_PER_RUN per org per pass, oldest visit first.
 *
 * Dedupe — the sourceKey is `rebook_nudge:<appointmentId>`: one nudge per
 * visit, ever (fileProposal is idempotent per (org, sourceKey) for good; a
 * declined card is the answer about THAT visit). One open card per patient
 * on top, so two completed visits in the window never earn two notes.
 *
 * AI-free by design: the note is formulaic ("your next visit isn't on the
 * calendar yet — here's the link") and code-owned copy is the honest
 * default the recall campaign already uses; staff edit it on the card.
 * The next-visit month it names comes from the same recall ladder the
 * mark-done drawer seeds (patient → clinic → the default), so the sentence
 * and the booking drawer agree.
 *
 * The card is an EMAIL artifact with the "Book a time" button disclosed
 * (rebook_nudge is in BOOKING_BUTTON_CAPABILITIES — the executor MUST
 * append it) and a door to the patient's record. No booking page resolves →
 * nothing filed: a nudge with no door is a nag.
 */

/** Clinic-local days after the visit before a nudge is filed. */
export const REBOOK_AFTER_DAYS = 7
/** A visit older than this is the recall engine's, not a "you just left". */
export const REBOOK_WINDOW_DAYS = 21
/** Cards per org per pass. */
export const MAX_REBOOK_NUDGES_PER_RUN = 5
/** The visit types that count as hygiene — the ones a recall interval
 *  measures from. */
export const HYGIENE_VISIT_TYPES: readonly string[] = ['cleaning', 'checkup']
/** Visits read per pass (oldest first) before the caps. */
const CANDIDATE_LIMIT = 20
const DAY_MS = 24 * 60 * 60 * 1000
/** A "you just left" goes stale fast — one week, like an inquiry reply. */
const EXPIRES_DAYS = 7
/** Future bookings that count as "on the books". */
const LIVE_FUTURE_STATUSES: readonly string[] = ['scheduled', 'confirmed']
/** Campaigns a patient is "in" right now (typed to the column's enum). */
const IN_FLIGHT_CAMPAIGN_STATUSES = ['scheduled', 'active'] as const

export const REBOOK_NUDGE_SUBJECT = 'Your next visit isn’t on the calendar yet'

/** The visit's noun in the note: "cleaning" or "checkup". */
function visitNoun(type: string): string {
  return type === 'cleaning' ? 'cleaning' : 'checkup'
}

/** "April 2027" from a YYYY-MM-DD key — the month the recall ladder points
 *  at, loose on purpose (a month, never a day the patient has to hit). */
function monthLabel(dateKey: string): string | null {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(dateKey)
  if (!m) return null
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1))
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

/** Code-owned default copy (the recall campaign's posture): deterministic,
 *  anti-shame, edited by staff in the inbox. */
export function rebookNudgeBody(opts: {
  first: string
  visitType: string
  visitDateLabel: string
  nextMonthLabel: string | null
}): string {
  const noun = visitNoun(opts.visitType)
  const when = opts.nextMonthLabel ? ` We’d usually see you again around ${opts.nextMonthLabel}.` : ''
  return `Hi ${opts.first},

Thanks for coming in on ${opts.visitDateLabel}. Your next ${noun} isn’t on the calendar yet — no rush, but spots fill up, and picking a time now is one less thing to remember later.${when}

Tap below to grab a time that works for you.`
}

/** Cheap existence check so no card is filed twice for one visit. */
async function sourceKeyTaken(organizationId: string, sourceKey: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.proposal.id })
    .from(schema.proposal)
    .where(and(eq(schema.proposal.organizationId, organizationId), eq(schema.proposal.sourceKey, sourceKey)))
    .limit(1)
  return !!row
}

/** Patients with an OPEN rebook_nudge card (one card per patient). */
async function patientsWithOpenCard(organizationId: string): Promise<Set<string>> {
  const rows = await db
    .select({ patientId: schema.proposal.patientId })
    .from(schema.proposal)
    .where(
      and(
        eq(schema.proposal.organizationId, organizationId),
        eq(schema.proposal.capability, 'rebook_nudge'),
        eq(schema.proposal.status, 'open'),
      ),
    )
  const ids = new Set<string>()
  for (const r of rows) if (typeof r.patientId === 'string') ids.add(r.patientId)
  return ids
}

/** Patients of this org with a live visit on the books after `after`. */
export async function patientsWithFutureVisit(
  organizationId: string,
  patientIds: readonly string[],
  after: Date,
): Promise<Set<string>> {
  if (patientIds.length === 0) return new Set()
  const rows = await db
    .select({ patientId: schema.appointment.patientId })
    .from(schema.appointment)
    .where(
      and(
        eq(schema.appointment.organizationId, organizationId),
        inArray(schema.appointment.patientId, Array.from(patientIds)),
        gte(schema.appointment.startTime, after),
        inArray(schema.appointment.status, Array.from(LIVE_FUTURE_STATUSES)),
      ),
    )
  return new Set(rows.map((r) => r.patientId))
}

/**
 * The stand-down's other half of the recall audience: patients a campaign
 * of this org already wrote to since `monthStart` (a 'sent' row), plus the
 * recipients of any campaign scheduled or sending right now. Org-scoped
 * through the campaigns join (campaign_events carries no org column).
 * Best-effort on the in-flight read — an unreadable audience stands no one
 * down, the executor re-checks at the tap.
 */
export async function patientsInOutreachThisMonth(
  organizationId: string,
  patientIds: readonly string[],
  monthStart: Date,
): Promise<Set<string>> {
  const out = new Set<string>()
  if (patientIds.length === 0) return out
  const wanted = new Set(patientIds)
  const sent = await db
    .select({ patientId: schema.campaignEvents.patientId })
    .from(schema.campaignEvents)
    .innerJoin(schema.campaigns, eq(schema.campaigns.id, schema.campaignEvents.campaignId))
    .where(
      and(
        eq(schema.campaigns.organizationId, organizationId),
        eq(schema.campaignEvents.type, 'sent'),
        gte(schema.campaignEvents.occurredAt, monthStart),
        inArray(schema.campaignEvents.patientId, Array.from(patientIds)),
      ),
    )
  for (const r of sent) if (r.patientId && wanted.has(r.patientId)) out.add(r.patientId)

  const inFlight = await db
    .select({ id: schema.campaigns.id })
    .from(schema.campaigns)
    .where(
      and(
        eq(schema.campaigns.organizationId, organizationId),
        eq(schema.campaigns.recipientSource, 'patients'),
        inArray(schema.campaigns.status, [...IN_FLIGHT_CAMPAIGN_STATUSES]),
      ),
    )
  if (inFlight.length > 0) {
    try {
      const { resolveCampaignRecipients } = await import('@/lib/services/marketing-campaigns')
      for (const c of inFlight) {
        const recipients = await resolveCampaignRecipients(organizationId, c.id)
        for (const r of recipients) if (r.patientId && wanted.has(r.patientId)) out.add(r.patientId)
      }
    } catch (e) {
      console.warn('[proposals] rebook_nudge: could not read an in-flight campaign’s audience', e)
    }
  }
  return out
}

export async function generateRebookNudgeProposals(
  organizationId: string,
  now: Date,
  timeZone: string,
): Promise<number> {
  // "At least N clinic-local days ago" = the visit's day is before the start
  // of the day (N-1) days back (the inquiry follow-up's floor, same reason).
  const floor = clinicDayStart(now, timeZone, -(REBOOK_AFTER_DAYS - 1))
  const windowStart = clinicDayStart(now, timeZone, -REBOOK_WINDOW_DAYS)

  const candidates = await db
    .select({
      id: schema.appointment.id,
      patientId: schema.appointment.patientId,
      type: schema.appointment.type,
      startTime: schema.appointment.startTime,
    })
    .from(schema.appointment)
    .where(
      and(
        eq(schema.appointment.organizationId, organizationId),
        eq(schema.appointment.status, 'completed'),
        inArray(schema.appointment.type, Array.from(HYGIENE_VISIT_TYPES)),
        lt(schema.appointment.startTime, floor),
        gte(schema.appointment.startTime, windowStart),
      ),
    )
    .orderBy(asc(schema.appointment.startTime))
    .limit(CANDIDATE_LIMIT)

  // Re-applied in memory so the SQL half and the rule can never disagree.
  const visits = candidates.filter(
    (a) =>
      HYGIENE_VISIT_TYPES.includes(a.type) &&
      a.startTime.getTime() < floor.getTime() &&
      a.startTime.getTime() >= windowStart.getTime(),
  )
  if (visits.length === 0) return 0

  const patientIds = Array.from(new Set(visits.map((v) => v.patientId)))
  const [patients, booked, busy, inOutreach] = await Promise.all([
    db
      .select({
        id: schema.patient.id,
        firstName: schema.patient.firstName,
        email: schema.patient.email,
        isActive: schema.patient.isActive,
        marketingEmailOptIn: schema.patient.marketingEmailOptIn,
        recallIntervalMonths: schema.patient.recallIntervalMonths,
      })
      .from(schema.patient)
      .where(and(eq(schema.patient.organizationId, organizationId), inArray(schema.patient.id, patientIds))),
    patientsWithFutureVisit(organizationId, patientIds, now),
    patientsWithOpenCard(organizationId),
    patientsInOutreachThisMonth(organizationId, patientIds, clinicMonthStart(now, timeZone)),
  ])
  const patientById = new Map(patients.map((p) => [p.id, p]))

  // The door, loaded only once there is work; none → nothing filed.
  const [{ resolveClinicBookingUrl }, { getClinicCadence }] = await Promise.all([
    import('@/lib/services/marketing-send'),
    import('@/lib/services/clinic-cadence'),
  ])
  const bookingUrl = await resolveClinicBookingUrl(organizationId).catch(() => null)
  if (!bookingUrl) return 0
  const cadence = await getClinicCadence(organizationId).catch(() => ({ recallMonths: null, lapsedMonths: null }))

  let filed = 0
  const nudgedThisPass = new Set<string>()
  for (const v of visits) {
    if (filed >= MAX_REBOOK_NUDGES_PER_RUN) break
    const patient = patientById.get(v.patientId)
    if (!patient || patient.isActive !== 1 || !patient.email?.trim() || patient.marketingEmailOptIn !== 1) continue
    if (booked.has(v.patientId) || busy.has(v.patientId) || inOutreach.has(v.patientId)) continue
    if (nudgedThisPass.has(v.patientId)) continue

    const sourceKey = `rebook_nudge:${v.id}`
    if (await sourceKeyTaken(organizationId, sourceKey)) continue

    const first = patient.firstName?.trim() || 'there'
    const visitDateLabel = formatClinicDate(v.startTime, timeZone)
    const nextKey = suggestNextVisitDateKey(v.startTime, timeZone, {
      patientMonths: patient.recallIntervalMonths,
      clinicMonths: cadence.recallMonths,
    })
    const { filed: ok } = await fileProposal({
      organizationId,
      capability: 'rebook_nudge',
      sourceKey,
      patientId: v.patientId,
      title: `Nudge ${first} to book their next ${visitNoun(v.type)} — they left on ${visitDateLabel} without one`,
      body: rebookNudgeBody({ first, visitType: v.type, visitDateLabel, nextMonthLabel: monthLabel(nextKey) }),
      payload: {
        appointmentId: v.id,
        patientId: v.patientId,
        subject: REBOOK_NUDGE_SUBJECT,
        visitType: v.type,
        // Already in the clinic's wall clock (the tz law) — the card and
        // the executor never format this date themselves.
        visitDateLabel,
        nextVisitDateKey: nextKey,
        nextVisitLabel: formatDayKey(nextKey),
        context: { kind: 'visit', author: first },
      },
      expiresAt: new Date(now.getTime() + EXPIRES_DAYS * DAY_MS),
    })
    if (ok) {
      filed++
      nudgedThisPass.add(v.patientId)
    }
  }
  return filed
}
