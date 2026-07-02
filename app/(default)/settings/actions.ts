'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/session'
import { requireTenant } from '@/lib/auth/context'
import {
  AccountInput,
  BillingInput,
  BillingPlan,
  FeedbackInput,
  NotificationPrefsInput,
  submitFeedback,
  updateAccount,
  upsertBilling,
  upsertNotificationPrefs,
} from '@/lib/services/settings'
import { createCheckoutSession, createPortalSession, setSubscriptionCancelation, updateSubscriptionPlan } from '@/lib/services/billing'
import type { BillingInterval, PlanId } from '@/lib/stripe-config'

export async function saveAccount(input: unknown) {
  const user = await requireUser()
  const row = await updateAccount(user.id, AccountInput.parse(input))
  revalidatePath('/settings/account')
  return row
}

export async function saveBilling(input: unknown) {
  const user = await requireUser()
  const row = await upsertBilling(user.id, BillingInput.parse(input))
  revalidatePath('/settings/billing')
  revalidatePath('/settings/plans')
  return row
}

export async function changePlan(plan: string) {
  const user = await requireUser()
  const parsed = BillingPlan.parse(plan)
  const row = await upsertBilling(user.id, { plan: parsed })
  revalidatePath('/settings/plans')
  revalidatePath('/settings/billing')
  return row
}

export async function startStripeCheckout(planId: PlanId, interval: BillingInterval) {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') {
    throw new Error('Only clinic tenants can change plans here')
  }
  // A clinic that ALREADY has a live subscription changes plan in place
  // (price swap + proration) — Checkout would mint a SECOND subscription and
  // the old one would keep billing. Checkout is only for the first purchase.
  const changedInPlace = await updateSubscriptionPlan({
    organizationId: ctx.organizationId,
    planId,
    interval,
  })
  if (changedInPlace) {
    revalidatePath('/settings/billing')
    redirect('/settings/billing?checkout=success')
  }
  const session = await createCheckoutSession({
    organizationId: ctx.organizationId,
    email: ctx.userEmail,
    name: ctx.organizationName,
    planId,
    interval,
  })
  if (!session.url) throw new Error('Stripe did not return a checkout URL')
  redirect(session.url)
}

export async function openBillingPortal() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') {
    throw new Error('Only clinic tenants can open a billing portal here')
  }
  const portal = await createPortalSession({
    organizationId: ctx.organizationId,
    email: ctx.userEmail,
    name: ctx.organizationName,
  })
  redirect(portal.url)
}

// ── Social-connection add-on (Zernio social module) ──────────────────────────

/**
 * Buy the social-connection add-on (a Stripe subscription item) for this clinic.
 * Owner/admin + clinic only. Returns the `{ ok | error }` convention so the
 * Settings card can surface the underlying guard message inline (Basic →
 * "Upgrade to Pro", comped → "managed billing", env-unset → "coming soon").
 */
export async function buySocialAddonAction(): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Only clinics can buy add-ons.' }
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    return { ok: false, error: 'Only an owner or admin can change billing.' }
  }
  try {
    const { addSocialAddon } = await import('@/lib/services/social-billing')
    await addSocialAddon(ctx.organizationId)
    revalidatePath('/settings/billing')
    revalidatePath('/settings/plans')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** Cancel the social-connection add-on subscription item. Owner/admin + clinic. */
export async function cancelSocialAddonAction(): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Only clinics can change add-ons.' }
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    return { ok: false, error: 'Only an owner or admin can change billing.' }
  }
  try {
    const { removeSocialAddon } = await import('@/lib/services/social-billing')
    await removeSocialAddon(ctx.organizationId)
    revalidatePath('/settings/billing')
    revalidatePath('/settings/plans')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * Cancel (or resume) the clinic's subscription at period end, in-app — instead
 * of forcing them out to the Stripe portal. Owner/admin + clinic only.
 * Reversible right up to the period end. Returns `{ ok | error }`.
 */
export async function cancelSubscriptionAction(): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Only clinics can change billing.' }
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    return { ok: false, error: 'Only an owner or admin can change billing.' }
  }
  const r = await setSubscriptionCancelation(ctx.organizationId, true)
  if (r.ok) revalidatePath('/settings/billing')
  return r.ok ? { ok: true } : { ok: false, error: r.error }
}

export async function reactivateSubscriptionAction(): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Only clinics can change billing.' }
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    return { ok: false, error: 'Only an owner or admin can change billing.' }
  }
  const r = await setSubscriptionCancelation(ctx.organizationId, false)
  if (r.ok) revalidatePath('/settings/billing')
  return r.ok ? { ok: true } : { ok: false, error: r.error }
}

export async function saveNotificationPrefs(input: unknown) {
  const user = await requireUser()
  const row = await upsertNotificationPrefs(user.id, NotificationPrefsInput.parse(input))
  revalidatePath('/settings/notifications')
  return row
}

export async function sendFeedback(input: unknown) {
  const user = await requireUser()
  const row = await submitFeedback(user.id, FeedbackInput.parse(input))
  revalidatePath('/settings/feedback')
  return row
}
