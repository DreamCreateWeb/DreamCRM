'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import {
  archiveThread,
  assignThread,
  markThreadRead,
  reopenThread,
  sendMessageToPatient,
  snoozeThread,
  type MessageChannel,
} from '@/lib/services/patient-messaging'

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
}) {
  const ctx = await requireTenant()
  ensureClinic(ctx)
  const result = await sendMessageToPatient({
    organizationId: ctx.organizationId,
    patientId: input.patientId,
    body: input.body,
    channel: input.channel,
    sentByUserId: ctx.userId,
  })
  revalidatePath('/messages')
  return result
}

export async function assignThreadAction(threadId: string, assigneeUserId: string | null) {
  const ctx = await requireTenant()
  ensureClinic(ctx)
  await assignThread(ctx.organizationId, threadId, assigneeUserId)
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
