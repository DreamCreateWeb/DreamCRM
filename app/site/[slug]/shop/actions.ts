'use server'

import { getClinicSiteBySlug, publicSiteUrl } from '@/lib/services/clinic-site'
import { createShopCheckoutSession } from '@/lib/services/shop-checkout'
import { validateCoupon } from '@/lib/services/coupons'
import { checkoutFailure, type CheckoutStart } from '@/lib/services/checkout-error'

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
): Promise<CheckoutStart> {
  // Never THROW out of here. Next.js replaces a server-action error message
  // with an opaque digest in production, so the storefront's catch would show
  // the shopper "An error occurred in the Server Components render" — the raw
  // error a patient saw whenever Stripe was down.
  const site = await getClinicSiteBySlug(slug)
  if (!site) return { ok: false, error: 'We couldn’t find this clinic. Please refresh and try again.' }
  try {
    const { url } = await createShopCheckoutSession(site.orgId, publicSiteUrl(site), input)
    return { ok: true, url }
  } catch (err) {
    return checkoutFailure('shop-checkout', err)
  }
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
