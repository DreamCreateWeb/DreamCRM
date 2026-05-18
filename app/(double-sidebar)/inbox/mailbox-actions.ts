'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireTenant } from '@/lib/auth/context'
import {
  addPatientFromEmail,
  archiveMessage as svcArchive,
  disconnectAccount as svcDisconnect,
  sendEmail,
  setMessageRead,
  setMessageStarred,
  syncAccount,
  trashMessage as svcTrash,
} from '@/lib/services/mailbox'

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
