'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireTenant } from '@/lib/auth/context'
import {
  archivePrice,
  archiveProduct,
  cancelSubscriptionNow,
  changeSubscriptionPrice,
  createProductWithPrices,
  setSubscriptionCancelAtPeriodEnd,
  unarchivePrice,
} from '@/lib/services/stripe-admin'

async function requirePlatformAdmin() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'platform' || (ctx.role !== 'owner' && ctx.role !== 'admin')) {
    throw new Error('Forbidden: platform admin only')
  }
  return ctx
}

function revalidate() {
  revalidatePath('/ecommerce/invoices')
}

// ---------- Subscriptions ----------

export async function cancelSubscription(id: string) {
  await requirePlatformAdmin()
  await cancelSubscriptionNow(id)
  revalidate()
  return { ok: true }
}

export async function toggleCancelAtPeriodEnd(id: string, cancel: boolean) {
  await requirePlatformAdmin()
  await setSubscriptionCancelAtPeriodEnd(id, cancel)
  revalidate()
  return { ok: true }
}

export async function changePlan(subscriptionId: string, newPriceId: string) {
  await requirePlatformAdmin()
  await changeSubscriptionPrice(subscriptionId, newPriceId, 'create_prorations')
  revalidate()
  return { ok: true }
}

// ---------- Products / Prices ----------

const CreatePlanInput = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional().nullable(),
  monthlyPriceDollars: z.number().min(0).optional().nullable(),
  annualPriceDollars: z.number().min(0).optional().nullable(),
  currency: z.string().length(3).default('usd'),
})

export async function createPlan(input: unknown) {
  await requirePlatformAdmin()
  const data = CreatePlanInput.parse(input)
  if (!data.monthlyPriceDollars && !data.annualPriceDollars) {
    throw new Error('Need at least a monthly or annual price')
  }
  const result = await createProductWithPrices({
    name: data.name,
    description: data.description ?? null,
    monthlyAmountCents: data.monthlyPriceDollars ? Math.round(data.monthlyPriceDollars * 100) : null,
    annualAmountCents: data.annualPriceDollars ? Math.round(data.annualPriceDollars * 100) : null,
    currency: data.currency,
  })
  revalidate()
  return { ok: true, productId: result.product.id, priceIds: result.prices.map((p) => p.id) }
}

export async function archivePlanPrice(priceId: string) {
  await requirePlatformAdmin()
  await archivePrice(priceId)
  revalidate()
  return { ok: true }
}

export async function unarchivePlanPrice(priceId: string) {
  await requirePlatformAdmin()
  await unarchivePrice(priceId)
  revalidate()
  return { ok: true }
}

export async function archivePlanProduct(productId: string) {
  await requirePlatformAdmin()
  await archiveProduct(productId)
  revalidate()
  return { ok: true }
}
