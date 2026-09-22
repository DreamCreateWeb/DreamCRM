'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/session'
import { requireTenant } from '@/lib/auth/context'
import {
  AccountInput,
  FeedbackInput,
  NotificationPrefsInput,
  submitFeedback,
  updateAccount,
  upsertNotificationPrefs,
} from '@/lib/services/settings'
import { createCheckoutSession, createPortalSession, setSubscriptionCancelation, updateSubscriptionPlan } from '@/lib/services/billing'
import { billingActionFailure } from '@/lib/services/billing-action-error'
import { PLAN_CHANGE_UNCONFIRMED_MESSAGE, type BillingActionState } from '@/lib/types/billing-action'
import { PURCHASABLE_PLANS } from '@/lib/stripe-config'
import type { BillingInterval, PlanId } from '@/lib/stripe-config'

export async function saveAccount(input: unknown) {
  const user = await requireUser()
  const row = await updateAccount(user.id, AccountInput.parse(input))
  revalidatePath('/settings/account')
  return row
}

// `saveBilling` and `changePlan` are gone (DREAMCRM-58). Both wrote the
// user-keyed `billing_profiles` table that nothing read back, and neither had
// a caller left — the merged Settings → Billing surface reads plan and
// subscription state from the org-scoped clinic_profile via `requireTenant`,
// and a plan is CHANGED through `startStripeCheckout` /
// `updateSubscriptionPlan` below, which move real money at Stripe.
//
// `changePlan` in particular took the plan name straight from its caller and
// wrote it, which is the shape of a plan escalation waiting for someone to
// point a read at the wrong table. Its name also collided with the genuine
// `changePlan` in `app/(default)/ecommerce/invoices/admin-actions.ts` (a Stripe
// price swap), which is exactly the confusion a dead twin causes.

/**
 * Start a Stripe Checkout (or swap the plan in place) for this clinic.
 *
 * RETURNS its refusal rather than throwing — see
 * `lib/services/billing-action-error.ts` for why a thrown message never reaches
 * the person who clicked. A resolved result is ALWAYS a failure: every success
 * path below ends in `redirect()`, which throws NEXT_REDIRECT.
 *
 * Note the shape of the trys: they wrap the Stripe/DB legs ONLY, and every
 * `redirect()` sits outside them. A redirect inside a try would be caught as a
 * failure, and the clinic would be told checkout could not start while it in
 * fact could — the navigation simply never happening.
 *
 * And note that there are TWO of them rather than one (Sentinel's N1 on #663),
 * because the two legs have different things to say about money. Opening a
 * Checkout session has charged nothing. The in-place swap has already called
 * `stripe.subscriptions.update(…, proration_behavior: 'create_prorations')` by
 * the time its sync-back can throw, so a clinic whose swap committed and whose
 * sync failed must not be told "nothing has been charged" — that is a false
 * statement about their money on the one path where money has actually moved.
 */
export async function startStripeCheckout(
  planId: PlanId,
  interval: BillingInterval,
): Promise<BillingActionState> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') {
    return { error: 'Only clinic tenants can change plans here' }
  }
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    return { error: 'Only an owner or admin can change billing.' }
  }
  // Self-serve may only buy a PURCHASABLE plan. The legacy Basic/Pro rows
  // survive in PLANS as managed-provisioning lookups (used by /billing/activate
  // with a platform-reserved pendingPlanId); accepting a client planId here
  // would let a clinic mint a subscription at the cheaper legacy price for the
  // same full access (no-plan-gating).
  if (!PURCHASABLE_PLANS.some((p) => p.id === planId)) {
    return { error: 'That plan isn’t available for self-serve checkout.' }
  }

  // A clinic that ALREADY has a live subscription changes plan in place
  // (price swap + proration) — Checkout would mint a SECOND subscription and
  // the old one would keep billing. Checkout is only for the first purchase.
  let changedInPlace: boolean
  try {
    changedInPlace = await updateSubscriptionPlan({
      organizationId: ctx.organizationId,
      planId,
      interval,
    })
  } catch (err) {
    return billingActionFailure('settings.plan-swap', err, PLAN_CHANGE_UNCONFIRMED_MESSAGE)
  }
  if (changedInPlace) {
    revalidatePath('/settings/billing')
    redirect('/settings/billing?checkout=success')
  }

  let destination: string
  try {
    const session = await createCheckoutSession({
      organizationId: ctx.organizationId,
      email: ctx.userEmail,
      name: ctx.organizationName,
      planId,
      interval,
    })
    if (!session.url) {
      return { error: 'We couldn’t start checkout just now — please try again in a moment.' }
    }
    destination = session.url
  } catch (err) {
    return billingActionFailure('settings.checkout', err)
  }
  redirect(destination)
}

/**
 * The `useActionState` adapter for the above, for surfaces that reach checkout
 * through a `<form action={…}>` rather than a direct call — today the
 * trial-ended wall, which had nothing to read a result with at all. Bind the
 * plan and interval; React supplies the last two arguments.
 */
export async function startStripeCheckoutFormAction(
  planId: PlanId,
  interval: BillingInterval,
  _prevState: BillingActionState,
  _formData: FormData,
): Promise<BillingActionState> {
  return startStripeCheckout(planId, interval)
}

/** Open the Stripe Customer Portal. Returns its refusal for the same reason
 *  `startStripeCheckout` does; the success path redirects and never returns. */
export async function openBillingPortal(): Promise<BillingActionState> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') {
    return { error: 'Only clinic tenants can open a billing portal here' }
  }
  // The Stripe Customer Portal can cancel the subscription and swap the card —
  // owner/admin only, like every sibling billing action.
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    return { error: 'Only an owner or admin can manage billing.' }
  }
  let portalUrl: string
  try {
    const portal = await createPortalSession({
      organizationId: ctx.organizationId,
      email: ctx.userEmail,
      name: ctx.organizationName,
    })
    portalUrl = portal.url
  } catch (err) {
    return billingActionFailure('settings.portal', err)
  }
  redirect(portalUrl)
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

/** Mute / un-mute the current staff member's recurring report emails (the
 *  morning digest + the Monday week-in-review) from the notifications
 *  settings page — the same per-staff opt-out My Day's toggle writes. The
 *  report emails' footer points HERE, so this page must actually be able
 *  to silence them (Phase-2 self-sweep). */
export async function setMyEmailReportsOptOutAction(
  optedOut: boolean,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { error: 'Only clinic staff get these report emails.' }
  try {
    const { setDigestOptOut } = await import('@/lib/services/staff-notification-pref')
    await setDigestOptOut(ctx.organizationId, ctx.userId, optedOut)
    revalidatePath('/settings/notifications')
    return { ok: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not save your preference.' }
  }
}

export async function sendFeedback(input: unknown) {
  const user = await requireUser()
  const row = await submitFeedback(user.id, FeedbackInput.parse(input))
  revalidatePath('/settings/feedback')
  return row
}
