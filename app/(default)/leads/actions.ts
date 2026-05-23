'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import {
  markLeadContacted,
  archiveLead,
  reopenLead,
  convertLeadToPatient,
  findConvertDedupeMatch,
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

/**
 * Dry-run dedupe check — does this lead's email/phone already match an
 * existing patient? Returns the matched name so the UI can ask "link to
 * them, or create a separate patient?" BEFORE committing the convert.
 * Guards against silently merging e.g. a child lead into a parent who
 * shares the same phone number (common in family dental practices).
 */
export async function previewLeadConvertAction(
  id: string,
): Promise<{ ok: true; matchedPatientName: string | null } | { ok: false; error: string }> {
  const ctx = await requireClinicTenant()
  try {
    const match = await findConvertDedupeMatch(ctx.organizationId, id)
    return { ok: true, matchedPatientName: match?.name ?? null }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export async function convertLeadAction(
  id: string,
  options: { forceNewPatient?: boolean } = {},
): Promise<{ ok: true; patientId: string; deduped: boolean; patientName: string } | { ok: false; error: string }> {
  const ctx = await requireClinicTenant()
  try {
    const result = await convertLeadToPatient(ctx.organizationId, id, options)
    revalidatePath('/leads')
    revalidatePath('/patients')
    revalidatePath('/')
    return { ok: true, patientId: result.patientId, deduped: result.deduped, patientName: result.patientName }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
