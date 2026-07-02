'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireTenant } from '@/lib/auth/context'
import {
  addPatientFromEmail,
  bulkArchive,
  bulkArchiveThreads,
  bulkSetRead,
  bulkSetStarred,
  bulkSetThreadRead,
  bulkSetThreadStarred,
  bulkTrash,
  bulkTrashThreads,
  classifyPendingIntents,
  ensureRfcMessageId,
  reclassifyAll,
  disconnectAccount as svcDisconnect,
  getMessageDetail,
  getThreadDetail,
  sendEmail,
  setMessageCategory as svcSetMessageCategory,
  syncAccount,
} from '@/lib/services/mailbox'
import { EMAIL_CATEGORIES } from '@/lib/db/schema/email'
import { draftReply } from '@/lib/services/ai-mailbox'
import { getInboxPatientContext } from '@/lib/services/patient-context'
import { getClinicTimeZone } from '@/lib/services/clinic-timezone'
import type { InboxActor } from '@/lib/services/inbox-audit'

async function requireOrgUser() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') throw new Error('Forbidden')
  return ctx
}

function userActor(userId: string): InboxActor {
  return { kind: 'user', userId }
}

export async function syncMailbox(accountId: string) {
  const ctx = await requireOrgUser()
  const result = await syncAccount(accountId, ctx.organizationId, { limit: 50 })
  revalidatePath('/inbox')
  revalidatePath('/inbox/settings')
  return result
}

export async function disconnectMailbox(accountId: string) {
  const ctx = await requireOrgUser()
  await svcDisconnect(accountId, ctx.organizationId)
  revalidatePath('/inbox')
  revalidatePath('/inbox/settings')
  return { ok: true }
}

/**
 * Thread-level variants of the per-message ops. The inbox UI operates
 * on whole conversations, not individual messages — these are thin
 * wrappers around the bulk*Threads service functions that take a single
 * thread id and the calling user as the actor.
 */
export async function archiveThreadAction(threadId: string) {
  const ctx = await requireOrgUser()
  await bulkArchiveThreads([threadId], ctx.organizationId, userActor(ctx.userId))
  revalidatePath('/inbox')
  return { ok: true }
}

export async function trashThreadAction(threadId: string) {
  const ctx = await requireOrgUser()
  await bulkTrashThreads([threadId], ctx.organizationId, userActor(ctx.userId))
  revalidatePath('/inbox')
  return { ok: true }
}

export async function markThreadAction(threadId: string, read: boolean) {
  const ctx = await requireOrgUser()
  await bulkSetThreadRead([threadId], ctx.organizationId, read, userActor(ctx.userId))
  revalidatePath('/inbox')
  return { ok: true }
}

export async function toggleThreadStarAction(threadId: string, starred: boolean) {
  const ctx = await requireOrgUser()
  await bulkSetThreadStarred([threadId], ctx.organizationId, starred, userActor(ctx.userId))
  revalidatePath('/inbox')
  return { ok: true }
}

const SetCategoryInput = z.object({
  messageId: z.string().min(1),
  category: z.enum(EMAIL_CATEGORIES),
})

export async function setMessageCategoryAction(input: unknown): Promise<{ updated: number }> {
  const ctx = await requireOrgUser()
  const { messageId, category } = SetCategoryInput.parse(input)
  const result = await svcSetMessageCategory(messageId, ctx.organizationId, category, userActor(ctx.userId))
  revalidatePath('/inbox')
  return result
}

const BULK_ACTIONS = ['archive', 'trash', 'mark_read', 'mark_unread', 'star', 'unstar'] as const
type BulkAction = (typeof BULK_ACTIONS)[number]

const BulkInput = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
  action: z.enum(BULK_ACTIONS),
})

/**
 * Apply an action across many messages selected as flat ids (rarely used
 * directly now; the thread-level wrapper below is preferred for the inbox
 * UX, which selects whole conversations).
 */
