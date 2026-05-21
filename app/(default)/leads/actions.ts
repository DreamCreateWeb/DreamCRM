'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import {
  markLeadContacted,
  archiveLead,
  reopenLead,
  convertLeadToPatient,
} from '@/lib/services/leads'

async function requireClinicTenant() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') {
    throw new Error('Only clinic tenants can manage leads')
  }
  return ctx
}

export async function markLeadContactedAction(id: string): Promise<{ ok: true }> {
  const ctx = await requireClinicTenant()
  await markLeadContacted(ctx.organizationId, id)
  revalidatePath('/leads')
  revalidatePath('/')
  return { ok: true }
}

export async function archiveLeadAction(
  id: string,
  reason: string | null,
): Promise<{ ok: true }> {
  const ctx = await requireClinicTenant()
  await archiveLead(ctx.organizationId, id, reason)
  revalidatePath('/leads')
  revalidatePath('/')
  return { ok: true }
}

export async function reopenLeadAction(id: string): Promise<{ ok: true }> {
  const ctx = await requireClinicTenant()
  await reopenLead(ctx.organizationId, id)
  revalidatePath('/leads')
  return { ok: true }
}

export async function convertLeadAction(
  id: string,
): Promise<{ ok: true; patientId: string } | { ok: false; error: string }> {
  const ctx = await requireClinicTenant()
  try {
    const result = await convertLeadToPatient(ctx.organizationId, id)
    revalidatePath('/leads')
    revalidatePath('/patients')
    revalidatePath('/')
    return { ok: true, patientId: result.patientId }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
