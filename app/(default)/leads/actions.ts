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
 * Bulk triage: mark the selected inquiries contacted, or archive them, in one
 * pass (you call a batch of new leads, then clear them all at once instead of
 * one drawer at a time). One bad row never fails the whole batch.
 */
export async function bulkSetLeadStatusAction(
  ids: string[],
  action: 'contacted' | 'archived',
): Promise<{ ok: true; updated: number }> {
  const ctx = await requireClinicTenant()
  let updated = 0
  for (const id of ids) {
    try {
      if (action === 'contacted') await markLeadContacted(ctx.organizationId, id)
      else await archiveLead(ctx.organizationId, id, null)
      updated++
    } catch {
      // skip a row that can't transition rather than aborting the batch
    }
  }
  revalidatePath('/leads')
  revalidatePath('/')
  return { ok: true, updated }
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