export async function bulkMessageAction(input: unknown): Promise<{ count: number }> {
  const ctx = await requireOrgUser()
  const { ids, action } = BulkInput.parse(input)
  const actor = userActor(ctx.userId)
  let result = { count: 0 }
  switch (action as BulkAction) {
    case 'archive':
      result = await bulkArchive(ids, ctx.organizationId, actor)
      break
    case 'trash':
      result = await bulkTrash(ids, ctx.organizationId, actor)
      break
    case 'mark_read':
      result = await bulkSetRead(ids, ctx.organizationId, true, actor)
      break
    case 'mark_unread':
      result = await bulkSetRead(ids, ctx.organizationId, false, actor)
      break
    case 'star':
      result = await bulkSetStarred(ids, ctx.organizationId, true, actor)
      break
    case 'unstar':
      result = await bulkSetStarred(ids, ctx.organizationId, false, actor)
      break
  }
  revalidatePath('/inbox')
  return result
}

/**
 * Apply an action to every message in each selected thread. This is what
 * the sidebar bulk-action bar calls — selection state is thread-based, so
 * archive/trash/read/etc. need to fan out over the thread members.
 */
export async function bulkThreadAction(input: unknown): Promise<{ count: number }> {
  const ctx = await requireOrgUser()
  const { ids, action } = BulkInput.parse(input)
  const actor = userActor(ctx.userId)
  let result = { count: 0 }
  switch (action as BulkAction) {
    case 'archive':
      result = await bulkArchiveThreads(ids, ctx.organizationId, actor)
      break
    case 'trash':
      result = await bulkTrashThreads(ids, ctx.organizationId, actor)
      break
    case 'mark_read':
      result = await bulkSetThreadRead(ids, ctx.organizationId, true, actor)
      break
    case 'mark_unread':
      result = await bulkSetThreadRead(ids, ctx.organizationId, false, actor)
      break
    case 'star':
      result = await bulkSetThreadStarred(ids, ctx.organizationId, true, actor)
      break
    case 'unstar':
      result = await bulkSetThreadStarred(ids, ctx.organizationId, false, actor)
      break
  }
  revalidatePath('/inbox')
  return result
}

const AddPatientInput = z.object({
  messageId: z.string().min(1),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email(),
  phone: z.string().nullable().optional(),
})

export async function addPatientFromEmailAction(input: unknown) {
  const ctx = await requireOrgUser()
  const data = AddPatientInput.parse(input)
  const result = await addPatientFromEmail({
    organizationId: ctx.organizationId,
    fromEmail: data.email,
    firstName: data.firstName,
    lastName: data.lastName,
    phone: data.phone ?? null,
    messageId: data.messageId,
  })
  revalidatePath('/inbox')
  return result
}

/**
 * AI: draft a reply for the given message. Uses Claude Sonnet with adaptive
 * thinking and folds in the matched patient's record so the draft references
 * upcoming visits, history, etc. Returns the plain-text draft for the user
 * to review + edit before sending.
 */
export async function draftReplyAction(messageId: string): Promise<{ draft: string | null }> {
  const ctx = await requireOrgUser()
  const message = await getMessageDetail(messageId, ctx.organizationId)
  if (!message) return { draft: null }
  const patientCtx = message.patientId
    ? await getInboxPatientContext(message.patientId, ctx.organizationId)
    : null
  const draft = await draftReply({
    patientContext: patientCtx,
    originalSubject: message.subject,
    originalBody: message.bodyText ?? message.snippet ?? '',
    fromName: message.fromName,
    fromEmail: message.fromEmail,
    tenantType: ctx.tenantType === 'platform' ? 'platform' : 'clinic',
  })
  return { draft }
}

/**
 * AI: backfill intents for any messages that haven't been classified yet.
 * Exposed as an admin button on /inbox/settings; also runs automatically
 * after every sync.
 */
export async function classifyPendingAction(): Promise<{ classified: number }> {
  const ctx = await requireOrgUser()
  const result = await classifyPendingIntents(ctx.organizationId, { limit: 200 })
  revalidatePath('/inbox')
  return result
}

