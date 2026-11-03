import 'server-only'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import type { ExecResult } from '@/lib/services/proposals'

/**
 * FEEDBACK REPLY's yes (ML-21). The approver's tap sends the card's body as
 * ONE email from the clinic's own sender identity through
 * `sendNotificationEmail(input, sender)` — the branded patient shell
 * (`patientEmailShell`: the practice's logo, colour, address; "Hi {first},"
 * above, "— {practice}" below; every line escaped) with the subject the
 * card disclosed — then mirrors a CommLog note into the practice software
 * when a two-way PMS link exists (best-effort, like every other patient
 * send). One send, so no `payload.done` map: the atomic open→approved
 * claim upstream is what makes a second Approve lose cleanly.
 *
 * "Answered" has no column of its own (no migration in this slice): the
 * proposal row the approve closes with `executedAt` plus the ledger line
 * this executor returns ARE the record that the note was answered, and the
 * generator's sourceKey (one per note, for good) is what keeps it from
 * ever being asked twice.
 *
 * Laws inherited (lib/services/proposal-executors/README.md):
 *  - live staleness at the tap: the note is re-read org-scoped; a note
 *    that is gone (the patient merged or removed, the request deleted)
 *    retires rather than sends;
 *  - an UNREADABLE check never vetoes an explicit human yes — only the
 *    note and the patient reads are hard stops (nothing to send, no one
 *    to send to); the CommLog mirror can fail silently;
 *  - a patient with no email NOW is a reopen-with-advice (the draft is
 *    still good; the desk calls instead), never a retire;
 *  - narrate ONCE under `feedback_reply`: the ledger line is this
 *    executor's return. A send leaves no row of its own to attribute, so a
 *    stranded approve (a container death between the send and the stamp)
 *    reopens for a human retry exactly as inquiry_response does — the
 *    reconcile's documented, accepted residual.
 *
 * `feedback_reply` is NOT grantable (lib/autonomy.ts), so the approver is
 * always a person — the guard below is belt and braces against a future
 * grant arriving before this file learns to send as the machine.
 */

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** The card's disclosed subject, or the generator's default when an older
 *  payload carries none. */
const DEFAULT_SUBJECT = 'About your recent visit'

type Source = 'review' | 'nps'

function sourceOf(v: unknown): Source | null {
  return v === 'review' || v === 'nps' ? v : null
}

export async function executeFeedbackReply(
  p: typeof schema.proposal.$inferSelect,
  payload: Record<string, unknown>,
  saidYes: string,
): Promise<ExecResult> {
  const source = sourceOf(payload.source)
  const feedbackId = str(payload.feedbackId)
  if (!source || !feedbackId) return { ok: false, error: 'This proposal is missing its feedback reference.' }
  if (!p.decidedByUserId) {
    return { ok: false, error: 'I can only send this once someone on the team approves it.' }
  }

  // The note, read live and org-scoped. Gone = nothing to answer.
  let patientId: string | null = null
  let about: string
  if (source === 'review') {
    const [row] = await db
      .select({ patientId: schema.reviewRequest.patientId, text: schema.reviewRequest.privateFeedback })
      .from(schema.reviewRequest)
      .where(and(eq(schema.reviewRequest.organizationId, p.organizationId), eq(schema.reviewRequest.id, feedbackId)))
      .limit(1)
    if (!row || !row.text?.trim()) {
      return { ok: false, error: 'That note is no longer on file — nothing sent.', expired: true }
    }
    patientId = row.patientId
    about = 'private note'
  } else {
    const [row] = await db
      .select({ patientId: schema.npsResponse.patientId, score: schema.npsResponse.score })
      .from(schema.npsResponse)
      .where(and(eq(schema.npsResponse.organizationId, p.organizationId), eq(schema.npsResponse.id, feedbackId)))
      .limit(1)
    if (!row || row.score == null) {
      return { ok: false, error: 'That survey answer is no longer on file — nothing sent.', expired: true }
    }
    patientId = row.patientId
    about = `${row.score}/10 survey`
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
  const fullName = `${patient.firstName} ${patient.lastName}`.trim() || 'Patient'
  const to = patient.email?.trim()
  // An email reply needs an address NOW, not at filing time. Not a retire
  // — the draft is still good; the desk reaches them another way.
  if (!to) {
    return {
      ok: false,
      error: `${first} has no email on file any more — give them a call instead (the follow-up is on their record).`,
    }
  }

  const subject = str(payload.subject) ?? DEFAULT_SUBJECT
  const [{ getClinicSenderIdentity }, { sendNotificationEmail }] = await Promise.all([
    import('@/lib/services/clinic-sender'),
    import('@/lib/email'),
  ])
  const sender = await getClinicSenderIdentity(p.organizationId)
  try {
    await sendNotificationEmail({ to, name: fullName, title: subject, body: p.body }, sender)
  } catch (e) {
    // deliver()'s own messages are reader-safe; pass them through so the
    // reopened card says what happened, not a generic shrug.
    const msg = e instanceof Error && e.message ? e.message : ''
    return { ok: false, error: msg || 'The note didn’t go out — nothing was sent. Try again in a minute.' }
  }

  // The CommLog mirror — the practice software's chart carries the same
  // note the patient got. Best-effort, after the send: a missed mirror
  // never turns a delivered email into a reopen (and a second send).
  try {
    const { queueCommLogWriteBack } = await import('@/lib/services/pms/sync')
    await queueCommLogWriteBack(p.organizationId, patientId, {
      note: `Personal note emailed about their ${about} — “${subject}”.`,
      mode: 'Email',
      sentOrReceived: 'Sent',
    })
  } catch (e) {
    console.warn('[proposals] feedback_reply: CommLog mirror skipped', e)
  }

  return {
    ok: true,
    ledgerSummary: `Wrote back to ${first} about their ${about} by email ${saidYes}`,
    ledgerDetail: { source, feedbackId, patientId, channel: 'email', subject },
  }
}
