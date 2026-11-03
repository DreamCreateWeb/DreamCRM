import 'server-only'
import { and, asc, eq, lte, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { aiConfigured } from '@/lib/ai'
import { fileProposal } from '@/lib/services/proposals'
import { filterWaitingThreads } from '@/lib/waiting-threads'
import { pickDefaultReplyChannel } from '@/lib/pick-default-reply-channel'
import { formatClinicDayTime } from '@/lib/format-datetime'

/**
 * PATIENT REPLIES (ML-12 — the first generator under ML-11's convention).
 *
 * A patient who wrote in and has been waiting gets a drafted reply sitting
 * in the Approval Inbox, not silence: the front desk opens the day to a
 * stack of "yes" buttons. The generator NEVER sends — `patient_reply` is
 * ask-first and not grantable (lib/autonomy.ts: a reply to someone who
 * wrote in is a conversation, and the practice may know the person).
 *
 * Selection — "waiting" is lib/waiting-threads.ts's ONE predicate (open,
 * the last word the patient's), applied here with a floor:
 *  - the patient's last message is at least WAITING_HOURS old. Clinic-local
 *    night counts the same as day — the point is "waiting", and a message
 *    that sat overnight is exactly the one the desk wants drafted by 8 AM;
 *  - urgent threads (the AI triage pin) first, then the longest-waiting;
 *  - a thread assigned to someone is still waiting — drafted anyway; the
 *    assignee sees the card like everyone else (ML-05's alert is separate);
 *  - at most MAX_PER_RUN cards per org per pass, so one hourly tick stays
 *    calm and bounds the draft allowance it spends.
 *
 * Dedupe — two guards, both before any AI spend:
 *  - ONE OPEN CARD PER THREAD (payload.threadId): a patient who writes
 *    twice while a card waits does not get two cards;
 *  - the sourceKey is `patient_reply:<threadId>:<lastInboundMessageId>` —
 *    the specific message being answered, not the thread. fileProposal is
 *    idempotent per (org, sourceKey) for good, so keying by thread alone
 *    would freeze a conversation after its first card; keying by message
 *    means each thing a patient wrote earns at most one ask, a decline is a
 *    "no" about THAT message, and a new message is a new question.
 *
 * The draft comes from message-ai's `draftPatientReply` — the same voice,
 * rules and monthly allowance the composer's "Draft with AI" uses — so the
 * card reads like the desk's own assist, and the allowance meters both.
 * AI off → the generator files nothing (a template reply to a specific
 * human is worse than none). A provider break reports through
 * `onSoftFailure` like the review-reply generator's; a per-thread miss
 * skips only that thread.
 *
 * PHI: the card carries the draft and the last few turns the way the
 * Messages page already shows them — inside `proposal.payload`, nowhere
 * new.
 */

/** How long the patient's last message must have sat before a draft is filed. */
export const PATIENT_REPLY_WAITING_HOURS = 3
/** Cards per org per pass. */
export const MAX_PATIENT_REPLIES_PER_RUN = 5
/** Threads read per pass (urgent-first, then longest-waiting) before the caps. */
const CANDIDATE_LIMIT = 20
/** How many turns of the conversation the card quotes under the draft. */
const QUOTED_TURNS = 4
const DAY_MS = 24 * 60 * 60 * 1000
/** A patient's question goes stale fast — one week, like an inquiry reply. */
const EXPIRES_DAYS = 7

export type OnSoftFailure = () => void

/** Cheap existence check so no AI draft is spent on an already-filed message. */
async function sourceKeyTaken(organizationId: string, sourceKey: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.proposal.id })
    .from(schema.proposal)
    .where(and(eq(schema.proposal.organizationId, organizationId), eq(schema.proposal.sourceKey, sourceKey)))
    .limit(1)
  return !!row
}

/** Threads that already have an OPEN patient_reply card (one card per thread). */
async function threadsWithOpenCard(organizationId: string): Promise<Set<string>> {
  const rows = await db
    .select({ payload: schema.proposal.payload })
    .from(schema.proposal)
    .where(
      and(
        eq(schema.proposal.organizationId, organizationId),
        eq(schema.proposal.capability, 'patient_reply'),
        eq(schema.proposal.status, 'open'),
      ),
    )
  const ids = new Set<string>()
  for (const r of rows) {
    const payload = (r.payload ?? {}) as Record<string, unknown>
    if (typeof payload.threadId === 'string') ids.add(payload.threadId)
  }
  return ids
}

