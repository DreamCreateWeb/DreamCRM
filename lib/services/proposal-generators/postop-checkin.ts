import 'server-only'
import { and, asc, eq, gte, inArray, lt } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { fileProposal } from '@/lib/services/proposals'
import { clinicDayStart } from '@/lib/clinic-timezone'
import { clinicDayKey, formatClinicDate } from '@/lib/format-datetime'
import { resolveVisitTypes } from '@/lib/types/visit-types'

/**
 * THE POST-OP CHECK-IN (ML-28 — ask-first, grantable, under ML-11's
 * convention). The day after a completed visit of a type the practice
 * flagged "check in the day after" (Settings → Practice → Visit types;
 * extraction, root canal and implant by default), the Dream Team files ONE
 * card per visit: "How are you feeling?" — a two-line email, the practice's
 * voice, NO AI (the words are the same for everyone because the question
 * is), reply-to the Messages inbox so the answer lands in /messages like any
 * inbound. The card asks first because it opens a conversation; once a
 * practice grants `postop_checkin`, the yes is the machine's own, inside the
 * patient send window (PATIENT_INBOX_CAPABILITIES).
 *
 * Selection — a visit that is:
 *  - `status = 'completed'` with a type in the practice's check-in set;
 *  - started on a PRIOR clinic-local day, within the last
 *    POSTOP_CHECKIN_LOOKBACK_DAYS days (yesterday is the point; the day
 *    before covers a tick the engine missed — a check-in two days on is
 *    still a kindness, a week on is a different message);
 *  - whose patient is active with their OWN email (no guardian's address —
 *    the family-safe law; no phone — no texting copy anywhere);
 *  - at most MAX_POSTOP_CHECKINS_PER_RUN per org per pass, oldest visit
 *    first.
 *
 * Dedupe — the sourceKey is `postop_checkin:<appointmentId>`: one check-in
 * per visit, ever (fileProposal is idempotent per (org, sourceKey) for good,
 * so a declined or expired card is the answer about THIS visit). And ONE
 * OPEN CARD PER PATIENT: two procedures in one afternoon earn one question,
 * not two.
 *
 * The card is an EMAIL artifact (the visit named as context, the two lines
 * as the body, the subject disclosed and editable, the sign-off appended
 * exactly as the executor sends it) with a door to the patient's record.
 */

/** Prior clinic-local days a completed visit is still "just now" for a check-in. */
export const POSTOP_CHECKIN_LOOKBACK_DAYS = 2
/** Cards per org per pass. */
export const MAX_POSTOP_CHECKINS_PER_RUN = 5
/** Visits read per pass (oldest first) before the caps. */
const CANDIDATE_LIMIT = 20
const DAY_MS = 24 * 60 * 60 * 1000
/** A "how are you feeling?" goes stale fast — three days, then it is a different question. */
const EXPIRES_DAYS = 3

/** Cheap existence check so no card is filed twice for one visit. */
async function sourceKeyTaken(organizationId: string, sourceKey: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.proposal.id })
    .from(schema.proposal)
    .where(and(eq(schema.proposal.organizationId, organizationId), eq(schema.proposal.sourceKey, sourceKey)))
    .limit(1)
  return !!row
}

/** Patients who already have an OPEN postop_checkin card (one question per person). */
async function patientsWithOpenCard(organizationId: string): Promise<Set<string>> {
  const rows = await db
    .select({ patientId: schema.proposal.patientId, payload: schema.proposal.payload })
    .from(schema.proposal)
    .where(
      and(
        eq(schema.proposal.organizationId, organizationId),
        eq(schema.proposal.capability, 'postop_checkin'),
        eq(schema.proposal.status, 'open'),
      ),
    )
  const ids = new Set<string>()
  for (const r of rows) {
    if (typeof r.patientId === 'string') ids.add(r.patientId)
    const payload = (r.payload ?? {}) as Record<string, unknown>
    if (typeof payload.patientId === 'string') ids.add(payload.patientId)
  }
  return ids
}

/** The two lines the card sends — the practice's voice, no AI, the same
 *  honest question for everyone. Exported so the test pins the words. */
export function postopCheckinBody(first: string, visitLabel: string, dayWord: string): string {
  return `Hi ${first} — just checking in after your ${visitLabel} ${dayWord}. How are you feeling?\n\nIf anything is sore, swollen, or just not what you expected, reply to this email or give us a call — we’d rather hear from you early.`
}

