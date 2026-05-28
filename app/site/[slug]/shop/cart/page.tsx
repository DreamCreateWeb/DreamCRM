import { notFound } from 'next/navigation'
import { getClinicSiteBySlug, resolveSiteBasePath } from '@/lib/services/clinic-site'
import { getShopConfig } from '@/lib/services/shop'
import BlogChrome from '@/components/clinic-site/blog-chrome'
import CartView from '../cart-view'

interface Props {
  params: Promise<{ slug: string }>
}

export const metadata = { title: 'Cart', robots: { index: false } }

export default async function ClinicCartPage({ params }: Props) {
  const { slug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) notFound()
  const config = await getShopConfig(data.orgId)
  if (!config.storefrontEnabled) notFound()
  const basePath = await resolveSiteBasePath(slug)

  return (
    <BlogChrome data={data} basePath={basePath}>
      <div className="max-w-[760px] mx-auto px-5 sm:px-8 py-14 sm:py-20">
        <CartView
          slug={slug}
          basePath={basePath}
          brand={data.profile.brandColor ?? '#9CAF9F'}
          pickupEnabled={config.pickupEnabled}
          shippingEnabled={config.shippingEnabled}
        />
      </div>
    </BlogChrome>
  )
}
