'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireTenant } from '@/lib/auth/context'
import {
  createPartner,
  resendPartnerInvite,
  updatePartnerTerms,
  setPartnerStatus,
  assignClinicReferral,
  updateClinicReferralTerms,
  clearClinicReferral,
} from '@/lib/services/referrals'
import { payoutPartner } from '@/lib/services/referral-payouts'

/**
 * Platform-admin server actions for the referral partner program. Every action
 * gates to platform owner/admin (same bar as /ecommerce/invoices).
 */
async function requirePlatformAdmin() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'platform') throw new Error('Forbidden: platform only')
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    throw new Error('Forbidden: platform owner or admin only')
  }
  return ctx
}

const CreatePartnerInput = z.object({
  name: z.string().trim().min(1, 'Name is required').max(160),
  company: z.string().trim().max(160).optional().transform((v) => (v ? v : undefined)),
  email: z.string().trim().email('Enter a valid email'),
  defaultPercentBps: z.number().int().min(0).max(10000),
  defaultTermMonths: z.number().int().min(1).max(120).nullable().optional(),
  termsNote: z.string().trim().max(2000).optional().transform((v) => (v ? v : undefined)),
})

export async function createPartnerAction(input: unknown): Promise<{ id: string; email: string }> {
  await requirePlatformAdmin()
  const data = CreatePartnerInput.parse(input)
  const result = await createPartner(data)
  revalidatePath('/partners')
  return result
}

export async function resendPartnerInviteAction(partnerId: string): Promise<{ email: string }> {
  await requirePlatformAdmin()
  const result = await resendPartnerInvite(z.string().min(1).parse(partnerId))
  revalidatePath('/partners')
  revalidatePath(`/partners/${partnerId}`)
  return result
}

const UpdateTermsInput = z.object({
  partnerId: z.string().min(1),
  defaultPercentBps: z.number().int().min(0).max(10000).optional(),
  defaultTermMonths: z.number().int().min(1).max(120).nullable().optional(),
  termsNote: z.string().trim().max(2000).nullable().optional(),
})

export async function updatePartnerTermsAction(input: unknown): Promise<{ ok: true }> {
  await requirePlatformAdmin()
  const data = UpdateTermsInput.parse(input)
  await updatePartnerTerms(data)
  revalidatePath(`/partners/${data.partnerId}`)
  revalidatePath('/partners')
  return { ok: true }
}

export async function setPartnerStatusAction(
  partnerId: string,
  status: 'active' | 'suspended',
): Promise<{ ok: true }> {
  await requirePlatformAdmin()
  await setPartnerStatus(z.string().min(1).parse(partnerId), z.enum(['active', 'suspended']).parse(status))
  revalidatePath(`/partners/${partnerId}`)
  revalidatePath('/partners')
  return { ok: true }
}

/** Admin-triggered payout (the "Pay now" button on the partner detail page). */
export async function payoutPartnerAction(
  partnerId: string,
): Promise<{ ok: boolean; error?: string; amountCents?: number }> {
  const ctx = await requirePlatformAdmin()
  const result = await payoutPartner(z.string().min(1).parse(partnerId), { initiatedBy: ctx.userId })
  revalidatePath(`/partners/${partnerId}`)
  revalidatePath('/partners')
  return { ok: result.ok, error: result.error, amountCents: result.amountCents }
}

// ── Clinic attribution (clinic detail "Referral" card + partner detail) ──────

const AssignInput = z.object({
  organizationId: z.string().min(1),
  partnerId: z.string().min(1),
  percentBps: z.number().int().min(0).max(10000).nullable().optional(),
  termMonths: z.number().int().min(1).max(120).nullable().optional(),
})

export async function assignClinicReferralAction(input: unknown): Promise<{ ok: true }> {
  await requirePlatformAdmin()
  const data = AssignInput.parse(input)
  await assignClinicReferral(
    data.organizationId,
    data.partnerId,
    data.percentBps ?? undefined,
    data.termMonths !== undefined ? data.termMonths : undefined,
  )
  revalidatePath(`/ecommerce/customers/${data.organizationId}`)
  revalidatePath(`/partners/${data.partnerId}`)
  revalidatePath('/partners')
  return { ok: true }
}

const UpdateClinicTermsInput = z.object({
  organizationId: z.string().min(1),
  partnerId: z.string().min(1),
  percentBps: z.number().int().min(0).max(10000).nullable(),
  termMonths: z.number().int().min(1).max(120).nullable(),
})

export async function updateClinicReferralTermsAction(input: unknown): Promise<{ ok: true }> {
  await requirePlatformAdmin()
  const data = UpdateClinicTermsInput.parse(input)
  await updateClinicReferralTerms(data.organizationId, data.percentBps, data.termMonths)
  revalidatePath(`/ecommerce/customers/${data.organizationId}`)
  revalidatePath(`/partners/${data.partnerId}`)
  return { ok: true }
}

export async function clearClinicReferralAction(
  organizationId: string,
  partnerId?: string,
): Promise<{ ok: true }> {
  await requirePlatformAdmin()
  await clearClinicReferral(z.string().min(1).parse(organizationId))
  revalidatePath(`/ecommerce/customers/${organizationId}`)
  if (partnerId) revalidatePath(`/partners/${partnerId}`)
  revalidatePath('/partners')
  return { ok: true }
}