export async function generatePostopCheckinProposals(
  organizationId: string,
  now: Date,
  timeZone: string,
): Promise<number> {
  const [profile] = await db
    .select({ visitTypeSettings: schema.clinicProfile.visitTypeSettings })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, organizationId))
    .limit(1)
  const types = resolveVisitTypes(profile?.visitTypeSettings ?? null)
  const checkIn = new Map<string, string>()
  for (const t of types) if (t.checkInAfter) checkIn.set(t.id, t.label)
  if (checkIn.size === 0) return 0

  // Prior clinic-local days only: today's visits are tonight's aftercare,
  // not tomorrow's question.
  const windowStart = clinicDayStart(now, timeZone, -POSTOP_CHECKIN_LOOKBACK_DAYS)
  const todayStart = clinicDayStart(now, timeZone, 0)
  const candidates = await db
    .select({
      id: schema.appointment.id,
      type: schema.appointment.type,
      status: schema.appointment.status,
      startTime: schema.appointment.startTime,
      patientId: schema.appointment.patientId,
      firstName: schema.patient.firstName,
      lastName: schema.patient.lastName,
      email: schema.patient.email,
      isActive: schema.patient.isActive,
    })
    .from(schema.appointment)
    .innerJoin(schema.patient, eq(schema.patient.id, schema.appointment.patientId))
    .where(
      and(
        eq(schema.appointment.organizationId, organizationId),
        eq(schema.appointment.status, 'completed'),
        inArray(schema.appointment.type, Array.from(checkIn.keys())),
        gte(schema.appointment.startTime, windowStart),
        lt(schema.appointment.startTime, todayStart),
        eq(schema.patient.isActive, 1),
      ),
    )
    .orderBy(asc(schema.appointment.startTime))
    .limit(CANDIDATE_LIMIT)

  // Re-applied in memory so the SQL half and the rule can never disagree.
  const due = candidates.filter(
    (v) =>
      v.status === 'completed' &&
      v.isActive === 1 &&
      checkIn.has(v.type) &&
      v.startTime.getTime() >= windowStart.getTime() &&
      v.startTime.getTime() < todayStart.getTime() &&
      !!v.email?.trim(),
  )
  if (due.length === 0) return 0

  const busy = await patientsWithOpenCard(organizationId)
  const yesterdayKey = clinicDayKey(clinicDayStart(now, timeZone, -1), timeZone)

  let filed = 0
  for (const v of due) {
    if (filed >= MAX_POSTOP_CHECKINS_PER_RUN) break
    if (busy.has(v.patientId)) continue
    const sourceKey = `postop_checkin:${v.id}`
    if (await sourceKeyTaken(organizationId, sourceKey)) continue

    const first = v.firstName?.trim() || 'there'
    const fullName = [v.firstName, v.lastName].filter(Boolean).join(' ').trim() || 'Patient'
    const typeLabel = checkIn.get(v.type) ?? 'Visit'
    const visitLabel = typeLabel.toLowerCase()
    const isYesterday = clinicDayKey(v.startTime, timeZone) === yesterdayKey
    const dayWord = isYesterday ? 'yesterday' : `on ${formatClinicDate(v.startTime, timeZone)}`
    const subject = `How are you feeling, ${first}?`

    const { filed: ok } = await fileProposal({
      organizationId,
      capability: 'postop_checkin',
      sourceKey,
      patientId: v.patientId,
      title: `Check in on ${first} after ${isYesterday ? 'yesterday’s' : 'their'} ${visitLabel}`,
      body: postopCheckinBody(first, visitLabel, dayWord),
      payload: {
        appointmentId: v.id,
        patientId: v.patientId,
        visitType: v.type,
        visitLabel,
        subject,
        // The visit itself, named on the card so nobody approves a question
        // blind — who, what, when (already in the clinic's wall clock).
        context: {
          kind: 'visit',
          author: fullName,
          text: `${typeLabel} · ${formatClinicDate(v.startTime, timeZone)}`,
        },
      },
      expiresAt: new Date(now.getTime() + EXPIRES_DAYS * DAY_MS),
    })
    if (ok) {
      filed++
      busy.add(v.patientId)
    }
  }
  return filed
}
