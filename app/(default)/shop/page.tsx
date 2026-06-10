import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { requireTenant } from '@/lib/auth/context'
import { db } from '@/lib/db'
import { organization } from '@/lib/db/schema/auth'
import { getShopConfig, listProducts, getShopStats, getOrderStats, shopConnectConfigured } from '@/lib/services/shop'
import { refreshConnectStatus } from '@/lib/services/shop-connect'
import { getMembershipStats } from '@/lib/services/membership'
import ShopClient from './shop-client'
import ModuleHint from '@/components/onboarding/module-hint'

export const metadata = { title: 'Shop - DreamCRM' }
export const dynamic = 'force-dynamic'

export default async function ShopPage({ searchParams }: { searchParams: Promise<{ connected?: string; connectError?: string }> }) {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType !== 'clinic') redirect('/dashboard')

  const { connected, connectError } = await searchParams
  // Flip pending → active without a manual reconnect once onboarding finishes.
  await refreshConnectStatus(ctx.organizationId)

  const [config, products, stats, orderStats, membershipStats, orgRow] = await Promise.all([
    getShopConfig(ctx.organizationId),
    listProducts(ctx.organizationId),
    getShopStats(ctx.organizationId),
    getOrderStats(ctx.organizationId),
    getMembershipStats(ctx.organizationId),
    db.select({ slug: organization.slug }).from(organization).where(eq(organization.id, ctx.organizationId)).limit(1),
  ])

  const publicBase = orgRow[0] ? `/site/${orgRow[0].slug}/shop` : null

    return (
    <>
      <div className="px-4 sm:px-6 lg:px-8 pt-6 w-full max-w-[96rem] mx-auto -mb-2">
        <ModuleHint id="shop" />
      </div>
    <ShopClient
      config={config}
      products={products}
      stats={stats}
      orderStats={orderStats}
      membershipStats={membershipStats}
      publicBase={publicBase}
      connectConfigured={shopConnectConfigured()}
      connectBanner={connected ? 'connected' : connectError ? `error:${connectError}` : null}
      orgName={ctx.organizationName}
    />
    </>
  )
}
