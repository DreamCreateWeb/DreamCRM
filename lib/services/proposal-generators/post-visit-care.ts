import 'server-only'
import { and, asc, eq, gte, lt } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { clinicDayStart, clinicLocalHour } from '@/lib/clinic-timezone'
import { isInsideSendWindow } from '@/lib/reminder-hours'
import { resolveVisitTypes } from '@/lib/types/visit-types'
import { AFTERCARE_TEMPLATE } from '@/lib/types/reminders'

/**
 * POST-VISIT CARE (ML-28 — the first AUTO lane under ML-11's convention).
 *
 * The evening of a completed visit, the patient gets the practice's own
 * aftercare for that visit type — the words the practice wrote (or kept)
 * on Settings → Practice → Visit types. No AI, no judgement, no card: this
 * is the practice's own words for its own visit types, so `post_visit_care`
 * runs on its own like the reminders it resembles (lib/autonomy.ts:
 * defaultTrust 'auto', not grantable — the per-type aftercare text IS the
 * switch; blank sends nothing). It files no proposals; its return is the
 * driver's `filed` count, so it is always 0 — what it did is in the ledger.
 *
 * "The evening of" — three clinic-local rules, in order:
 *  - at or after POST_VISIT_CARE_HOUR (6 PM) on the clinic's own clock, so
 *    a 9 AM filling and a 4 PM filling get their note at the same time, once
 *    the day is done;
 *  - INSIDE quiet hours (lib/reminder-hours.ts, 8 AM–8 PM): the 6 PM and
 *    7 PM ticks send; from 8 PM nothing does. A clinic whose tick was missed
 *    for both hours sends nothing — aftercare a day late is a different
 *    (wrong) message, not a late one, so "today" is never widened;
 *  - the visit's START is on today's clinic-local day and its status is
 *    'completed' (the drawer's "mark done", or the PMS mirror). A visit the
 *    PMS marks complete tomorrow is not today's.
 *
 * Who: the visit's patient, active, with their OWN email; the type has
 * aftercare text. Nothing else qualifies — no guardian's address (the
 * family-safe law), no phone (no texting copy anywhere — the honesty flip
 * comes last).
 *
 * ONCE PER VISIT — the dedupe is the reminder log's own double-send guard:
 * `claimAutomatedReminder` writes the log row (channel 'email', template
 * AFTERCARE_TEMPLATE, sent_by_user_id null) BEFORE the send, racing on the
 * partial unique index `appt_reminder_auto_touch_uq`, so two overlapping
 * ticks — or the 7 PM tick after the 6 PM one — lose on the index, not on
 * the patient's inbox. A failed transport releases the claim (the next tick
 * inside the window tries again); a delivered email keeps it. The row also
 * puts the note on the appointment drawer's "Reminder activity" stripe.
 *
 * NARRATE ONCE: one ledger entry per note that went out, under
 * `post_visit_care`, with the patient — the standup counts entries per
 * capability ("3 after-visit care notes"), so per-send is the honest unit,
 * exactly as the reminders narrate. Nothing narrates before `deliver`
 * returns.
 */

/** The clinic-local hour from which today's completed visits get their note. */
export const POST_VISIT_CARE_HOUR = 18
/** Notes per org per pass — bounds one hourly tick; the rest go next tick (still today). */
export const MAX_POST_VISIT_CARE_PER_RUN = 50

export type OnSoftFailure = () => void

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const PARA = 'margin:0 0 14px;font-size:15px;line-height:1.6;color:#333333;'

/** The aftercare paragraphs, escaped, line breaks kept. */
function aftercareHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((para) => `<p style="${PARA}">${escapeHtml(para.trim()).replace(/\n/g, '<br/>')}</p>`)
    .join('')
}

