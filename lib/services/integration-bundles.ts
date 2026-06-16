import 'server-only'

import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { activeBundleIds, type BundleId, type BundleSignals } from '@/lib/integrations/bundles'

/**
 * SIDEBAR-side bundle derive — the cheap, runs-on-every-authenticated-page-load
 * companion to the rich live state the `/integrations` page assembles.
 *
 * The activation model is AUTO-DERIVED (no opt-in flag, no migration): a bundle
 * is active when the clinic has connected something inside it. This reads that
 * from live connection state with the LIGHTEST possible queries — a few indexed,
 * org-scoped, LIMIT-bounded lookups in parallel — so adding it to DashboardShell
 * costs ~one extra round-trip, not the heavy PMS dashboard the page loads.
 *
 * Only computed for CLINIC tenants (the caller skips it otherwise); the other
 * registries carry no `requiresBundle` modules, so they need no bundle state.
 */
export async function getSidebarBundleSignals(organizationId: string): Promise<BundleSignals> {
  const [zernioRows, shopRows, pmsRows, gmailRows] = await Promise.all([
    // Connected Zernio accounts → google (GBP) + social. One small read; we only
    // need to know which platforms exist, so a tight LIMIT is plenty.
    db
      .select({ platform: schema.zernioAccount.platform })
      .from(schema.zernioAccount)
      .where(eq(schema.zernioAccount.organizationId, organizationId))
      .limit(20),
    // Ecommerce — Stripe engaged, OR a storefront/membership already set up (the
    // safety net so a clinic with a live shop keeps its Shop sidebar entry).
    db
      .select({
        stripeAccountStatus: schema.shopConfig.stripeAccountStatus,
        storefrontEnabled: schema.shopConfig.storefrontEnabled,
        membershipEnabled: schema.shopConfig.membershipEnabled,
      })
      .from(schema.shopConfig)
      .where(eq(schema.shopConfig.organizationId, organizationId))
      .limit(1),
    // PMS connected (Open Dental / demo sandbox).
    db
      .select({ status: schema.pmsConnection.status })
      .from(schema.pmsConnection)
      .where(eq(schema.pmsConnection.organizationId, organizationId))
      .limit(1),
    // A live practice mailbox (Gmail).
    db
      .select({ id: schema.emailAccount.id })
      .from(schema.emailAccount)
      .where(and(eq(schema.emailAccount.organizationId, organizationId), eq(schema.emailAccount.disabled, false)))
      .limit(1),
  ])

  const googleConnected = zernioRows.some((r) => r.platform === 'googlebusiness')
  const socialConnected = zernioRows.some((r) => r.platform !== 'googlebusiness')

  const shop = shopRows[0]
  const paymentsActive =
    !!shop && (shop.stripeAccountStatus !== 'none' || shop.storefrontEnabled === 1 || shop.membershipEnabled === 1)

  return {
    pmsConnected: pmsRows[0]?.status === 'connected',
    googleConnected,
    socialConnected,
    communicationConnected: gmailRows.length > 0,
    paymentsActive,
  }
}

/** The set of bundle ids active for a clinic — the sidebar feature-gate input. */
export async function getActiveBundlesForSidebar(organizationId: string): Promise<Set<BundleId>> {
  return activeBundleIds(await getSidebarBundleSignals(organizationId))
}
