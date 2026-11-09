import 'server-only'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import type { ExecResult } from '@/lib/services/proposals'

/**
 * INQUIRY FOLLOW-UP's yes (ML-22). The second touch goes out through the
 * SAME path the first machine reply uses: the clinic's sender identity,
 * `patientEmailShell` with the "Book a time" button the card disclosed
 * (inquiry_followup is in BOOKING_BUTTON_CAPABILITIES — the button MUST be
 * appended, or the card lied), the clinic's sign-off unless staff already
 * signed, and `deliver()`'s reader-safe transport errors. One send, so no
 * `payload.done` map: the atomic open→approved claim upstream is what
 * makes a second Approve lose cleanly.
 *
 * Grantable (lib/autonomy.ts, ML-22): the yes may be the machine's own
 * (`decidedByUserId` null under a standing grant), so unlike patient_reply
 * nothing here demands a human approver — the send window and the ledger
 * are the autonomy path's own guards.
 *
 * Laws inherited (lib/services/proposal-executors/README.md):
 *  - live staleness at the tap: the card's premise is a lead still waiting
 *    in 'contacted'. Converted → they booked, nothing to chase; archived →
 *    the desk closed it; reopened as 'new' → the first reply comes before a
 *    second; any of those retires the card rather than emailing someone
 *    the practice already moved on with;
 *  - a lead whose `followed_up_at` is already stamped is the stranded-
 *    approve recovery case — narrate the send that happened, never re-send;
 *  - narrate ONCE under `inquiry_followup`: the ledger line is this
 *    executor's return.
 *
 * What it records on the lead: `followed_up_at` (markLeadFollowedUp) AFTER
 * the email is out, best-effort — a failed stamp must never reopen the card
 * and email the person twice (the first touch's round-1 lesson). The status
 * stays 'contacted': a second email is still us reaching out.
 */

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export async function executeInquiryFollowup(
  p: typeof schema.proposal.$inferSelect,
  payload: Record<string, unknown>,
  saidYes: string,
): Promise<ExecResult> {
  const leadId = str(payload.leadId)
  const subject = str(payload.subject) ?? 'Checking in'
  if (!leadId) return { ok: false, error: 'This proposal is missing its inquiry reference.' }

  const [lead] = await db
    .select({
      id: schema.lead.id,
      name: schema.lead.name,
      email: schema.lead.email,
      status: schema.lead.status,
      followedUpAt: schema.lead.followedUpAt,
    })
    .from(schema.lead)
    .where(and(eq(schema.lead.organizationId, p.organizationId), eq(schema.lead.id, leadId)))
    .limit(1)
  if (!lead) return { ok: false, error: 'That inquiry is no longer available.', expired: true }
  const first = lead.name.trim().split(/\s+/)[0] || 'them'

  if (lead.followedUpAt) {
    // Our follow-up already went out (a container died between the send
    // and the close) — recovery-narrate once, never a second email.
    return {
      ok: false,
      error: 'It turns out this follow-up already went out on the earlier approve — I recorded it. Nothing sent twice.',
      expired: true,
      recovered: { ledgerSummary: `Checked back in with ${first} by email`, ledgerDetail: { leadId } },
    }
  }
  if (lead.status === 'converted') {
    return { ok: false, error: `${first} already became a patient — nothing to chase. I tossed this draft.`, expired: true }
  }
  if (lead.status === 'archived') {
    return { ok: false, error: 'This inquiry was archived — I tossed this draft.', expired: true }
  }
  if (lead.status !== 'contacted') {
    return {
      ok: false,
      error: `This inquiry went back to “new” — the first reply comes before a follow-up. I tossed this draft.`,
      expired: true,
    }
  }
  if (!lead.email) return { ok: false, error: 'This inquiry has no email address to write to.', expired: true }

  const [{ getClinicSenderIdentity }, { deliver, patientEmailShell }, { markLeadFollowedUp }, { resolveClinicBookingUrl }] =
    await Promise.all([
      import('@/lib/services/clinic-sender'),
      import('@/lib/email'),
      import('@/lib/services/leads'),
      import('@/lib/services/marketing-send'),
    ])
  const sender = await getClinicSenderIdentity(p.organizationId)
  // The button the card disclosed. Best-effort: no resolvable site →
  // button-less, the same as the first touch.
  const bookingUrl = await resolveClinicBookingUrl(p.organizationId).catch(() => null)
  // The clinic's sign-off, CONDITIONAL exactly as the first touch's: when
  // staff already signed the draft (a last line opening with a dash), their
  // words win and nothing the card never showed is appended.
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
      to: lead.email,
      subject,
      html: patientEmailShell({
        sender,
        title: subject,
        body: paragraphs,
        ...(bookingUrl ? { cta: { url: bookingUrl, label: 'Book a time' } } : {}),
        footnoteHtml: `You asked us a question through our website a few days ago — we’re just checking back in. Call or write back any time.`,
      }),
      from: sender.from,
      replyTo: sender.replyTo,
      ...(sender.gmail ? { gmail: sender.gmail } : {}),
    })
  } catch (e) {
    const msg = e instanceof Error && e.message ? e.message : ''
    return { ok: false, error: msg || 'The email didn’t go out — nothing was sent. Try again in a minute.' }
  }
  // The email is OUT — from here on, best-effort only.
  try {
    await markLeadFollowedUp(p.organizationId, leadId)
  } catch (e) {
    console.warn('[proposals] markLeadFollowedUp failed after the follow-up was sent:', e)
  }
  return {
    ok: true,
    ledgerSummary: `Checked back in with ${first} by email ${saidYes}`,
    ledgerDetail: { leadId },
  }
}
