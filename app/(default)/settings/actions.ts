'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/session'
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
