'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import {
  AudienceInput,
  LeadInput,
  LeadUpdate,
  PatientAudienceFilter,
  archiveLead,
  createAudience,
  createLead,
  deleteAudience,
  moveLead,
  resolveAudience,
  setOptedOut,
  updateAudience,
  updateLead,
  type AudienceFilterT,
  type PatientAudienceFilterT,
} from '@/lib/services/marketing'
import {
  CampaignInput,
  CampaignUpdate,
  createMarketingCampaign,
  deleteMarketingCampaign,
  updateMarketingCampaign,
} from '@/lib/services/marketing-campaigns'
import { sendCampaign } from '@/lib/services/marketing-send'
import { draftCampaign, improveCopy } from '@/lib/services/ai-marketing'

/**
 * Recall & Outreach is a clinic-staff surface. The /marketing page redirects
 * patients, but a page redirect is not an auth gate — a patient-role session
 * can still POST directly to these action endpoints. Gate every mutating
 * action (incl. campaign sends) so a patient can't touch marketing data or
 * trigger an email blast. Mirrors the guard the sibling staff modules use.
 */
async function requireClinicStaff() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient' || ctx.role === 'patient') {
    throw new Error('Recall & Outreach is only available to clinic staff.')
  }
  return ctx
}

// ---------- Leads ----------

export async function createLeadAction(input: unknown) {
  const ctx = await requireClinicStaff()
  const data = LeadInput.parse(input)
  const row = await createLead(ctx.organizationId, data, ctx.userId)
  revalidatePath('/marketing')
  revalidatePath('/marketing/pipeline')
  return row
}

export async function updateLeadAction(id: number, input: unknown) {
  const ctx = await requireClinicStaff()
  const data = LeadUpdate.parse(input)
  const row = await updateLead(ctx.organizationId, id, data)
  revalidatePath('/marketing')
  revalidatePath('/marketing/pipeline')
  return row
}

export async function moveLeadAction(id: number, stage: string) {
  const ctx = await requireClinicStaff()
  const row = await moveLead(ctx.organizationId, id, stage)
  revalidatePath('/marketing/pipeline')
  return row
}

export async function archiveLeadAction(id: number) {
  const ctx = await requireClinicStaff()
  await archiveLead(ctx.organizationId, id)
  revalidatePath('/marketing/pipeline')
}

export async function setOptedOutAction(id: number, optedOut: boolean) {
  const ctx = await requireClinicStaff()
  await setOptedOut(ctx.organizationId, id, optedOut)
  revalidatePath('/marketing/pipeline')
}

// ---------- Audiences ----------

export async function createAudienceAction(input: unknown) {
  const ctx = await requireClinicStaff()
  const data = AudienceInput.parse(input)
  const row = await createAudience(ctx.organizationId, data, ctx.userId)
  revalidatePath('/marketing/audiences')
  revalidatePath('/marketing')
  return row
}

export async function updateAudienceAction(id: number, input: unknown) {
  const ctx = await requireClinicStaff()
  const data = AudienceInput.partial().parse(input)
  const row = await updateAudience(ctx.organizationId, id, data)
  revalidatePath('/marketing/audiences')
  return row
}

export async function deleteAudienceAction(id: number) {
  const ctx = await requireClinicStaff()
  await deleteAudience(ctx.organizationId, id)
  revalidatePath('/marketing/audiences')
  revalidatePath('/marketing')
}

/**
 * Live preview of how many recipients an audience filter resolves to. Accepts
 * either filter shape and an optional recipientSource discriminator; the
 * audience editor passes the in-flight filter so users see the count update
 * as they tweak chips.
 */
export async function previewAudienceAction(input: unknown) {
  const ctx = await requireClinicStaff()
  const opts = (input ?? {}) as {
    recipientSource?: 'customers' | 'patients'
    filter?: unknown
    patientFilter?: unknown
  }
  const rows = await resolveAudience(ctx.organizationId, {
    recipientSource: opts.recipientSource ?? 'customers',
    filter: (opts.filter ?? {}) as AudienceFilterT,
    patientFilter: opts.patientFilter
      ? PatientAudienceFilter.parse(opts.patientFilter)
      : ({} as PatientAudienceFilterT),
  })
  return {
    count: rows.length,
    sample: rows.slice(0, 5).map((r) => ({ name: r.name, email: r.email ?? '' })),
  }
}

// ---------- Campaigns ----------

export async function createCampaignAction(input: unknown) {
  const ctx = await requireClinicStaff()
  const data = CampaignInput.parse(input)
  const row = await createMarketingCampaign(ctx.organizationId, data, ctx.userId)
  revalidatePath('/marketing/campaigns')
  redirect(`/marketing/campaigns/${row.id}`)
}

export async function updateCampaignAction(id: number, input: unknown) {
  const ctx = await requireClinicStaff()
  const data = CampaignUpdate.parse(input)
  const row = await updateMarketingCampaign(ctx.organizationId, id, data)
  revalidatePath('/marketing/campaigns')
  revalidatePath(`/marketing/campaigns/${id}`)
  return row
}

export async function deleteCampaignAction(id: number) {
  const ctx = await requireClinicStaff()
  await deleteMarketingCampaign(ctx.organizationId, id)
  revalidatePath('/marketing/campaigns')
}

// ---------- AI ----------

export async function draftCampaignAction(brief: string) {
  const ctx = await requireTenant()
  // Marketing is a staff surface — patients have a session but no business
  // triggering (paid) AI generations. The page redirects them; gate the action.
  if (ctx.tenantType === 'patient') return null
  if (!brief.trim() || brief.length > 4000) return null
  return draftCampaign(brief, ctx.tenantType)
}

export async function improveCopyAction(html: string, instruction: string) {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') return null
  if (!html.trim() || !instruction.trim()) return null
  if (html.length > 12_000 || instruction.length > 400) return null
  return improveCopy(html, instruction, ctx.tenantType)
}

export async function sendCampaignAction(
  id: number,
  opts: { test?: boolean; recipientIdsOverride?: number[]; gmailAccountId?: string; fromName?: string } = {},
) {
  const ctx = await requireClinicStaff()
  const result = await sendCampaign({
    organizationId: ctx.organizationId,
    campaignId: id,
    ...opts,
  })
  revalidatePath('/marketing/campaigns')
  revalidatePath(`/marketing/campaigns/${id}`)
  return result
}
