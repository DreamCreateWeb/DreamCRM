'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import {
  AudienceInput,
  LeadInput,
  LeadUpdate,
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

// ---------- Leads ----------

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

// ---------- Audiences ----------

export async function createAudienceAction(input: unknown) {
  const ctx = await requireTenant()
  const data = AudienceInput.parse(input)
  const row = await createAudience(ctx.organizationId, data, ctx.userId)
  revalidatePath('/marketing/audiences')
  revalidatePath('/marketing')
  return row
}

export async function updateAudienceAction(id: number, input: unknown) {
  const ctx = await requireTenant()
  const data = AudienceInput.partial().parse(input)
  const row = await updateAudience(ctx.organizationId, id, data)
  revalidatePath('/marketing/audiences')
  return row
}

export async function deleteAudienceAction(id: number) {
  const ctx = await requireTenant()
  await deleteAudience(ctx.organizationId, id)
  revalidatePath('/marketing/audiences')
  revalidatePath('/marketing')
}

/** Live preview of how many recipients an audience filter resolves to. */
export async function previewAudienceAction(filter: unknown) {
  const ctx = await requireTenant()
  // Best-effort parse; tolerant of partial filters
  const parsed = (filter ?? {}) as AudienceFilterT
  const rows = await resolveAudience(ctx.organizationId, parsed)
  return {
    count: rows.length,
    sample: rows.slice(0, 5).map((r) => ({ name: r.name, email: r.email })),
  }
}

// ---------- Campaigns ----------

export async function createCampaignAction(input: unknown) {
  const ctx = await requireTenant()
  const data = CampaignInput.parse(input)
  const row = await createMarketingCampaign(ctx.organizationId, data, ctx.userId)
  revalidatePath('/marketing/campaigns')
  redirect(`/marketing/campaigns/${row.id}`)
}

export async function updateCampaignAction(id: number, input: unknown) {
  const ctx = await requireTenant()
  const data = CampaignUpdate.parse(input)
  const row = await updateMarketingCampaign(ctx.organizationId, id, data)
  revalidatePath('/marketing/campaigns')
  revalidatePath(`/marketing/campaigns/${id}`)
  return row
}

export async function deleteCampaignAction(id: number) {
  const ctx = await requireTenant()
  await deleteMarketingCampaign(ctx.organizationId, id)
  revalidatePath('/marketing/campaigns')
}

// ---------- AI ----------

export async function draftCampaignAction(brief: string) {
  const ctx = await requireTenant()
  if (!brief.trim() || brief.length > 4000) return null
  return draftCampaign(brief, ctx.tenantType === 'patient' ? 'clinic' : ctx.tenantType)
}

export async function improveCopyAction(html: string, instruction: string) {
  const ctx = await requireTenant()
  if (!html.trim() || !instruction.trim()) return null
  if (html.length > 12_000 || instruction.length > 400) return null
  return improveCopy(html, instruction, ctx.tenantType === 'patient' ? 'clinic' : ctx.tenantType)
}

export async function sendCampaignAction(
  id: number,
  opts: { test?: boolean; recipientIdsOverride?: number[]; gmailAccountId?: string; fromName?: string } = {},
) {
  const ctx = await requireTenant()
  const result = await sendCampaign({
    organizationId: ctx.organizationId,
    campaignId: id,
    ...opts,
  })
  revalidatePath('/marketing/campaigns')
  revalidatePath(`/marketing/campaigns/${id}`)
  return result
}
