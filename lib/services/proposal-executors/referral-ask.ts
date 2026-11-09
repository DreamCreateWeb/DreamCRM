import 'server-only'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import type { ExecResult } from '@/lib/services/proposals'

/**
 * REFERRAL ASK's yes (ML-39). The note goes out through the clinic's sender
 * identity and `patientEmailShell` — one send, so no `payload.done` map: the
 * atomic open→approved claim upstream is what makes a second Approve lose
 * cleanly. The card's body carries the patient's real share link (disclosed
 * in the words, so there is no undisclosed button); when that URL is in the
 * body it is also offered as the shell's button, never a link the card did
 * not show.
 *
 * Grantable (lib/autonomy.ts): the yes may be the machine's own
 * (`decidedByUserId` null under a standing grant), so nothing here demands a
 * human approver — the send window and the ledger are the autonomy path's
 * own guards.
 *
 * Laws inherited (lib/services/proposal-executors/README.md):
 *  - live staleness at the tap: patient archived/merged, opted out, or with
 *    no email → retire (expired) rather than email someone the practice
 *    already moved on with;
 *  - one ask per patient EVER is the sourceKey's job upstream; nothing here
 *    can send twice for one card;
 *  - narrate ONCE under `referral_ask`: the ledger line is this executor's
 *    return; a stranded approve reopens for a retry like feedback_reply.
 */

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const DEFAULT_SUBJECT = 'Know someone who’d like us?'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export async function executeReferralAsk(
  p: typeof schema.proposal.$inferSelect,
  payload: Record<string, unknown>,
  saidYes: string,
): Promise<ExecResult> {
  const patientId = str(payload.patientId) ?? p.patientId
  const subject = str(payload.subject) ?? DEFAULT_SUBJECT
  if (!patientId) return { ok: false, error: 'This proposal is missing its patient reference.' }

  const [patient] = await db
    .select({
      id: schema.patient.id,
      firstName: schema.patient.firstName,
      email: schema.patient.email,
      isActive: schema.patient.isActive,
      marketingEmailOptIn: schema.patient.marketingEmailOptIn,
      mergedIntoPatientId: schema.patient.mergedIntoPatientId,
    })
    .from(schema.patient)
    .where(and(eq(schema.patient.organizationId, p.organizationId), eq(schema.patient.id, patientId)))
    .limit(1)
  if (!patient || patient.isActive !== 1 || patient.mergedIntoPatientId) {
    return { ok: false, error: 'This patient’s record is no longer active — I tossed this ask.', expired: true }
  }
  const first = patient.firstName?.trim() || 'this patient'
  if (patient.marketingEmailOptIn !== 1) {
    return { ok: false, error: `${first} has opted out of marketing email — I tossed this ask.`, expired: true }
  }
  if (!patient.email?.trim()) {
    return { ok: false, error: `${first} has no email on file any more — I tossed this ask.`, expired: true }
  }

  const [{ getClinicSenderIdentity }, { deliver, patientEmailShell }] = await Promise.all([
    import('@/lib/services/clinic-sender'),
    import('@/lib/email'),
  ])
  const sender = await getClinicSenderIdentity(p.organizationId)

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

  // The button only for a link the card's own words show.
  const shareUrl = str(payload.shareUrl)
  const cta =
    shareUrl && /^https?:\/\//i.test(shareUrl) && p.body.includes(shareUrl)
      ? { url: shareUrl, label: 'Share your link' }
      : undefined

  try {
    await deliver({
      to: patient.email,
      subject,
      html: patientEmailShell({
        sender,
        title: subject,
        body: paragraphs,
        ...(cta ? { cta } : {}),
        footnoteHtml: `You’re getting this because you recently told us about your visit. Reply any time — it comes straight to the front desk.`,
      }),
      from: sender.from,
      replyTo: sender.replyTo,
      ...(sender.gmail ? { gmail: sender.gmail } : {}),
    })
  } catch (e) {
    const msg = e instanceof Error && e.message ? e.message : ''
    return { ok: false, error: msg || 'The email didn’t go out — nothing was sent. Try again in a minute.' }
  }

  return {
    ok: true,
    ledgerSummary: `Asked ${first} to refer a friend ${saidYes}`,
    ledgerDetail: { patientId },
  }
}
