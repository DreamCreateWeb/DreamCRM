import { eq } from 'drizzle-orm'
import { getTenantContext } from '@/lib/auth/context'
import { db } from '@/lib/db'
import { organization } from '@/lib/db/schema/auth'
import { getShopConfig, listProducts } from '@/lib/services/shop'
import { shopConnectConfigured } from '@/lib/services/shop-connect'
import ShopIntroCard from './shop-intro-card'

/**
 * THE SHOP DOOR (docs/ACTIVATION.md S5, ML-42) — the intro OVER the existing
 * Stripe Connect: three steps (connect Stripe, add a product, share the
 * link), the first one done right there. Every read is best-effort and an
 * unreadable state says so — never "not connected" for a practice whose
 * Stripe is live.
 */
export default async function ShopIntro() {
  const ctx = await getTenantContext()
  if (!ctx || ctx.tenantType !== 'clinic') return null
  const [cfg, products, org] = await Promise.all([
    getShopConfig(ctx.organizationId).catch(() => 'unreadable' as const),
    listProducts(ctx.organizationId).catch(() => 'unreadable' as const),
    db
      .select({ slug: organization.slug })
      .from(organization)
      .where(eq(organization.id, ctx.organizationId))
      .limit(1)
      .catch(() => null),
  ])
  const stripe =
    cfg === 'unreadable'
      ? 'unreadable'
      : cfg.stripeAccountStatus === 'active' && cfg.chargesEnabled
        ? 'ready'
        : (cfg.stripeAccountStatus ?? 'none') === 'none'
          ? 'none'
          : 'pending'
  return (
    <ShopIntroCard
      orgName={ctx.organizationName}
      canManage={ctx.role === 'owner' || ctx.role === 'admin'}
      stripe={stripe}
      connectConfigured={shopConnectConfigured()}
      isDemo={ctx.isDemo}
      productCount={products === 'unreadable' ? null : products.length}
      shopPath={org?.[0] ? `/site/${org[0].slug}/shop` : null}
    />
  )
}