export async function generatePostVisitCare(
  organizationId: string,
  now: Date,
  timeZone: string,
  onSoftFailure?: OnSoftFailure,
): Promise<number> {
  // The evening, on the clinic's clock — and never past quiet hours.
  if (clinicLocalHour(now, timeZone) < POST_VISIT_CARE_HOUR) return 0
  if (!isInsideSendWindow(now, timeZone)) return 0

  const [profile] = await db
    .select({ visitTypeSettings: schema.clinicProfile.visitTypeSettings })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, organizationId))
    .limit(1)
  const types = resolveVisitTypes(profile?.visitTypeSettings ?? null)
  const careById = new Map<string, { label: string; text: string }>()
  for (const t of types) {
    const text = t.aftercareInstructions?.trim() ?? ''
    if (text) careById.set(t.id, { label: t.label, text })
  }
  if (careById.size === 0) return 0

  const dayStart = clinicDayStart(now, timeZone, 0)
  const dayEnd = clinicDayStart(now, timeZone, 1)
  const visits = await db
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
        gte(schema.appointment.startTime, dayStart),
        lt(schema.appointment.startTime, dayEnd),
        eq(schema.patient.isActive, 1),
      ),
    )
    .orderBy(asc(schema.appointment.startTime))
    .limit(MAX_POST_VISIT_CARE_PER_RUN)

  // Re-applied in memory so the SQL half and the rule can never disagree
  // (and so a mocked read is held to the same floor).
  const due = visits.filter(
    (v) =>
      v.status === 'completed' &&
      v.isActive === 1 &&
      v.startTime.getTime() >= dayStart.getTime() &&
      v.startTime.getTime() < dayEnd.getTime() &&
      !!v.email?.trim() &&
      careById.has(v.type),
  )
  if (due.length === 0) return 0

  // The claim, the sender and the transport, loaded only once there is work.
  const [{ claimAutomatedReminder, releaseReminderClaim }, { getClinicSenderIdentity }, { deliver, patientEmailShell }, { recordAction }] =
    await Promise.all([
      import('@/lib/services/appointments'),
      import('@/lib/services/clinic-sender'),
      import('@/lib/email'),
      import('@/lib/services/action-ledger'),
    ])
  const sender = await getClinicSenderIdentity(organizationId)

  for (const v of due) {
    const care = careById.get(v.type)!
    const to = v.email!.trim()
    const first = v.firstName?.trim() || 'there'
    const label = care.label.trim() || 'visit'

    // ONCE PER VISIT: the log row is the claim; a loser on the index skips.
    const claim = await claimAutomatedReminder({
      organizationId,
      appointmentId: v.id,
      channel: 'email',
      template: AFTERCARE_TEMPLATE,
    })
    if (!claim) continue

    const subject = `After your ${label.toLowerCase()} today`
    const body =
      `<p style="${PARA}">Hi ${escapeHtml(first)},</p>` +
      `<p style="${PARA}">Thanks for coming in today. A few notes for the next day or two:</p>` +
      aftercareHtml(care.text) +
      `<p style="${PARA}">If anything feels off, reply to this email or call us — we’d rather hear from you than have you wonder.</p>` +
      `<p style="${PARA}">— ${escapeHtml(sender.name)}</p>`
    try {
      await deliver({
        to,
        subject,
        html: patientEmailShell({
          sender,
          title: 'After today’s visit',
          body,
          footnoteHtml: `You had a ${escapeHtml(label.toLowerCase())} with us today — this is the aftercare note we send after every one.`,
        }),
        from: sender.from,
        replyTo: sender.replyTo,
        ...(sender.gmail ? { gmail: sender.gmail } : {}),
      })
    } catch (e) {
      // Nothing went out: drop the claim so the next tick inside the window
      // tries again, and tell the driver once (the Guardian's strike).
      await releaseReminderClaim(claim)
      console.warn('[post-visit-care] aftercare email failed:', e)
      onSoftFailure?.()
      continue
    }
    // The note is OUT — from here on, best-effort only. The ledger first:
    // an unnarrated send is the blind spot this lane's 'auto' must not have.
    await recordAction({
      organizationId,
      capability: 'post_visit_care',
      patientId: v.patientId,
      summary: `Sent ${first} their aftercare after today’s ${label.toLowerCase()}`,
      detail: { appointmentId: v.id, channel: 'email', template: AFTERCARE_TEMPLATE, visitType: v.type },
    })
    try {
      const { queueCommLogWriteBack } = await import('@/lib/services/pms/sync')
      await queueCommLogWriteBack(organizationId, v.patientId, {
        note: `Aftercare instructions emailed after their ${label.toLowerCase()}.`,
        mode: 'Email',
        sentOrReceived: 'Sent',
      })
    } catch (e) {
      console.warn('[post-visit-care] CommLog mirror skipped', e)
    }
  }
  // Nothing filed — this lane sends and narrates; cards are the ask lanes'.
  return 0
}
