import 'server-only'
import { and, asc, eq, lte, inArray } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { randomBytes } from 'crypto'
import { sendMessageToPatient } from '@/lib/services/patient-messaging'
import { sanitizeAttachments, type MessageAttachment } from '@/lib/types/messaging'

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
  const attachments = sanitizeAttachments(input.attachments)
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
}

/**
 * Cron flush: deliver every pending scheduled message whose time has come.
 * Atomically claims due rows (pending → sending) so two overlapping runs can't
 * both send. Each send goes through the normal path (delivery + thread upsert);
 * a failure marks that one 'failed' with the error and never blocks the others.
 */
export async function sendDueScheduledMessages(now: Date = new Date()): Promise<FlushResult> {
  // Claim due rows in one atomic UPDATE … RETURNING so a concurrent run sees
  // them already 'sending'.
  const claimed = await db
    .update(schema.scheduledMessage)
    .set({ status: 'sending', updatedAt: now })
    .where(
      and(
        eq(schema.scheduledMessage.status, 'pending'),
        lte(schema.scheduledMessage.scheduledFor, now),
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
    } catch (err) {
      await db
        .update(schema.scheduledMessage)
        .set({
          status: 'failed',
          lastError: err instanceof Error ? err.message.slice(0, 500) : 'unknown',
          updatedAt: new Date(),
        })
        .where(eq(schema.scheduledMessage.id, row.id))
      failed++
    }
  }
  return { due: claimed.length, sent, failed }
}

/**
 * Re-arm scheduled rows that got stuck in 'sending' (e.g. the process died
 * mid-flush). Anything older than the threshold goes back to 'pending' so the
 * next run retries it. Defensive — should rarely match.
 */
export async function requeueStuckScheduledMessages(olderThanMs = 10 * 60 * 1000): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs)
  const stuck = await db
    .select({ id: schema.scheduledMessage.id })
    .from(schema.scheduledMessage)
    .where(and(eq(schema.scheduledMessage.status, 'sending'), lte(schema.scheduledMessage.updatedAt, cutoff)))
  if (stuck.length === 0) return 0
  await db
    .update(schema.scheduledMessage)
    .set({ status: 'pending', updatedAt: new Date() })
    .where(inArray(schema.scheduledMessage.id, stuck.map((s) => s.id)))
  return stuck.length
}
