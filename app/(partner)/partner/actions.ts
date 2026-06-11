'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import { getPartnerByUserId } from '@/lib/services/referrals'
import { createOnboardingLink, payoutPartner, refreshPayoutStatus } from '@/lib/services/referral-payouts'

/**
 * Partner-side server actions. Every action resolves the partner row from the
 * SESSION user (never a client-supplied id) so a partner can only act on their
 * own account.
 */
async function requirePartner() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'partner') throw new Error('Forbidden: partner only')
  const partner = await getPartnerByUserId(ctx.userId)
  if (!partner) throw new Error('Partner account not found')
  if (partner.status !== 'active') throw new Error('Partner account is not active')
  return { ctx, partner }
}

/** Start (or resume) Stripe Connect Express onboarding → returns the hosted
 *  URL the client redirects to. */
export async function startPayoutSetupAction(): Promise<{ url: string }> {
  const { partner } = await requirePartner()
  return createOnboardingLink(partner.id)
}

/** Re-pull payout-ready status from Stripe (used after the ?connect=done
 *  return, or on a manual refresh). */
export async function refreshPayoutStatusAction(): Promise<{ payoutsEnabled: boolean }> {
  const { partner } = await requirePartner()
  const enabled = await refreshPayoutStatus(partner.id)
  revalidatePath('/partner')
  return { payoutsEnabled: enabled }
}

/** Withdraw the accrued balance to the connected account. */
export async function withdrawAction(): Promise<{ ok: boolean; error?: string; amountCents?: number }> {
  const { ctx, partner } = await requirePartner()
  const result = await payoutPartner(partner.id, { initiatedBy: ctx.userId })
  revalidatePath('/partner')
  return { ok: result.ok, error: result.error, amountCents: result.amountCents }
}
