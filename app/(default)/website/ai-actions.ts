'use server'

import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clinicProfile } from '@/lib/db/schema/platform'
import { requireTenant } from '@/lib/auth/context'
import {
  generateSectionCopy,
  getAiUsage,
  incrementAiUsage,
  type WebsiteAiContext,
} from '@/lib/services/ai-website'
import {
  AI_WEBSITE_SECTIONS,
  type AiUsageSnapshot,
  type AiWebsiteSection,
  type GeneratedContent,
} from '@/lib/types/ai-website'
import type { ClinicService } from '@/lib/types/clinic-content'

export type AiRewriteResult =
  | { ok: true; content: GeneratedContent; usage: AiUsageSnapshot }
  | { ok: false; reason: 'limit'; usage: AiUsageSnapshot }
  | { ok: false; reason: 'gate' | 'error'; error: string }

const DAY_LABELS: Record<string, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
  fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
}

function hoursSummary(hours: unknown): string | null {
  if (!hours || typeof hours !== 'object') return null
  const open: string[] = []
  for (const [day, label] of Object.entries(DAY_LABELS)) {
    const entry = (hours as Record<string, { closed?: boolean; open?: string | null }>)[day]
    if (entry && !entry.closed && entry.open) open.push(label)
  }
  return open.length ? `Open: ${open.join(', ')}` : null
}

/**
 * Generate AI copy for one editor section, gated by the tier-baked monthly
 * allowance. Returns the generated content for the editor to apply (NOT
 * saved — the clinic reviews then clicks the section's normal Save). Fails
 * safe: when the allowance is spent, returns reason:'limit' with the usage
 * snapshot so the UI can gate gracefully — it never auto-charges.
 */
export async function aiRewriteSection(section: AiWebsiteSection): Promise<AiRewriteResult> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') {
    return { ok: false, reason: 'gate', error: 'Only clinics can use AI help' }
  }
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    return { ok: false, reason: 'gate', error: 'Only owners and admins can use AI help' }
  }
  if (!AI_WEBSITE_SECTIONS.includes(section)) {
    return { ok: false, reason: 'error', error: 'Unsupported section' }
  }

  const [profile] = await db
    .select()
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, ctx.organizationId))
    .limit(1)
  if (!profile) {
    return { ok: false, reason: 'error', error: 'Clinic profile not found' }
  }

  // Fail safe: never generate past the monthly allowance, never auto-charge.
  const usage = await getAiUsage(ctx.organizationId, profile.planTier)
  if (usage.remaining <= 0) {
    return { ok: false, reason: 'limit', usage }
  }

  const services = Array.isArray(profile.services)
    ? (profile.services as ClinicService[]).map((s) => s.name).filter(Boolean)
    : []
  const insuranceCarriers = Array.isArray(profile.acceptedInsuranceCarriers)
    ? (profile.acceptedInsuranceCarriers as unknown[]).filter((c): c is string => typeof c === 'string')
    : []

  const aiCtx: WebsiteAiContext = {
    name: profile.displayName ?? ctx.organizationName,
    city: profile.city,
    tagline: profile.tagline,
    about: profile.about,
    services,
    insuranceCarriers,
    hoursSummary: hoursSummary(profile.hours),
  }

  const result = await generateSectionCopy(section, aiCtx)
  if (!result.ok) {
    return { ok: false, reason: 'error', error: result.error }
  }

  // Only a successful generation counts against the allowance.
  await incrementAiUsage(ctx.organizationId)
  const refreshed = await getAiUsage(ctx.organizationId, profile.planTier)
  return { ok: true, content: result.content, usage: refreshed }
}
