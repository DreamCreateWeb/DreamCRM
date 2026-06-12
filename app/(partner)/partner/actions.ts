'use server'

import { revalidatePath } from 'next/cache'
import { requirePartner } from '@/lib/auth/context'
import { createOnboardingLink, payoutPartner, refreshPayoutStatus } from '@/lib/services/referral-payouts'

/**
 * Partner-side server actions. Every action resolves the partner row from the
 * SESSION user (never a client-supplied id) so a partner can only act on their
 * own account. Authorization is by referral_partner.user_id lookup (the shared
 * `requirePartner`), NOT tenantType — so a multi-persona partner isn't locked
 * out of their own payout actions. `redirectOnFail: false` makes it throw (the
 * server-action convention) rather than redirect.
 */
function requirePartnerAction() {
  return requirePartner({ redirectOnFail: false })
}

/** Start (or resume) Stripe Connect Express onboarding → returns the hosted
 *  URL the client redirects to. */
export async function startPayoutSetupAction(): Promise<{ url: string }> {
  const { partner } = await requirePartnerAction()
  return createOnboardingLink(partner.id)
}

/** Re-pull payout-ready status from Stripe (used after the ?connect=done
 *  return, or on a manual refresh). */
export async function refreshPayoutStatusAction(): Promise<{ payoutsEnabled: boolean }> {
  const { partner } = await requirePartnerAction()
  const enabled = await refreshPayoutStatus(partner.id)
  revalidatePath('/partner')
  return { payoutsEnabled: enabled }
}

/** Withdraw the accrued balance to the connected account. Self-serve path:
 *  `requirePartner` already gates to an ACTIVE partner (suspended/archived
 *  can't reach here), and `payoutPartner({ selfServe: true })` is a second
 *  guard that refuses a paused/closed account. */
export async function withdrawAction(): Promise<{ ok: boolean; error?: string; amountCents?: number }> {
  const { ctx, partner } = await requirePartnerAction()
  const result = await payoutPartner(partner.id, { initiatedBy: ctx.userId, selfServe: true })
  revalidatePath('/partner')
  return { ok: result.ok, error: result.error, amountCents: result.amountCents }
}
