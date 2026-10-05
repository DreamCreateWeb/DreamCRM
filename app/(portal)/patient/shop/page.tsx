export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getPortalPageContext, requirePortalFeature } from '../portal-data'
import { getShopConfig } from '@/lib/services/shop'

/**
 * The shop lives on the clinic's public site (one storefront, one cart).
 * This route just carries the patient there from the portal nav — and only
 * while that site is PUBLISHED: an unpublished site answers `/shop` with
 * "coming soon", so until the go-live lever is pulled this door sends the
 * patient home instead (the nav already hides it; this is the same rule for
 * a typed or bookmarked URL).
 */
export default async function PortalShopRedirect() {
  const pc = await getPortalPageContext()
  requirePortalFeature(pc, 'shopLink')
  const cfg = await getShopConfig(pc.ctx.organizationId)
  if (!cfg.storefrontEnabled || !pc.clinic?.siteLive) redirect('/patient/dashboard')
  redirect(`/site/${pc.ctx.organizationSlug}/shop`)
}
