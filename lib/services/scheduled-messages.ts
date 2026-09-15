import 'server-only'
import { and, asc, eq, lte, notInArray } from 'drizzle-orm'
import { listShutDownOrgIds } from './billing-state'
import { db, schema } from '@/lib/db'
import { randomBytes } from 'crypto'
import { sendMessageToPatient } from '@/lib/services/patient-messaging'
import { recordAction } from '@/lib/services/action-ledger'
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
  status: string
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

/** Pending scheduled sends for a patient (newest schedule last), for the
 *  thread composer to show + offer cancel. */
export async function listScheduledForPatient(
  organizationId: string,
  patientId: string,
): Promise<ScheduledMessageView[]> {
  const rows = await db
    .select({
      id: schema.scheduledMessage.id,
      channel: schema.scheduledMessage.channel,
      body: schema.scheduledMessage.body,
      attachments: schema.scheduledMessage.attachments,
      scheduledFor: schema.scheduledMessage.scheduledFor,
      status: schema.scheduledMessage.status,
    })
    .from(schema.scheduledMessage)
    .where(
      and(
        eq(schema.scheduledMessage.organizationId, organizationId),
        eq(schema.scheduledMessage.patientId, patientId),
        eq(schema.scheduledMessage.status, 'pending'),
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
  }))
}

/** Cancel a pending scheduled send (org-scoped, idempotent — a non-pending or
 *  foreign row simply matches nothing). */
export async function cancelScheduledMessage(organizationId: string, id: string): Promise<void> {
  await db
    .update(schema.scheduledMessage)
    .set({ status: 'canceled', updatedAt: new Date() })
    .where(
      and(
        eq(schema.scheduledMessage.id, id),
        eq(schema.scheduledMessage.organizationId, organizationId),
        eq(schema.scheduledMessage.status, 'pending'),
      ),
    )
}

export interface FlushResult {
  due: number
  sent: number
  failed: number
  /** Rows this run claimed but did NOT send, because something re-armed them
   *  mid-flush (the stuck requeue, almost always). A non-zero count here means
   *  the flush is running long enough to collide with STUCK_AFTER_MS — worth
   *  looking at, and previously the point at which a patient got texted twice. */
  requeued: number
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
  let requeued = 0
  for (const row of claimed) {
    // RE-CLAIM BEFORE SENDING (DREAMCRM-57). The batch claim above stamps
    // every row's updatedAt at t=0, but this loop then walks them one send at
    // a time — a big flush is minutes long. `requeueStuckScheduledMessages`
    // runs at the top of the NEXT tick and re-arms anything 'sending' older
    // than STUCK_AFTER_MS, so it was flipping rows this run had claimed and
    // was still about to send back to 'pending'. The next tick then claimed
    // and sent them a SECOND time, and the patient got the text twice.
    //
    // The re-claim does two jobs in one statement: it proves the row is still
    // ours (status is still 'sending'), and it refreshes updatedAt so the
    // requeue's clock measures time since WE last touched this row rather than
    // since the batch started. A row that lost the race is skipped, not sent —
    // whoever re-armed it owns it now.
    const stillOurs = await db
      .update(schema.scheduledMessage)
      .set({ updatedAt: new Date() })
      .where(
        and(
          eq(schema.scheduledMessage.id, row.id),
          eq(schema.scheduledMessage.status, 'sending'),
        ),
      )
      .returning({ id: schema.scheduledMessage.id })
    if (stillOurs.length === 0) {
      requeued++
      continue
    }

    try {
      const result = await sendMessageToPatient({
        organizationId: row.organizationId,
        patientId: row.patientId,
        body: row.body,
        channel: row.channel as ScheduledChannel,
        sentByUserId: row.createdByUserId ?? '',
        attachments: sanitizeAttachments(row.attachments),
      })
      // Terminal write CAS'd on 'sending' for the same reason as the re-claim:
      // if the row WAS re-armed during the send, it now belongs to another run
      // and stamping it 'sent' from here would silently cancel that run's
      // delivery. The message did go out, so it still counts as sent.
      await db
        .update(schema.scheduledMessage)
        .set({ status: 'sent', sentMessageId: result.messageId, updatedAt: new Date() })
        .where(
          and(
            eq(schema.scheduledMessage.id, row.id),
            eq(schema.scheduledMessage.status, 'sending'),
          ),
        )
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
      // Same CAS. A row re-armed mid-send must not be dragged to 'failed' out
      // from under the run that now holds it.
      await db
        .update(schema.scheduledMessage)
        .set({
          status: 'failed',
          lastError: err instanceof Error ? err.message.slice(0, 500) : 'unknown',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.scheduledMessage.id, row.id),
            eq(schema.scheduledMessage.status, 'sending'),
          ),
        )
      failed++
    }
  }
  return { due: claimed.length, sent, failed, requeued }
}

/**
 * How long a row may sit in 'sending' before it is treated as abandoned.
 * The flush re-stamps `updatedAt` immediately before each send, so this is
 * time since the last thing that TOUCHED the row — not time since the batch
 * started, which is what made a long flush look stuck to itself.
 */
export const SCHEDULED_STUCK_AFTER_MS = 10 * 60 * 1000

/**
 * Re-arm scheduled rows that got stuck in 'sending' (e.g. the process died
 * mid-flush). Anything untouched for longer than the threshold goes back to
 * 'pending' so the next run retries it. Defensive — should rarely match.
 *
 * ONE statement (DREAMCRM-57). It used to SELECT the stuck ids and then UPDATE
 * them by id with no status re-check, which is a TOCTOU wide enough to matter:
 * a row that reached 'sent' between the two queries was dragged back to
 * 'pending' and the next tick texted the patient again. The guard has to be in
 * the same statement as the write.
 */
export async function requeueStuckScheduledMessages(
  olderThanMs = SCHEDULED_STUCK_AFTER_MS,
): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs)
  const requeued = await db
    .update(schema.scheduledMessage)
    .set({ status: 'pending', updatedAt: new Date() })
    .where(
      and(
        eq(schema.scheduledMessage.status, 'sending'),
        lte(schema.scheduledMessage.updatedAt, cutoff),
      ),
    )
    .returning({ id: schema.scheduledMessage.id })
  return requeued.length
}
