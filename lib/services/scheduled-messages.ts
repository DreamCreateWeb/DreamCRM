import 'server-only'
import { and, asc, eq, gte, inArray, lte, notInArray, or } from 'drizzle-orm'
import { listShutDownOrgIds } from './billing-state'
import { db, schema } from '@/lib/db'
import { randomBytes } from 'crypto'
import { sendMessageToPatient } from '@/lib/services/patient-messaging'
import { recordAction, recordEngineFailure } from '@/lib/services/action-ledger'
import { sanitizeAttachments, type MessageAttachment } from '@/lib/types/messaging'
import { sanitizeUploadedAttachments } from '@/lib/attachment-hosts'

/**
 * Scheduled (send-later) patient messages. Staff compose a reply now and pick a
 * future time; a cron flushes due rows by calling the normal send path. Kept in
 * its own `scheduled_message` table so an unsent message never appears in the
 * thread read path. Each due row is atomically claimed (pending → sending)
 * before sending, so overlapping cron runs can't double-send.
 */

export type ScheduledChannel = 'in_app' | 'email'

/** Don't let staff schedule absurdly far out (or in the past). */
const MIN_LEAD_MS = 60 * 1000 // at least a minute out
const MAX_HORIZON_MS = 60 * 24 * 60 * 60 * 1000 // 60 days

function newScheduledId(): string {
  return `smsg_${randomBytes(10).toString('hex')}`
}

export interface ScheduledMessageView {
  id: string
  channel: ScheduledChannel
  body: string
  attachments: MessageAttachment[]
  scheduledFor: string // ISO
  /** 'pending' (queued) or 'failed' (the cron tried and could not send). */
  status: string
  /** Why a failed row failed, in the words the send path threw — a human
   *  sentence ("Patient has no email on file"), never a stack. */
  lastError: string | null
}

/** A failed send stays visible in the composer this long; after that the
 *  bell row + the ledger entry remain the record. */
export const FAILED_VISIBLE_MS = 7 * 24 * 60 * 60 * 1000

/** One failure per clinic per day in the clinic's own story — the cron
 *  ticks every 15 minutes, and the Guardian counts DAYS of a broken thing. */
const FAILURE_LEDGER_WINDOW_MS = 24 * 60 * 60 * 1000

/** The body of the "didn't send" alert — the send path's own reason, then
 *  where to go. Pure so the wording can be pinned. */
export function scheduledFailureBody(reason: string | null): string {
  const why = reason?.trim() ? reason.trim().replace(/\.?$/, '.') : 'Something went wrong on our side.'
  return `${why} It’s waiting in the conversation — open it to retry or dismiss.`
}

/**
 * Queue a message for future delivery. Validates the channel, the body/
 * attachment presence, and the schedule window. Returns the new row id.
 */
export async function scheduleMessage(input: {
  organizationId: string
  patientId: string
  channel: ScheduledChannel
  body: string
  attachments?: MessageAttachment[]
  scheduledFor: Date
  createdByUserId?: string | null
}): Promise<{ id: string }> {
  if (input.channel !== 'in_app' && input.channel !== 'email') {
    throw new Error('Only in-app or email messages can be scheduled.')
  }
  // Client-supplied list: shape AND host must both check out (lib/attachment-hosts.ts).
  const attachments = sanitizeUploadedAttachments(input.attachments)
  if (!input.body.trim() && attachments.length === 0) {
    throw new Error('Add a message or an attachment to schedule.')
  }
  const when = input.scheduledFor.getTime()
  if (Number.isNaN(when)) throw new Error('Pick a valid send time.')
  const now = Date.now()
  if (when < now + MIN_LEAD_MS) throw new Error('Pick a send time at least a minute from now.')
  if (when > now + MAX_HORIZON_MS) throw new Error('Scheduled sends can be at most 60 days out.')

  // Cross-tenant guard — a foreign patientId must not be schedulable here.
  const [p] = await db
    .select({ id: schema.patient.id })
    .from(schema.patient)
    .where(and(eq(schema.patient.id, input.patientId), eq(schema.patient.organizationId, input.organizationId)))
    .limit(1)
  if (!p) throw new Error('Patient not found in this organization')

  const id = newScheduledId()
  await db.insert(schema.scheduledMessage).values({
    id,
    organizationId: input.organizationId,
    patientId: input.patientId,
    channel: input.channel,
    body: input.body.trim(),
    attachments,
    scheduledFor: input.scheduledFor,
    status: 'pending',
    createdByUserId: input.createdByUserId ?? null,
  })
  return { id }
}

