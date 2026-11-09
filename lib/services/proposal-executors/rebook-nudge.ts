import 'server-only'
import { and, eq, gte, inArray } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import type { ExecResult } from '@/lib/services/proposals'
import { clinicMonthStart } from '@/lib/clinic-timezone'

/**
 * REBOOK NUDGE's yes (ML-29). The note goes out through the inquiry shell —
 * the clinic's sender identity, `patientEmailShell` with the "Book a time"
 * button the card disclosed (rebook_nudge is in BOOKING_BUTTON_CAPABILITIES
 * — the button MUST be appended, or the card lied), the clinic's sign-off
 * unless staff already signed, and `deliver()`'s reader-safe transport
 * errors. One send, so no `payload.done` map: the atomic open→approved
 * claim upstream is what makes a second Approve lose cleanly.
 *
 * Grantable (lib/autonomy.ts, ML-29): the yes may be the machine's own
 * (`decidedByUserId` null under a standing grant), so nothing here demands
 * a human approver — the send window and the ledger are the autonomy
 * path's own guards.
 *
 * Laws inherited (lib/services/proposal-executors/README.md):
 *  - live staleness at the tap: the card's premise is a completed hygiene
 *    visit with nothing booked after it. Booked since → they did the thing;
 *    the visit un-done, the patient archived or opted out → nothing to
 *    nudge; any of those retires the card rather than emailing someone the
 *    practice already moved on with. A campaign that wrote to them this
 *    clinic-local month is the mutual stand-down's other half — the
 *    campaign went first, the nudge retires;
 *  - an UNREADABLE check never vetoes an explicit yes — only the visit and
 *    patient reads are hard stops (nothing to send, no one to send to);
 *  - a booking page that isn't live right now is a REOPEN, not a retire:
 *    the sourceKey is one-per-visit for good, so retiring here would mean
 *    this patient never gets the nudge once the site is up;
 *  - narrate ONCE under `rebook_nudge`: the ledger line is this executor's
 *    return. A send leaves no row of its own to attribute, so a stranded
 *    approve reopens for a retry exactly as feedback_reply does — the
 *    reconcile's documented, accepted residual.
 */

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** The card's disclosed subject, or the generator's default when an older
 *  payload carries none. */
