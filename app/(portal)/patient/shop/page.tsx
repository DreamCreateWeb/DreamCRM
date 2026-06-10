export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getPortalPageContext, requirePortalFeature } from '../portal-data'
import { getShopConfig } from '@/lib/services/shop'

/**
 * The shop lives on the clinic's public site (one storefront, one cart).
 * This route just carries the patient there from the portal nav.
 */
export default async function PortalShopRedirect() {
  const pc = await getPortalPageContext()
  requirePortalFeature(pc, 'shopLink')
  const cfg = await getShopConfig(pc.ctx.organizationId)
  if (!cfg.storefrontEnabled) redirect('/patient/dashboard')
  redirect(`/site/${pc.ctx.organizationSlug}/shop`)
}
