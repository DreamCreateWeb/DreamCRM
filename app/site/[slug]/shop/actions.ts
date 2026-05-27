'use server'

import { getClinicSiteBySlug, publicSiteUrl } from '@/lib/services/clinic-site'
import { createShopCheckoutSession } from '@/lib/services/shop-checkout'

export async function startCheckout(
  slug: string,
  input: {
    items: Array<{ variantId: string; qty: number }>
    fulfillmentType: 'pickup' | 'ship'
    email: string
    name?: string | null
    phone?: string | null
  },
): Promise<{ url: string }> {
  const site = await getClinicSiteBySlug(slug)
  if (!site) throw new Error('Clinic not found')
  return createShopCheckoutSession(site.orgId, publicSiteUrl(site), input)
}
