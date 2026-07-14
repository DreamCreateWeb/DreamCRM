'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireTenant } from '@/lib/auth/context'
import {
  createPartner,
  resendPartnerInvite,
  updatePartnerTerms,
  setPartnerStatus,
  updateClinicReferralTerms,
  getPartnerLifecycleInfo,
  deletePartner,
  archivePartner,
  reactivatePartner,
} from '@/lib/services/referrals'
import { payoutPartner } from '@/lib/services/referral-payouts'
import type { PartnerDeleteDisposition } from '@/lib/types/referrals'

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

/** Admin-triggered payout (the "Pay now" button on the partner detail page).
 *  NOT self-serve — `payoutPartner` allows settling up a SUSPENDED partner via
 *  this path (only archived is refused, and only the portal path blocks
 *  suspended). */
export async function payoutPartnerAction(
  partnerId: string,
): Promise<{ ok: boolean; error?: string; amountCents?: number }> {
  const ctx = await requirePlatformAdmin()
  const result = await payoutPartner(z.string().min(1).parse(partnerId), { initiatedBy: ctx.userId })
  revalidatePath(`/partners/${partnerId}`)
  revalidatePath('/partners')
  return { ok: result.ok, error: result.error, amountCents: result.amountCents }
}

// ── Lifecycle: delete / archive / reactivate ─────────────────────────────────

/** Read the delete disposition + numbers so the confirm modal can render the
 *  right path (clean delete vs archive vs balance-resolution) before acting. */
export async function getPartnerLifecycleAction(partnerId: string): Promise<{
  disposition: PartnerDeleteDisposition
  hasMoneyHistory: boolean
  accruedCents: number
}> {
  await requirePlatformAdmin()
  const info = await getPartnerLifecycleInfo(z.string().min(1).parse(partnerId))
  return info
}

/**
 * Delete a partner — conditional. Hard-deletes only with zero money history;
 * otherwise refuses with `requiresArchive: true` so the UI switches to the
 * archive flow. Never silently archives behind the admin's back.
 */
export async function deletePartnerAction(partnerId: string): Promise<
  | { ok: true; outcome: 'deleted' }
  | { ok: false; requiresArchive: true; disposition: PartnerDeleteDisposition }
> {
  await requirePlatformAdmin()
  const r = await deletePartner(z.string().min(1).parse(partnerId))
  revalidatePath('/partners')
  revalidatePath(`/partners/${partnerId}`)
  if (r.outcome === 'deleted') return { ok: true, outcome: 'deleted' }
  return { ok: false, requiresArchive: true, disposition: r.disposition }
}

const ArchiveInput = z.object({
  partnerId: z.string().min(1),
  // How to resolve an outstanding balance before archiving (omit when none).
  resolve: z.enum(['pay', 'void']).optional(),
})

/**
 * Archive a partner. Refuses (`ok: false`) when there's an outstanding accrued
 * balance and no `resolve` choice — the confirm dialog must offer pay-now or
 * void. With `resolve: 'pay'` runs the payout first (requires payouts_enabled);
 * with `resolve: 'void'` reverses the accrued rows. No silent money deletion.
 */
export async function archivePartnerAction(input: unknown): Promise<
  | { ok: true; outcome: 'archived' }
  | { ok: false; reason: 'outstanding_balance'; accruedCents: number }
> {
  const ctx = await requirePlatformAdmin()
  const data = ArchiveInput.parse(input)
  const r = await archivePartner(data.partnerId, { resolve: data.resolve, initiatedBy: ctx.userId })
  revalidatePath('/partners')
  revalidatePath(`/partners/${data.partnerId}`)
  if (r.outcome === 'archived') return { ok: true, outcome: 'archived' }
  return { ok: false, reason: 'outstanding_balance', accruedCents: r.accruedCents ?? 0 }
}

/** Reactivate an archived partner → 'active'. Refuses if a live partner now
 *  holds the same email (surface a clear conflict message). */
export async function reactivatePartnerAction(
  partnerId: string,
): Promise<{ ok: boolean; error?: string }> {
  await requirePlatformAdmin()
  const r = await reactivatePartner(z.string().min(1).parse(partnerId))
  revalidatePath('/partners')
  revalidatePath(`/partners/${partnerId}`)
  if (r.outcome === 'reactivated') return { ok: true }
  const error =
    r.reason === 'email_taken'
      ? 'That email is now used by another active partner — resolve the conflict first.'
      : 'This partner is not archived.'
  return { ok: false, error }
}

// Clinic attribution (assign/clear for ONE clinic) moved to
// app/(default)/ecommerce/customers/[id]/actions.ts — the clinic-detail
// referral card is its only UI (structure pass, 2026-07-13).

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

