import { notFound } from 'next/navigation'
import { getClinicSiteBySlug, publicSiteUrl, resolveSiteBasePath } from '@/lib/services/clinic-site'
import { getActiveProductBySlug, getShopConfig } from '@/lib/services/shop'
import { CATEGORY_LABELS } from '@/lib/types/shop'
import BlogChrome from '@/components/clinic-site/blog-chrome'
import AddToCart from '../add-to-cart'

const INK = '#1C1A17'
const INK_MUTED = '#6B635A'
const BORDER = '#E8E2D9'

interface Props {
  params: Promise<{ slug: string; productSlug: string }>
}

export async function generateMetadata({ params }: Props) {
  const { slug, productSlug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) return {}
  const product = await getActiveProductBySlug(data.orgId, productSlug)
  if (!product) return {}
  const name = data.profile.displayName ?? data.orgName
  const url = `${publicSiteUrl(data)}/shop/${product.slug}`
  return {
    title: `${product.name} — ${name}`,
    description: product.description?.slice(0, 180) ?? `${product.name} from ${name}.`,
    alternates: { canonical: url },
    openGraph: { title: product.name, images: product.images.slice(0, 1), url, type: 'website' },
  }
}

export default async function ClinicProductPage({ params }: Props) {
  const { slug, productSlug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) notFound()
  const config = await getShopConfig(data.orgId)
  if (!config.storefrontEnabled) notFound()
  const product = await getActiveProductBySlug(data.orgId, productSlug)
  if (!product) notFound()

  const basePath = await resolveSiteBasePath(slug)
  const brand = data.profile.brandColor ?? '#9CAF9F'

  return (
    <BlogChrome data={data} basePath={basePath}>
      <div className="max-w-[1000px] mx-auto px-5 sm:px-8 py-14 sm:py-20">
        <a href={`${basePath}/shop`} className="text-[14px] font-medium" style={{ color: brand }}>← All products</a>
        <div className="grid md:grid-cols-2 gap-10 mt-5">
          <div className="aspect-square w-full rounded-2xl overflow-hidden" style={{ backgroundColor: `${brand}1A` }}>
            {product.images[0] ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={product.images[0]} alt={product.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center" style={{ color: brand }}>
                {CATEGORY_LABELS[product.category]}
              </div>
            )}
          </div>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: brand }}>
              {CATEGORY_LABELS[product.category]}
            </span>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-[-0.02em] mt-1" style={{ color: INK }}>{product.name}</h1>
            {product.description && (
              <p className="text-[16px] leading-[1.6] mt-4 whitespace-pre-wrap" style={{ color: INK_MUTED }}>{product.description}</p>
            )}
            {product.fsaEligible && (
              <p className="text-[13px] mt-3" style={{ color: INK_MUTED }}>FSA/HSA-eligible with a dentist&apos;s prescription.</p>
            )}
            <div className="mt-6 pt-6 border-t" style={{ borderColor: BORDER }}>
              <AddToCart
                slug={slug}
                brand={brand}
                basePath={basePath}
                product={{
                  slug: product.slug,
                  name: product.name,
                  image: product.images[0] ?? null,
                  variants: product.variants.map((v) => ({ id: v.id, name: v.name, priceCents: v.priceCents, inStock: v.inventoryQty == null || v.inventoryQty > 0 })),
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </BlogChrome>
  )
}
