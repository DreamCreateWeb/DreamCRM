'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import {
  LeadInput,
  LeadUpdate,
  archiveLead,
  createLead,
  moveLead,
  setOptedOut,
  updateLead,
} from '@/lib/services/marketing'

export async function createLeadAction(input: unknown) {
  const ctx = await requireTenant()
  const data = LeadInput.parse(input)
  const row = await createLead(ctx.organizationId, data, ctx.userId)
  revalidatePath('/marketing')
  revalidatePath('/marketing/pipeline')
  return row
}

export async function updateLeadAction(id: number, input: unknown) {
  const ctx = await requireTenant()
  const data = LeadUpdate.parse(input)
  const row = await updateLead(ctx.organizationId, id, data)
  revalidatePath('/marketing')
  revalidatePath('/marketing/pipeline')
  return row
}

export async function moveLeadAction(id: number, stage: string) {
  const ctx = await requireTenant()
  const row = await moveLead(ctx.organizationId, id, stage)
  revalidatePath('/marketing/pipeline')
  return row
}

export async function archiveLeadAction(id: number) {
  const ctx = await requireTenant()
  await archiveLead(ctx.organizationId, id)
  revalidatePath('/marketing/pipeline')
}

export async function setOptedOutAction(id: number, optedOut: boolean) {
  const ctx = await requireTenant()
  await setOptedOut(ctx.organizationId, id, optedOut)
  revalidatePath('/marketing/pipeline')
}
