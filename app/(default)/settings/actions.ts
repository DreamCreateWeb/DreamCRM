'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/session'
import { requireTenant } from '@/lib/auth/context'
import {
  AccountInput,
  AppToggleInput,
  BillingInput,
  BillingPlan,
  FeedbackInput,
  NotificationPrefsInput,
  setAppEnabled,
  submitFeedback,
  updateAccount,
  upsertBilling,
  upsertNotificationPrefs,
} from '@/lib/services/settings'
import { createCheckoutSession, createPortalSession } from '@/lib/services/billing'
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

export async function saveNotificationPrefs(input: unknown) {
  const user = await requireUser()
  const row = await upsertNotificationPrefs(user.id, NotificationPrefsInput.parse(input))
  revalidatePath('/settings/notifications')
  return row
}

export async function toggleApp(input: unknown) {
  const user = await requireUser()
  const data = AppToggleInput.parse(input)
  const row = await setAppEnabled(user.id, data.appKey, data.enabled)
  revalidatePath('/settings/apps')
  return row
}

export async function sendFeedback(input: unknown) {
  const user = await requireUser()
  const row = await submitFeedback(user.id, FeedbackInput.parse(input))
  revalidatePath('/settings/feedback')
  return row
}
