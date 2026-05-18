'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireTenant } from '@/lib/auth/context'
import {
  disconnectAccount as svcDisconnect,
  sendEmail,
  setMessageRead,
  syncAccount,
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
