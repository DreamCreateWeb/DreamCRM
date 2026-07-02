'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import {
  archiveThread,
  assignThread,
  markThreadRead,
  markThreadUnread,
  reopenThread,
  sendMessageToPatient,
  setThreadStarred,
  snoozeThread,
  type MessageChannel,
} from '@/lib/services/patient-messaging'
import { draftPatientReply } from '@/lib/services/message-ai'
import { previewBroadcastCounts, sendBroadcast } from '@/lib/services/broadcast'
import { isBroadcastSegment, type BroadcastSegmentKey } from '@/lib/types/broadcast'
import {
  scheduleMessage,
  cancelScheduledMessage,
  type ScheduledChannel,
} from '@/lib/services/scheduled-messages'
import type { MessageAttachment } from '@/lib/types/messaging'

function ensureClinic(ctx: { tenantType: string; role: string }) {
  if (ctx.tenantType !== 'clinic') {
    throw new Error('Patient communications is only available for clinic tenants.')
  }
  if (ctx.role === 'patient') {
    throw new Error('Patient role cannot access clinic messages.')
  }
}

export async function sendMessageAction(input: {
  patientId: string
  body: string
  channel: MessageChannel
  attachments?: MessageAttachment[]
}) {
  const ctx = await requireTenant()
  ensureClinic(ctx)
  const result = await sendMessageToPatient({
    organizationId: ctx.organizationId,
    patientId: input.patientId,
    body: input.body,
    channel: input.channel,
    sentByUserId: ctx.userId,
    attachments: input.attachments,
  })
  revalidatePath('/messages')
  return result
}

/** AI-draft the next reply for a thread. Review-only — fills the composer for
 *  staff to edit; never sends. Gated by the monthly draft allowance. */
export async function draftReplyAction(threadId: string) {
  const ctx = await requireTenant()
  ensureClinic(ctx)
  return draftPatientReply({ organizationId: ctx.organizationId, threadId, planTier: ctx.planTier })
}

/** Queue a message to send later. `scheduledForIso` is an ISO instant built
 *  from the staff member's chosen date + time. Returns `{ ok | error }`. */
export async function scheduleMessageAction(input: {
  patientId: string
  body: string
  channel: ScheduledChannel
  scheduledForIso: string
  attachments?: MessageAttachment[]
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  ensureClinic(ctx)
  try {
    const { id } = await scheduleMessage({
      organizationId: ctx.organizationId,
      patientId: input.patientId,
      body: input.body,
      channel: input.channel,
      attachments: input.attachments,
      scheduledFor: new Date(input.scheduledForIso),
      createdByUserId: ctx.userId,
    })
    revalidatePath('/messages')
    return { ok: true, id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not schedule the message.' }
  }
}

/** Cancel a pending scheduled send. */
export async function cancelScheduledMessageAction(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  ensureClinic(ctx)
  try {
    await cancelScheduledMessage(ctx.organizationId, id)
    revalidatePath('/messages')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not cancel.' }
  }
}

export async function assignThreadAction(threadId: string, assigneeUserId: string | null) {
  const ctx = await requireTenant()
  ensureClinic(ctx)
  await assignThread(ctx.organizationId, threadId, assigneeUserId, ctx.userId)
  revalidatePath('/messages')
}

export async function snoozeThreadAction(threadId: string, hours: number) {
  const ctx = await requireTenant()
  ensureClinic(ctx)
  const until = new Date(Date.now() + hours * 60 * 60 * 1000)
  await snoozeThread(ctx.organizationId, threadId, until)
  revalidatePath('/messages')
}

export async function archiveThreadAction(threadId: string) {
  const ctx = await requireTenant()
  ensureClinic(ctx)
  await archiveThread(ctx.organizationId, threadId)
  revalidatePath('/messages')
}

export async function reopenThreadAction(threadId: string) {
  const ctx = await requireTenant()
  ensureClinic(ctx)
  await reopenThread(ctx.organizationId, threadId)
  revalidatePath('/messages')
}

export async function markReadAction(threadId: string) {
  const ctx = await requireTenant()
  ensureClinic(ctx)
  await markThreadRead(ctx.organizationId, threadId)
  revalidatePath('/messages')
}

/** Flag a read thread as unread again so it returns to the needs-attention
 *  view + the nav badge (email-style mark-unread). */
export async function markUnreadAction(threadId: string) {
  const ctx = await requireTenant()
  ensureClinic(ctx)
  await markThreadUnread(ctx.organizationId, threadId)
  revalidatePath('/messages')
}

/** Toggle the staff "star" (priority flag) on a thread. */
export async function toggleStarAction(threadId: string, starred: boolean) {
  const ctx = await requireTenant()
  ensureClinic(ctx)
  await setThreadStarred(ctx.organizationId, threadId, starred)
  revalidatePath('/messages')
}

/** Cap + dedupe a bulk id list so a runaway client can't make us loop
 *  thousands of times; order is irrelevant for these idempotent, org-scoped
 *  writes (a foreign id simply matches no row). */
function clampThreadIds(ids: string[]): string[] {
  return Array.from(new Set(Array.isArray(ids) ? ids : []))
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
    .slice(0, 200)
}

export async function bulkArchiveThreadsAction(threadIds: string[]) {
  const ctx = await requireTenant()
  ensureClinic(ctx)
  for (const id of clampThreadIds(threadIds)) {
    await archiveThread(ctx.organizationId, id)
  }
  revalidatePath('/messages')
}

export async function bulkSnoozeThreadsAction(threadIds: string[], hours: number) {
  const ctx = await requireTenant()
  ensureClinic(ctx)
  const until = new Date(Date.now() + hours * 60 * 60 * 1000)
  for (const id of clampThreadIds(threadIds)) {
    await snoozeThread(ctx.organizationId, id, until)
  }
  revalidatePath('/messages')
}

export async function bulkMarkReadThreadsAction(threadIds: string[]) {
  const ctx = await requireTenant()
  ensureClinic(ctx)
  for (const id of clampThreadIds(threadIds)) {
    await markThreadRead(ctx.organizationId, id)
  }
  revalidatePath('/messages')
}

/** Broadcasts are a megaphone — owner/admin only (a member can still message
 *  patients one at a time). */
function ensureBroadcaster(ctx: { tenantType: string; role: string }) {
  ensureClinic(ctx)
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    throw new Error('Only owners and admins can send a broadcast.')
  }
}

/** Segment recipient counts for the broadcast modal's picker. */
export async function broadcastPreviewAction(): Promise<
  { ok: true; counts: Record<BroadcastSegmentKey, number> } | { ok: false; error: string }
> {
  const ctx = await requireTenant()
  try {
    ensureBroadcaster(ctx)
    return { ok: true, counts: await previewBroadcastCounts(ctx.organizationId) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong.' }
  }
}

export async function sendBroadcastAction(input: {
  segment: string
  body: string
}): Promise<
  { ok: true; sent: number; failed: number } | { ok: false; error: string }
> {
  const ctx = await requireTenant()
  try {
    ensureBroadcaster(ctx)
    if (!isBroadcastSegment(input.segment)) return { ok: false, error: 'Pick who this goes to first.' }
    const r = await sendBroadcast({
      organizationId: ctx.organizationId,
      segment: input.segment,
      body: input.body,
      sentByUserId: ctx.userId,
    })
    if (!r.ok) return r
    revalidatePath('/messages')
    return { ok: true, sent: r.sent, failed: r.failed }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong.' }
  }
}
