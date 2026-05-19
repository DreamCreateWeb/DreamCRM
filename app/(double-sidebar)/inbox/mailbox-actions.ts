'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireTenant } from '@/lib/auth/context'
import {
  addPatientFromEmail,
  archiveMessage as svcArchive,
  bulkArchive,
  bulkSetRead,
  bulkSetStarred,
  bulkTrash,
  classifyPendingIntents,
  disconnectAccount as svcDisconnect,
  getMessageDetail,
  sendEmail,
  setMessageCategory as svcSetMessageCategory,
  setMessageRead,
  setMessageStarred,
  syncAccount,
  trashMessage as svcTrash,
} from '@/lib/services/mailbox'
import { EMAIL_CATEGORIES } from '@/lib/db/schema/email'
import { draftReply } from '@/lib/services/ai-mailbox'
import { getInboxPatientContext } from '@/lib/services/patient-context'

async function requireOrgUser() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') throw new Error('Forbidden')
  return ctx
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

export async function markMessage(messageId: string, read: boolean) {
  const ctx = await requireOrgUser()
  await setMessageRead(messageId, ctx.organizationId, read)
  revalidatePath('/inbox')
  return { ok: true }
}

export async function toggleStar(messageId: string, starred: boolean) {
  const ctx = await requireOrgUser()
  await setMessageStarred(messageId, ctx.organizationId, starred)
  revalidatePath('/inbox')
  return { ok: true }
}

export async function archiveMessageAction(messageId: string) {
  const ctx = await requireOrgUser()
  await svcArchive(messageId, ctx.organizationId)
  revalidatePath('/inbox')
  return { ok: true }
}

export async function trashMessageAction(messageId: string) {
  const ctx = await requireOrgUser()
  await svcTrash(messageId, ctx.organizationId)
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
  const result = await svcSetMessageCategory(messageId, ctx.organizationId, category)
  revalidatePath('/inbox')
  return result
}

const BULK_ACTIONS = ['archive', 'trash', 'mark_read', 'mark_unread', 'star', 'unstar'] as const
type BulkAction = (typeof BULK_ACTIONS)[number]

const BulkInput = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
  action: z.enum(BULK_ACTIONS),
})

export async function bulkMessageAction(input: unknown): Promise<{ count: number }> {
  const ctx = await requireOrgUser()
  const { ids, action } = BulkInput.parse(input)
  let result = { count: 0 }
  switch (action as BulkAction) {
    case 'archive':
      result = await bulkArchive(ids, ctx.organizationId)
      break
    case 'trash':
      result = await bulkTrash(ids, ctx.organizationId)
      break
    case 'mark_read':
      result = await bulkSetRead(ids, ctx.organizationId, true)
      break
    case 'mark_unread':
      result = await bulkSetRead(ids, ctx.organizationId, false)
      break
    case 'star':
      result = await bulkSetStarred(ids, ctx.organizationId, true)
      break
    case 'unstar':
      result = await bulkSetStarred(ids, ctx.organizationId, false)
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

const SendInput = z.object({
  accountId: z.string().min(1),
  to: z.string().min(1),
  cc: z.string().optional().default(''),
  subject: z.string().min(1).max(998),
  body: z.string().min(1).max(50_000),
})

function splitAddresses(raw: string): string[] {
  return raw
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export async function sendMailbox(input: unknown) {
  const ctx = await requireOrgUser()
  const data = SendInput.parse(input)
  await sendEmail({
    accountId: data.accountId,
    organizationId: ctx.organizationId,
    to: splitAddresses(data.to),
    cc: data.cc ? splitAddresses(data.cc) : undefined,
    subject: data.subject,
    bodyText: data.body,
  })
  revalidatePath('/inbox')
  return { ok: true }
}

export async function startGmailConnect() {
  await requireOrgUser()
  redirect('/api/oauth/gmail/start')
}