export async function generatePatientReplyProposals(
  organizationId: string,
  now: Date,
  timeZone: string,
  onSoftFailure?: OnSoftFailure,
): Promise<number> {
  if (!aiConfigured()) return 0

  // The SQL half of the waiting predicate narrows the read; the pure
  // predicate is re-applied in memory below so the two can never disagree.
  const cutoff = new Date(now.getTime() - PATIENT_REPLY_WAITING_HOURS * 3_600_000)
  const candidates = await db
    .select({
      id: schema.patientThread.id,
      patientId: schema.patientThread.patientId,
      status: schema.patientThread.status,
      lastMessageDirection: schema.patientThread.lastMessageDirection,
      lastMessageAt: schema.patientThread.lastMessageAt,
      urgency: schema.patientThread.urgency,
    })
    .from(schema.patientThread)
    .where(
      and(
        eq(schema.patientThread.organizationId, organizationId),
        eq(schema.patientThread.status, 'open'),
        eq(schema.patientThread.lastMessageDirection, 'inbound'),
        lte(schema.patientThread.lastMessageAt, cutoff),
      ),
    )
    .orderBy(
      sql`case when ${schema.patientThread.urgency} = 'urgent' then 0 else 1 end`,
      asc(schema.patientThread.lastMessageAt),
    )
    .limit(CANDIDATE_LIMIT)

  const waiting = filterWaitingThreads(candidates, now, PATIENT_REPLY_WAITING_HOURS)
  if (waiting.length === 0) return 0

  const busy = await threadsWithOpenCard(organizationId)
  const [profile] = await db
    .select({ planTier: schema.clinicProfile.planTier })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, organizationId))
    .limit(1)
  const planTier = profile?.planTier ?? undefined

  // THE drafting home + THE thread readers, loaded only once there is work:
  // the same draft the composer's assist produces, over the same tenant-
  // scoped reads the Messages page uses.
  const [{ draftPatientReply }, { getPatientThreadById, listMessagesInThread }] = await Promise.all([
    import('@/lib/services/message-ai'),
    import('@/lib/services/patient-messaging'),
  ])

  let filed = 0
  for (const t of waiting) {
    if (filed >= MAX_PATIENT_REPLIES_PER_RUN) break
    if (busy.has(t.id)) continue

    const thread = await getPatientThreadById(organizationId, t.id)
    if (!thread) continue
    const messages = await listMessagesInThread(organizationId, t.id)
    const lastInbound = [...messages].reverse().find((m) => m.direction === 'inbound')
    if (!lastInbound) continue

    const sourceKey = `patient_reply:${t.id}:${lastInbound.id}`
    if (await sourceKeyTaken(organizationId, sourceKey)) continue

    const draft = await draftPatientReply({ organizationId, threadId: t.id, planTier })
    if (!draft.ok) {
      // Org-global reasons end the pass; a per-thread miss skips the thread.
      if (draft.reason === 'not_configured' || draft.reason === 'no_allowance') break
      // Only a PROVIDER break is an engine failure the Guardian should see.
      if (draft.reason === 'failed') onSoftFailure?.()
      continue
    }

    const first = thread.patientFirstName?.trim() || 'this patient'
    const fullName = [thread.patientFirstName, thread.patientLastName].filter(Boolean).join(' ').trim() || 'Patient'
    const channel = pickDefaultReplyChannel(messages, !!thread.patientEmail)
    const whenLabel = formatClinicDayTime(lastInbound.sentAt, timeZone)
    // The last few turns, oldest first, each stamped in the clinic's own
    // wall clock (the tz law) — the artifact never formats a date itself.
    const quoted = messages.slice(-QUOTED_TURNS).map((m) => ({
      from: m.direction === 'outbound' ? ('clinic' as const) : ('patient' as const),
      author: m.direction === 'outbound' ? m.sentByUserName ?? null : fullName,
      text: m.body,
      whenLabel: formatClinicDayTime(m.sentAt, timeZone),
    }))
    const toLine =
      channel === 'email' && thread.patientEmail ? `${fullName} · ${thread.patientEmail}` : `${fullName} · in the patient portal`

    const { filed: ok } = await fileProposal({
      organizationId,
      capability: 'patient_reply',
      sourceKey,
      patientId: thread.patientId,
      title: `Reply to ${first} — they wrote ${whenLabel} and haven’t heard back`,
      body: draft.draft,
      payload: {
        threadId: t.id,
        messageId: lastInbound.id,
        channel,
        // The thing being answered, named for the card's header line; the
        // conversation itself rides `thread` for the artifact.
        context: { kind: 'thread', author: fullName },
        thread: { messages: quoted, toLine },
      },
      expiresAt: new Date(now.getTime() + EXPIRES_DAYS * DAY_MS),
    })
    if (ok) filed++
  }
  return filed
}