/**
 * A patient's scheduled sends for the thread composer: every PENDING row,
 * plus FAILED rows from the last week. A failure used to drop out of this
 * list — and the violet "Scheduled" strip vanishing is exactly what a
 * successful send looks like, so staff believed it went out. Oldest first.
 */
export async function listScheduledForPatient(
  organizationId: string,
  patientId: string,
  now: Date = new Date(),
): Promise<ScheduledMessageView[]> {
  const failedSince = new Date(now.getTime() - FAILED_VISIBLE_MS)
  const rows = await db
    .select({
      id: schema.scheduledMessage.id,
      channel: schema.scheduledMessage.channel,
      body: schema.scheduledMessage.body,
      attachments: schema.scheduledMessage.attachments,
      scheduledFor: schema.scheduledMessage.scheduledFor,
      status: schema.scheduledMessage.status,
      lastError: schema.scheduledMessage.lastError,
    })
    .from(schema.scheduledMessage)
    .where(
      and(
        eq(schema.scheduledMessage.organizationId, organizationId),
        eq(schema.scheduledMessage.patientId, patientId),
        or(
          eq(schema.scheduledMessage.status, 'pending'),
          and(eq(schema.scheduledMessage.status, 'failed'), gte(schema.scheduledMessage.updatedAt, failedSince)),
        ),
      ),
    )
    .orderBy(asc(schema.scheduledMessage.scheduledFor))
  return rows.map((r) => ({
    id: r.id,
    channel: r.channel as ScheduledChannel,
    body: r.body,
    attachments: sanitizeAttachments(r.attachments),
    scheduledFor: r.scheduledFor.toISOString(),
    status: r.status,
    lastError: r.status === 'failed' ? (r.lastError ?? null) : null,
  }))
}

/** Cancel a pending scheduled send — or DISMISS a failed one (same terminal
 *  state: it will never go out). Org-scoped, idempotent — a sent, already-
 *  canceled or foreign row simply matches nothing. */
export async function cancelScheduledMessage(organizationId: string, id: string): Promise<void> {
  await db
    .update(schema.scheduledMessage)
    .set({ status: 'canceled', updatedAt: new Date() })
    .where(
      and(
        eq(schema.scheduledMessage.id, id),
        eq(schema.scheduledMessage.organizationId, organizationId),
        inArray(schema.scheduledMessage.status, ['pending', 'failed']),
      ),
    )
}

/**
 * Put a FAILED send back in the queue — a human's click, never automatic.
 * The row goes back to 'pending' due NOW, so the next flush (the 15-minute
 * cron) sends it through the normal path with every validation intact: no
 * email on file still refuses, and the atomic claim still rules out a double
 * send. Only a 'failed' row matches, so a retry can never resurrect a sent or
 * canceled message. Returns false when nothing matched.
 */
export async function retryScheduledMessage(organizationId: string, id: string, now: Date = new Date()): Promise<boolean> {
  const rows = await db
    .update(schema.scheduledMessage)
    .set({ status: 'pending', scheduledFor: now, lastError: null, updatedAt: now })
    .where(
      and(
        eq(schema.scheduledMessage.id, id),
        eq(schema.scheduledMessage.organizationId, organizationId),
        eq(schema.scheduledMessage.status, 'failed'),
      ),
    )
    .returning({ id: schema.scheduledMessage.id })
  return rows.length > 0
}

export interface FlushResult {
  due: number
  sent: number
  failed: number
}

/**
 * Cron flush: deliver every pending scheduled message whose time has come.
 * Atomically claims due rows (pending → sending) so two overlapping runs can't
 * both send. Each send goes through the normal path (delivery + thread upsert);
 * a failure marks that one 'failed' with the error and never blocks the others.
 */
