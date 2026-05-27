'use server'

import { getClinicSiteBySlug, publicSiteUrl } from '@/lib/services/clinic-site'
import { createMembershipCheckout } from '@/lib/services/membership'

export async function startMembershipCheckout(
  slug: string,
  input: { planSlug: string; email: string; firstName?: string | null; lastName?: string | null; phone?: string | null },
): Promise<{ url: string }> {
  const site = await getClinicSiteBySlug(slug)
  if (!site) throw new Error('Clinic not found')
  return createMembershipCheckout(site.orgId, publicSiteUrl(site), input)
}