const DEFAULT_SUBJECT = 'Your next visit isn’t on the calendar yet'
const LIVE_FUTURE_STATUSES: readonly string[] = ['scheduled', 'confirmed']

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export async function executeRebookNudge(
  p: typeof schema.proposal.$inferSelect,
  payload: Record<string, unknown>,
  saidYes: string,
): Promise<ExecResult> {
  const appointmentId = str(payload.appointmentId)
  const subject = str(payload.subject) ?? DEFAULT_SUBJECT
  if (!appointmentId) return { ok: false, error: 'This proposal is missing its visit reference.' }
  const now = new Date()

  const [visit] = await db
    .select({
      id: schema.appointment.id,
      patientId: schema.appointment.patientId,
      status: schema.appointment.status,
      type: schema.appointment.type,
    })
    .from(schema.appointment)
    .where(and(eq(schema.appointment.organizationId, p.organizationId), eq(schema.appointment.id, appointmentId)))
    .limit(1)
  if (!visit) return { ok: false, error: 'That visit is no longer on record — I tossed this nudge.', expired: true }
  if (visit.status !== 'completed') {
    return { ok: false, error: 'That visit isn’t marked done any more — I tossed this nudge.', expired: true }
  }

  const [patient] = await db
    .select({
      id: schema.patient.id,
      firstName: schema.patient.firstName,
      email: schema.patient.email,
      isActive: schema.patient.isActive,
      marketingEmailOptIn: schema.patient.marketingEmailOptIn,
    })
    .from(schema.patient)
    .where(and(eq(schema.patient.organizationId, p.organizationId), eq(schema.patient.id, visit.patientId)))
    .limit(1)
  if (!patient || patient.isActive !== 1) {
    return { ok: false, error: 'This patient’s record is no longer active — I tossed this nudge.', expired: true }
  }
  const first = patient.firstName?.trim() || 'this patient'
  if (patient.marketingEmailOptIn !== 1) {
    return { ok: false, error: `${first} has opted out of marketing email — I tossed this nudge.`, expired: true }
  }
  if (!patient.email?.trim()) {
    return {
      ok: false,
      error: `${first} has no email on file any more — open their record and book them by phone instead. I tossed this nudge.`,
      expired: true,
    }
  }

  // LIVE STALENESS: anything on the books after today means they did the
  // thing. Best-effort — an unreadable check never vetoes the yes.
  let bookedSince = false
  try {
    const [future] = await db
      .select({ id: schema.appointment.id })
      .from(schema.appointment)
      .where(
        and(
          eq(schema.appointment.organizationId, p.organizationId),
          eq(schema.appointment.patientId, visit.patientId),
          gte(schema.appointment.startTime, now),
          inArray(schema.appointment.status, Array.from(LIVE_FUTURE_STATUSES)),
        ),
      )
      .limit(1)
    bookedSince = !!future
  } catch (e) {
    console.warn('[proposals] rebook_nudge: could not read the calendar at the tap', e)
  }
  if (bookedSince) {
    return { ok: false, error: `${first} already booked their next visit — nothing to nudge. I tossed this card.`, expired: true }
  }

  const [{ getClinicSenderIdentity }, { deliver, patientEmailShell }, { resolveClinicBookingUrl }] = await Promise.all([
    import('@/lib/services/clinic-sender'),
    import('@/lib/email'),
    import('@/lib/services/marketing-send'),
  ])
  const sender = await getClinicSenderIdentity(p.organizationId)

  // THE MUTUAL STAND-DOWN's other half: a campaign reached them this
  // clinic-local month (the recall send, the empty chair, an automation) —
  // the campaign went first, so the nudge stands down. Best-effort.
  let inOutreach = false
  try {
    const { patientsInOutreachThisMonth } = await import('@/lib/services/proposal-generators/rebook-nudge')
    const reached = await patientsInOutreachThisMonth(
      p.organizationId,
      [visit.patientId],
      clinicMonthStart(now, sender.timeZone),
    )
    inOutreach = reached.has(visit.patientId)
  } catch (e) {
    console.warn('[proposals] rebook_nudge: could not read this month’s outreach at the tap', e)
  }
  if (inOutreach) {
    return {
      ok: false,
      error: `${first} already heard from us this month through a campaign — I tossed this nudge so they don’t get two.`,
      expired: true,
    }
  }

  // The button the card disclosed. No live booking page is a REOPEN (see
  // the docblock): the note is nothing without its door.
  const bookingUrl = await resolveClinicBookingUrl(p.organizationId).catch(() => null)
  if (!bookingUrl) {
    return { ok: false, error: 'Your booking page isn’t live right now, so nothing was sent — publish the site and try again.' }
  }

  // The clinic's sign-off, CONDITIONAL exactly as the inquiry replies':
  // when staff already signed the draft (a last line opening with a dash),
  // their words win and nothing the card never showed is appended.
  const lastLine = p.body.trim().split('\n').filter((l) => l.trim()).pop() ?? ''
  const alreadySigned = lastLine.trim().startsWith('—') || lastLine.trim().startsWith('-')
  const paragraphs =
    p.body
      .split(/\n{2,}/)
      .map((para) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#333333;">${escapeHtml(para.trim()).replace(/\n/g, '<br/>')}</p>`)
      .join('') +
    (alreadySigned
      ? ''
      : `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#333333;">— ${escapeHtml(sender.name)}</p>`)

  try {
    await deliver({
      to: patient.email,
      subject,
      html: patientEmailShell({
        sender,
        title: subject,
        body: paragraphs,
        cta: { url: bookingUrl, label: 'Book a time' },
        footnoteHtml: `You visited us recently and nothing’s on the calendar yet — this is just a nudge, no pressure. Call or write back any time.`,
      }),
      from: sender.from,
      replyTo: sender.replyTo,
      ...(sender.gmail ? { gmail: sender.gmail } : {}),
    })
  } catch (e) {
    const msg = e instanceof Error && e.message ? e.message : ''
    return { ok: false, error: msg || 'The email didn’t go out — nothing was sent. Try again in a minute.' }
  }

  const noun = visit.type === 'cleaning' ? 'cleaning' : 'checkup'
  return {
    ok: true,
    ledgerSummary: `Nudged ${first} to book their next ${noun} ${saidYes}`,
    ledgerDetail: { appointmentId, patientId: visit.patientId },
  }
}
