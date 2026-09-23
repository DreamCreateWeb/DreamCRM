export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getPortalPageContext, requirePortalFeature } from '../portal-data'
import { getShopConfig } from '@/lib/services/shop'
import { showsPortalSiteOutLinks } from '@/lib/clinic-site-helpers'

/**
 * The shop lives on the clinic's public site (one storefront, one cart).
 * This route just carries the patient there from the portal nav.
 */
export default async function PortalShopRedirect() {
  const pc = await getPortalPageContext()
  requirePortalFeature(pc, 'shopLink')
  const cfg = await getShopConfig(pc.ctx.organizationId)
  if (!cfg.storefrontEnabled) redirect('/patient/dashboard')
  // Pre-live: the storefront is on a site that still serves coming-soon, so
  // there is nothing to carry the patient to. The nav entry is already hidden
  // (DREAMCRM-131); this is the same rule on the destination, for the typed
  // URL and the stale tab.
  if (!showsPortalSiteOutLinks(pc.clinic?.siteLiveAt)) redirect('/patient/dashboard')
  redirect(`/site/${pc.ctx.organizationSlug}/shop`)
}
