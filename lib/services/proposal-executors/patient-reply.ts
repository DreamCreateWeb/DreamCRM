import 'server-only'
import type { schema } from '@/lib/db'
import type { ExecResult } from '@/lib/services/proposals'

/**
 * PATIENT REPLY's yes (ML-12). The approver's tap sends the card's body
 * through `sendMessageToPatient` — THE one send the Messages page's
 * composer uses — AS THE APPROVER (`sentByUserId`), so the thread flips to
 * answered, the unread counter zeros, the urgency pin clears and the
 * receipts (in-app delivered-now; email via the Resend webhook) land
 * exactly as a hand-typed reply's would. One send, so no `payload.done`
 * map: the atomic open→approved claim upstream is what makes a second
 * Approve lose cleanly.
 *
 * Laws inherited (lib/services/proposal-executors/README.md):
 *  - live staleness at the tap: the card was filed on an hourly scan, and
 *    someone may have answered from /messages since, or the patient may
 *    have written again — either way this draft answers a conversation
 *    that moved on, so it retires rather than sends;
 *  - an UNREADABLE check never vetoes an explicit human yes — only the
 *    thread read itself is a hard stop (nothing to send to);
 *  - narrate ONCE under `patient_reply`: the ledger line is the executor's
 *    return; a stranded approve whose reply already reached the thread is
 *    recovery-narrated, never re-sent.
 *
 * `patient_reply` is NOT grantable (lib/autonomy.ts), so the approver is
 * always a person — the guard below is belt and braces against a future
 * grant arriving before this file learns to send as the machine.
 */

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

type ReplyChannel = 'in_app' | 'email'

function replyChannel(v: unknown): ReplyChannel {
  return v === 'email' ? 'email' : 'in_app'
}

export async function executePatientReply(
  p: typeof schema.proposal.$inferSelect,
  payload: Record<string, unknown>,
  saidYes: string,
): Promise<ExecResult> {
  const threadId = str(payload.threadId)
  const messageId = str(payload.messageId)
  if (!threadId) return { ok: false, error: 'This proposal is missing its conversation reference.' }
  if (!p.decidedByUserId) {
    return { ok: false, error: 'I can only send this once someone on the team approves it.' }
  }
  const channel = replyChannel(payload.channel)

  const { getPatientThreadById, listMessagesInThread, sendMessageToPatient } = await import(
    '@/lib/services/patient-messaging'
  )

  const thread = await getPatientThreadById(p.organizationId, threadId)
  if (!thread) return { ok: false, error: 'That conversation is no longer available.', expired: true }
  const first = thread.patientFirstName?.trim() || 'the patient'

  // The newest turn, read live. Best-effort: an unreadable history never
  // vetoes the yes — the thread's own denormalised direction still decides.
  let messages: Awaited<ReturnType<typeof listMessagesInThread>> = []
  try {
    messages = await listMessagesInThread(p.organizationId, threadId)
  } catch (e) {
    console.warn('[proposals] patient_reply: could not read the thread history at the tap', e)
  }
  const last = messages.length > 0 ? messages[messages.length - 1] : null

  if (thread.lastMessageDirection !== 'inbound' || thread.status === 'archived') {
    // OUR OWN words as the thread's last turn = the stranded-approve
    // recovery case — narrate the work that happened (once). Anyone else's
    // reply = handled at the counter; nothing of ours to narrate.
    if (last && last.direction === 'outbound' && last.body.trim() === p.body.trim()) {
      return {
        ok: false,
        error: 'It turns out this reply already went out on the earlier approve — I recorded it. Nothing sent twice.',
        expired: true,
        recovered: {
          ledgerSummary: `Replied to ${first}’s message`,
          ledgerDetail: { threadId, messageId: last.id, channel: last.channel },
        },
      }
    }
    return { ok: false, error: `Someone already answered ${first} — I tossed this draft.`, expired: true }
  }

  // The patient wrote again since the card was drafted: this draft answers
  // an older message, so it retires and the next pass drafts the newest.
  if (messageId && last && last.direction === 'inbound' && last.id !== messageId) {
    return {
      ok: false,
      error: `${first} wrote again since I drafted this — I tossed the draft so you can answer their newest message.`,
      expired: true,
    }
  }

  // The card said which way it replies; an email reply needs an address
  // NOW, not at filing time. Not a retire — the draft is still good, the
  // desk just needs to send it the other way.
  if (channel === 'email' && !thread.patientEmail) {
    return {
      ok: false,
      error: `${first} has no email on file any more — open the conversation and reply in the portal instead.`,
    }
  }

  let messageIdSent: string
  try {
    const r = await sendMessageToPatient({
      organizationId: p.organizationId,
      patientId: thread.patientId,
      body: p.body,
      channel,
      sentByUserId: p.decidedByUserId,
    })
    messageIdSent = r.messageId
  } catch (e) {
    // sendMessageToPatient's own messages are reader-safe ("no email
    // address on file — switch to the in-app channel"); pass them through
    // so the reopened card says what to do, not a generic shrug.
    const msg = e instanceof Error && e.message ? e.message : ''
    return { ok: false, error: msg || 'The reply didn’t go out — nothing was sent. Try again in a minute.' }
  }

  return {
    ok: true,
    ledgerSummary: `Replied to ${first}’s message ${channel === 'email' ? 'by email' : 'in the portal'} ${saidYes}`,
    ledgerDetail: { threadId, messageId: messageIdSent, channel },
  }
}