/**
 * One-shot backlog repair — resets every auto-classified message back
 * to "pending" and re-runs the (now-improved) classifier. Skips messages
 * the user or Gmail labeled directly. Exposed on /inbox/settings.
 */
export async function reclassifyAllAction(): Promise<{
  reset: number
  classified: number
  viaHeuristic: number
  remaining: number
}> {
  const ctx = await requireOrgUser()
  const result = await reclassifyAll(ctx.organizationId)
  revalidatePath('/inbox')
  return result
}

const SendInput = z.object({
  accountId: z.string().min(1),
  to: z.string().min(1),
  cc: z.string().optional().default(''),
  subject: z.string().min(1).max(998),
  body: z.string().min(1).max(50_000),
  /** When replying, the message id this reply targets. Drives In-Reply-To
   *  + References headers and the quoted-original body for deliverability. */
  replyToMessageId: z.string().optional(),
})

function splitAddresses(raw: string): string[] {
  return raw
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function buildQuotedBody(
  original: {
    fromName: string | null
    fromEmail: string
    receivedAt: Date
    bodyText: string | null
    snippet: string | null
  },
  timeZone: string,
): string {
  const sender = original.fromName
    ? `${original.fromName} <${original.fromEmail}>`
    : original.fromEmail
  // Clinic wall-clock — this runs on the UTC server, and the quoted line
  // ("On Wed, Jul 1, 1:04 PM, … wrote:") is patient-visible in the reply.
  const when = original.receivedAt.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  })
  const body = (original.bodyText ?? original.snippet ?? '').trim()
  const quoted = body
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n')
  return `\n\nOn ${when}, ${sender} wrote:\n${quoted}`
}

export async function sendMailbox(input: unknown) {
  const ctx = await requireOrgUser()
  const data = SendInput.parse(input)

  let inReplyTo: string | undefined
  let references: string | undefined
  let bodyText = data.body

  if (data.replyToMessageId) {
    // JIT backfill: if this thread predates the rfc_message_id column,
    // fetch the header from Gmail right now. Without an In-Reply-To
    // header the recipient's mail client will treat the reply as a
    // fresh email and the spam filter will pile on.
    await ensureRfcMessageId(data.replyToMessageId, ctx.organizationId)
    const original = await getMessageDetail(data.replyToMessageId, ctx.organizationId)
    if (original?.rfcMessageId) {
      inReplyTo = original.rfcMessageId
      // Accumulate the References chain from the whole thread so the
      // recipient's client can stitch the conversation together —
      // critical both for thread display and for spam filters that
      // weigh "is this part of an ongoing conversation".
      if (original.providerThreadId) {
        const thread = await getThreadDetail(original.providerThreadId, ctx.organizationId)
        if (thread) {
          references = thread.messages
            .map((m) => m.rfcMessageId)
            .filter((id): id is string => !!id)
            .join(' ')
        }
      }
      if (!references) references = original.rfcMessageId
      bodyText = `${data.body}${buildQuotedBody(original, await getClinicTimeZone(ctx.organizationId))}`
    } else if (original) {
      // No Message-ID on Gmail's side either (shouldn't happen for real
      // mail, but surface it loudly if it ever does so we don't silently
      // ship a thread-breaking reply).
      console.warn('[sendMailbox] original has no rfcMessageId — reply will not thread', {
        messageId: data.replyToMessageId,
      })
    }
  }

  const result = await sendEmail({
    accountId: data.accountId,
    organizationId: ctx.organizationId,
    to: splitAddresses(data.to),
    cc: data.cc ? splitAddresses(data.cc) : undefined,
    subject: data.subject,
    bodyText,
    inReplyTo,
    references,
    actor: userActor(ctx.userId),
  })
  revalidatePath('/inbox')
  return {
    ok: true,
    localRecord: result.localRecord,
    localError: result.localError ?? null,
  }
}

export async function startGmailConnect() {
  await requireOrgUser()
  redirect('/api/oauth/gmail/start')
}
