'use server'

import { getClinicSiteBySlug, publicSiteUrl } from '@/lib/services/clinic-site'
import { createShopCheckoutSession } from '@/lib/services/shop-checkout'
import { validateCoupon } from '@/lib/services/coupons'

export async function startCheckout(
  slug: string,
  input: {
    items: Array<{ variantId: string; qty: number }>
    fulfillmentType: 'pickup' | 'ship'
    email: string
    name?: string | null
    phone?: string | null
    couponCode?: string | null
  },
): Promise<{ url: string }> {
  const site = await getClinicSiteBySlug(slug)
  if (!site) throw new Error('We couldn’t find this clinic. Please refresh and try again.')
  return createShopCheckoutSession(site.orgId, publicSiteUrl(site), input)
}

export async function applyCoupon(
  slug: string,
  code: string,
  subtotalCents: number,
): Promise<{ ok: boolean; error?: string; discountCents?: number }> {
  const site = await getClinicSiteBySlug(slug)
  if (!site) return { ok: false, error: 'We couldn’t find this clinic. Please refresh and try again.' }
  const v = await validateCoupon(site.orgId, code, subtotalCents)
  return { ok: v.ok, error: v.error, discountCents: v.discountCents }
}
