'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { planAllows } from '@/lib/modules'
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
  cancelScheduledCampaign,
  createMarketingCampaign,
  deleteMarketingCampaign,
  scheduleCampaign,
  updateMarketingCampaign,
  type ScheduleResult,
} from '@/lib/services/marketing-campaigns'
import { sendCampaign, buildCampaignPreview } from '@/lib/services/marketing-send'
import { draftCampaign, improveCopy } from '@/lib/services/ai-marketing'
import { setRetentionAutomation, type RetentionKind } from '@/lib/services/retention-automation'
import { isRetentionKind } from '@/lib/types/retention'

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
  // Recall & Outreach is Premium-tier for clinics (lib/modules/clinic.ts) —
  // block a below-tier clinic from firing the action even via deep-link.
  // Platform tenants (the SaaS-side Marketing surface) aren't plan-gated and
  // pass through; demo contexts inherit the demo org's premium tier.
  if (ctx.tenantType === 'clinic' && !planAllows(ctx.planTier, 'premium')) {
    throw new Error('Recall & Outreach is on the Premium plan. Upgrade to use outreach campaigns.')
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
  revalidatePath('/growth/audiences')
  revalidatePath('/marketing')
  return row
}

export async function updateAudienceAction(id: number, input: unknown) {
  const ctx = await requireClinicStaff()
  const data = AudienceInput.partial().parse(input)
  const row = await updateAudience(ctx.organizationId, id, data)
  revalidatePath('/growth/audiences')
  return row
}

export async function deleteAudienceAction(id: number) {
  const ctx = await requireClinicStaff()
  await deleteAudience(ctx.organizationId, id)
  revalidatePath('/growth/audiences')
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
  revalidatePath('/growth/campaigns')
  revalidatePath('/growth/outreach')
  redirect(`/growth/campaigns/${row.id}`)
}

export async function updateCampaignAction(id: number, input: unknown) {
  const ctx = await requireClinicStaff()
  const data = CampaignUpdate.parse(input)
  const row = await updateMarketingCampaign(ctx.organizationId, id, data)
  revalidatePath('/growth/campaigns')
  revalidatePath('/growth/outreach')
  revalidatePath(`/growth/campaigns/${id}`)
  return row
}

export async function deleteCampaignAction(id: number) {
  const ctx = await requireClinicStaff()
  await deleteMarketingCampaign(ctx.organizationId, id)
  revalidatePath('/growth/campaigns')
  revalidatePath('/growth/outreach')
}

/** "Send later" — queue a campaign for a future send (status → scheduled).
 *  The send-scheduled-campaigns cron dispatches it. */
export async function scheduleCampaignAction(id: number, scheduledAtIso: string): Promise<ScheduleResult> {
  const ctx = await requireClinicStaff()
  const result = await scheduleCampaign(ctx.organizationId, id, scheduledAtIso)
  if (result.ok) {
    revalidatePath('/growth/campaigns')
    revalidatePath('/growth/outreach')
    revalidatePath(`/growth/campaigns/${id}`)
  }
  return result
}

/** Pull a scheduled campaign back to draft (cancel the queued send). */
export async function cancelScheduledCampaignAction(id: number): Promise<ScheduleResult> {
  const ctx = await requireClinicStaff()
  const result = await cancelScheduledCampaign(ctx.organizationId, id)
  if (result.ok) {
    revalidatePath('/growth/campaigns')
    revalidatePath('/growth/outreach')
    revalidatePath(`/growth/campaigns/${id}`)
  }
  return result
}

/** One-click newsletter: draft a campaign from the latest published blog
 *  posts and open it in the composer. Always a DRAFT — review before send. */
export async function createNewsletterDraftAction(): Promise<{ ok: false; error: string } | never> {
  const ctx = await requireClinicStaff()
  const { buildNewsletterDraft } = await import('@/lib/services/newsletter')
  const r = await buildNewsletterDraft(ctx.organizationId, ctx.userId)
  if (!r.ok) return r
  revalidatePath('/growth/campaigns')
  revalidatePath('/growth/outreach')
  redirect(`/growth/campaigns/${r.campaignId}`)
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

/**
 * Render the campaign's current draft (subject + preview text + body, as the
 * editor holds it — including unsaved edits) into the exact email a recipient
 * would receive, personalized with the first real audience member. Read-only;
 * fires no send and records nothing. Returns the rendered HTML for the preview
 * modal, or a structured error.
 */
export async function previewCampaignAction(
  campaignId: number,
  draft: { subject: string; previewText: string; bodyHtml: string },
): Promise<
  | {
      ok: true
      html: string
      subject: string
      sampleName: string
      realRecipient: boolean
      fromLabel: string
    }
  | { ok: false; error: string }
> {
  try {
    const ctx = await requireClinicStaff()
    const defaultSource: 'customers' | 'patients' =
      ctx.tenantType === 'clinic' ? 'patients' : 'customers'
    const res = await buildCampaignPreview(
      ctx.organizationId,
      campaignId,
      {
        subject: draft?.subject ?? '',
        previewText: draft?.previewText ?? '',
        bodyHtml: draft?.bodyHtml ?? '',
      },
      defaultSource,
    )
    return { ok: true, ...res }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not build a preview.' }
  }
}

// ---------- Retention automations (set & forget) ----------

/**
 * Flip the birthday or reactivation auto-send on/off. Owner/admin only — these
 * automatically email patients clinic-wide, so a staff `member` can't enable
 * them. Returns `{ ok }` or `{ error }`.
 */
export async function setRetentionAutomationAction(
  kind: RetentionKind,
  enabled: boolean,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await requireClinicStaff()
  if (ctx.tenantType !== 'clinic') return { error: 'Automations are a clinic feature.' }
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    return { error: 'Only an owner or admin can change automations.' }
  }
  if (!isRetentionKind(kind)) return { error: 'Unknown automation.' }
  await setRetentionAutomation(ctx.organizationId, kind, enabled)
  revalidatePath('/marketing')
  return { ok: true }
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
  revalidatePath('/growth/campaigns')
  revalidatePath('/growth/outreach')
  revalidatePath(`/growth/campaigns/${id}`)
  return result
}
