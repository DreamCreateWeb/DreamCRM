import 'server-only'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import type { ExecResult } from '@/lib/services/proposals'

/**
 * THE POST-OP CHECK-IN's yes (ML-28). The two lines go out as ONE email
 * from the clinic's own sender identity — `patientEmailShell` (the
 * practice's logo, colour, address), the clinic's sign-off unless staff
 * already signed, `deliver()`'s reader-safe transport errors — with the
 * sender's reply-to, which IS the Messages inbox (lib/services/clinic-sender.ts
 * routes replies through the inbound address), so "how are you feeling?"
 * gets its answer in /messages like any inbound. Then the CommLog mirror
 * into the practice software when a two-way PMS link exists (best-effort,
 * like every other patient send). One send, so no `payload.done` map: the
 * atomic open→approved claim upstream is what makes a second Approve lose
 * cleanly.
 *
 * Grantable (lib/autonomy.ts, ML-28): the yes may be the machine's own
 * (`decidedByUserId` null under a standing grant), so nothing here demands
 * a human approver — the send window and the ledger are the autonomy
 * path's own guards.
 *
 * Laws inherited (lib/services/proposal-executors/README.md):
 *  - live staleness at the tap: the card's premise is a visit that
 *    happened. Vanished, or no longer 'completed' (the desk un-marked it,
 *    the PMS corrected it to a no-show) → retire rather than ask someone
 *    how they feel after a visit they did not have;
 *  - an UNREADABLE check never vetoes an explicit human yes — only the
 *    visit and the patient reads are hard stops (nothing to ask about, no
 *    one to ask); the CommLog mirror can fail silently;
 *  - a patient with no email NOW is a reopen-with-advice (the question is
 *    still good; the desk calls instead), never a retire;
 *  - narrate ONCE under `postop_checkin`: the ledger line is this
 *    executor's return. A send leaves no row of its own to attribute, so a
 *    stranded approve (a container death between the send and the stamp)
 *    reopens for a retry exactly as feedback_reply does — the reconcile's
 *    documented, accepted residual; the generator's sourceKey (one per
 *    visit, for good) is what keeps it from ever being ASKED twice.
 */

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export async function executePostopCheckin(
  p: typeof schema.proposal.$inferSelect,
  payload: Record<string, unknown>,
  saidYes: string,
): Promise<ExecResult> {
  const appointmentId = str(payload.appointmentId)
  const patientId = str(payload.patientId) ?? (typeof p.patientId === 'string' ? p.patientId : null)
  if (!appointmentId || !patientId) return { ok: false, error: 'This proposal is missing its visit reference.' }
  const visitLabel = str(payload.visitLabel) ?? 'visit'

  // The visit, read live and org-scoped. Gone or un-done = nothing to ask about.
  const [visit] = await db
    .select({ id: schema.appointment.id, status: schema.appointment.status, patientId: schema.appointment.patientId })
    .from(schema.appointment)
    .where(and(eq(schema.appointment.organizationId, p.organizationId), eq(schema.appointment.id, appointmentId)))
    .limit(1)
  if (!visit || visit.patientId !== patientId) {
    return { ok: false, error: 'That visit is no longer on the books — nothing sent.', expired: true }
  }
  if (visit.status !== 'completed') {
    return { ok: false, error: 'That visit isn’t marked as done any more — I tossed this check-in.', expired: true }
  }

  const [patient] = await db
    .select({
      firstName: schema.patient.firstName,
      lastName: schema.patient.lastName,
      email: schema.patient.email,
      isActive: schema.patient.isActive,
    })
    .from(schema.patient)
    .where(and(eq(schema.patient.organizationId, p.organizationId), eq(schema.patient.id, patientId)))
    .limit(1)
  if (!patient || patient.isActive !== 1) {
    return { ok: false, error: 'That patient’s record is no longer active — nothing sent.', expired: true }
  }
  const first = patient.firstName?.trim() || 'the patient'
  const to = patient.email?.trim()
  // An email needs an address NOW, not at filing time. Not a retire — the
  // question is still good; the desk reaches them another way.
  if (!to) {
    return {
      ok: false,
      error: `${first} has no email on file any more — give them a call instead to see how they’re doing.`,
    }
  }

  const subject = str(payload.subject) ?? `How are you feeling, ${first}?`
  const [{ getClinicSenderIdentity }, { deliver, patientEmailShell }] = await Promise.all([
    import('@/lib/services/clinic-sender'),
    import('@/lib/email'),
  ])
  const sender = await getClinicSenderIdentity(p.organizationId)
  // The clinic's sign-off, CONDITIONAL exactly as the inquiry touches': when
  // staff already signed (a last line opening with a dash), their words win.
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
      to,
      subject,
      html: patientEmailShell({
        sender,
        title: subject,
        body: paragraphs,
        footnoteHtml: 'Reply to this email and it comes straight to our front desk.',
      }),
      from: sender.from,
      replyTo: sender.replyTo,
      ...(sender.gmail ? { gmail: sender.gmail } : {}),
    })
  } catch (e) {
    // deliver()'s own messages are reader-safe; pass them through so the
    // reopened card says what happened, not a generic shrug.
    const msg = e instanceof Error && e.message ? e.message : ''
    return { ok: false, error: msg || 'The check-in didn’t go out — nothing was sent. Try again in a minute.' }
  }

  // The CommLog mirror — best-effort, after the send: a missed mirror never
  // turns a delivered email into a reopen (and a second send).
  try {
    const { queueCommLogWriteBack } = await import('@/lib/services/pms/sync')
    await queueCommLogWriteBack(p.organizationId, patientId, {
      note: `Checked in by email the day after their ${visitLabel} — “${subject}”.`,
      mode: 'Email',
      sentOrReceived: 'Sent',
    })
  } catch (e) {
    console.warn('[proposals] postop_checkin: CommLog mirror skipped', e)
  }

  return {
    ok: true,
    ledgerSummary: `Checked in on ${first} after their ${visitLabel} by email ${saidYes}`,
    ledgerDetail: { appointmentId, patientId, channel: 'email', subject },
  }
}