export async function sendDueScheduledMessages(now: Date = new Date()): Promise<FlushResult> {
  // THE KILL (owner ruling): a shut-down org's scheduled messages stay
  // PENDING — excluded from the claim itself, so paying releases them
  // untouched on the next tick.
  const shutDown = await listShutDownOrgIds(now)
  // Claim due rows in one atomic UPDATE … RETURNING so a concurrent run sees
  // them already 'sending'.
  const claimed = await db
    .update(schema.scheduledMessage)
    .set({ status: 'sending', updatedAt: now })
    .where(
      and(
        eq(schema.scheduledMessage.status, 'pending'),
        lte(schema.scheduledMessage.scheduledFor, now),
        shutDown.size > 0 ? notInArray(schema.scheduledMessage.organizationId, Array.from(shutDown)) : undefined,
      ),
    )
    .returning({
      id: schema.scheduledMessage.id,
      organizationId: schema.scheduledMessage.organizationId,
      patientId: schema.scheduledMessage.patientId,
      channel: schema.scheduledMessage.channel,
      body: schema.scheduledMessage.body,
      attachments: schema.scheduledMessage.attachments,
      createdByUserId: schema.scheduledMessage.createdByUserId,
    })

  let sent = 0
  let failed = 0
  for (const row of claimed) {
    try {
      const result = await sendMessageToPatient({
        organizationId: row.organizationId,
        patientId: row.patientId,
        body: row.body,
        channel: row.channel as ScheduledChannel,
        sentByUserId: row.createdByUserId ?? '',
        attachments: sanitizeAttachments(row.attachments),
      })
      await db
        .update(schema.scheduledMessage)
        .set({ status: 'sent', sentMessageId: result.messageId, updatedAt: new Date() })
        .where(eq(schema.scheduledMessage.id, row.id))
      sent++
      // Staff wrote it; the MACHINE delivered it at the chosen moment — the
      // delivery is the machine's work, so it reports (same actor line as
      // cron-flushed scheduled campaigns; round-2 audit). In its OWN
      // try/catch: this bookkeeping runs after the row is already 'sent',
      // and a lookup blip must never flip a DELIVERED message to 'failed'
      // (round-3 audit — staff would resend and double-text the patient).
      // Third-person narration: the standup's reader is usually not the
      // scheduler, so the summary names them instead of saying "you".
      try {
        const [pat] = await db
          .select({ firstName: schema.patient.firstName })
          .from(schema.patient)
          .where(and(eq(schema.patient.organizationId, row.organizationId), eq(schema.patient.id, row.patientId)))
          .limit(1)
        let schedulerName: string | null = null
        if (row.createdByUserId) {
          const [scheduler] = await db
            .select({ name: schema.user.name })
            .from(schema.user)
            .where(eq(schema.user.id, row.createdByUserId))
            .limit(1)
          schedulerName = scheduler?.name?.trim() || null
        }
        await recordAction({
          organizationId: row.organizationId,
          capability: 'scheduled_message',
          patientId: row.patientId,
          summary: `Delivered the message ${schedulerName ?? 'the team'} scheduled for ${pat?.firstName ?? 'a patient'}`,
          detail: { scheduledMessageId: row.id, channel: row.channel, scheduledByUserId: row.createdByUserId },
        })
      } catch (err) {
        console.warn('[scheduled-messages] ledger bookkeeping failed (message already delivered):', err)
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message.slice(0, 500) : 'unknown'
      await db
        .update(schema.scheduledMessage)
        .set({
          status: 'failed',
          lastError: reason,
          updatedAt: new Date(),
        })
        .where(eq(schema.scheduledMessage.id, row.id))
      failed++
      // TELL SOMEBODY. The row is the record; this is the alarm — the
      // person who scheduled it (else the owners/admins) gets an urgent bell
      // + email, and the clinic's own story gets a failure entry so the
      // Guardian can see a pattern. Best-effort in its own try/catch: the
      // row is already 'failed', and a notify blip must not abort the loop.
      await reportScheduledFailure(row, reason).catch((e) => {
        console.warn('[scheduled-messages] failure alert did not go out (row is marked failed):', e)
      })
    }
  }
  return { due: claimed.length, sent, failed }
}

/** The "didn't send" alert for one failed row. Exported for the flush only. */
async function reportScheduledFailure(
  row: { id: string; organizationId: string; patientId: string; channel: string; createdByUserId: string | null },
  reason: string,
): Promise<void> {
  const [pat] = await db
    .select({ firstName: schema.patient.firstName })
    .from(schema.patient)
    .where(and(eq(schema.patient.organizationId, row.organizationId), eq(schema.patient.id, row.patientId)))
    .limit(1)
  const first = pat?.firstName?.trim() || 'a patient'
  const [thread] = await db
    .select({ id: schema.patientThread.id })
    .from(schema.patientThread)
    .where(and(eq(schema.patientThread.organizationId, row.organizationId), eq(schema.patientThread.patientId, row.patientId)))
    .limit(1)
  const linkPath = thread?.id ? `/messages?thread=${thread.id}` : '/messages'
  const alert = {
    bucket: 'comments' as const,
    type: 'scheduled_message_failed',
    title: `The message you scheduled for ${first} didn’t send`,
    body: scheduledFailureBody(reason),
    linkPath,
    linkLabel: `Open ${first}’s conversation →`,
    meta: { scheduledMessageId: row.id, patientId: row.patientId, channel: row.channel },
    // One alert per failed row, however many times a replayed tick looks at it.
    dedupeKey: `scheduled_message_failed:${row.organizationId}:${row.id}`,
  }
  const { notify, notifyOrgMembers } = await import('@/lib/services/notifications')
  // The scheduler hears it first — but only while they are still on this
  // clinic's team (a departed staffer must not be emailed a patient's name).
  // Otherwise the owners/admins do.
  const scheduler = row.createdByUserId
    ? await db
        .select({ userId: schema.member.userId })
        .from(schema.member)
        .where(and(eq(schema.member.organizationId, row.organizationId), eq(schema.member.userId, row.createdByUserId)))
        .limit(1)
        .then((rows) => rows[0] ?? null)
    : null
  if (scheduler) {
    await notify({ ...alert, userId: scheduler.userId, organizationId: row.organizationId })
  } else {
    await notifyOrgMembers(row.organizationId, alert, { roles: ['owner', 'admin'] })
  }
  await recordEngineFailure({
    organizationId: row.organizationId,
    capability: 'scheduled_message',
    patientId: row.patientId,
    summary: `Couldn’t send the message scheduled for ${first} — it’s waiting in Messages to retry or dismiss.`,
    detail: { scheduledMessageId: row.id, reason },
    onceWithin: FAILURE_LEDGER_WINDOW_MS,
    kind: 'engine',
  })
}

/**
 * Re-arm scheduled rows that got stuck in 'sending' (e.g. the process died
 * mid-flush). Anything older than the threshold goes back to 'pending' so the
 * next run retries it. Defensive — should rarely match.
 *
 * ONE STATEMENT, NOT SELECT-THEN-UPDATE. This used to read the stuck ids and
 * then update by `id in (…)` with nothing else in the WHERE — so between the
 * two statements the flush that OWNED the row could finish, mark it 'sent',
 * and have this blind write flip it straight back to 'pending'. The next
 * flush claimed it and the patient got the same message twice. The row most
 * likely to lose that race is exactly the one this function exists for: the
 * one that has been sending for almost precisely `olderThanMs`. A 'failed'
 * row was resurrected the same way, discarding the error staff were about to
 * read.
 *
 * Folding the test into the UPDATE closes the window completely: Postgres
 * takes the row lock and re-evaluates `status = 'sending'` against the
 * committed row, so a message that finished while we were deciding is simply
 * not matched. The count returned is what was actually re-armed, not what an
 * earlier scan happened to see.
 */
export async function requeueStuckScheduledMessages(olderThanMs = 10 * 60 * 1000): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs)
  const requeued = await db
    .update(schema.scheduledMessage)
    .set({ status: 'pending', updatedAt: new Date() })
    .where(and(eq(schema.scheduledMessage.status, 'sending'), lte(schema.scheduledMessage.updatedAt, cutoff)))
    .returning({ id: schema.scheduledMessage.id })
  if (requeued.length > 0) {
    console.warn('[scheduled-messages] re-armed stranded sends', { count: requeued.length })
  }
  return requeued.length
}
