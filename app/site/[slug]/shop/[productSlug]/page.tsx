import { notFound } from 'next/navigation'
import { getClinicSiteBySlug, publicSiteUrl, resolveSiteBasePath } from '@/lib/services/clinic-site'
import { getActiveProductBySlug, getShopConfig } from '@/lib/services/shop'
import { CATEGORY_LABELS } from '@/lib/types/shop'
import BlogChrome from '@/components/clinic-site/blog-chrome'
import { readableInk } from '@/lib/clinic-site-theme'
import { productJsonLd } from '@/lib/clinic-site-jsonld'
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
  // Contrast-safe text fill for brand-colored headings/eyebrows on the warm
  // ground (raw brand stays on backgrounds/borders/pills only).
  const headingInk = readableInk(brand)
  const name = data.profile.displayName ?? data.orgName

  // Product + Offer JSON-LD — lowest variant price + honest availability (a
  // product is in stock when any variant is in stock; untracked inventory =
  // available). No fabricated price: minPriceCents is the real catalog price.
  const productLd = productJsonLd({
    name: product.name,
    description: product.description ?? null,
    image: product.images[0] ?? null,
    url: `${publicSiteUrl(data)}/shop/${product.slug}`,
    priceCents: product.minPriceCents,
    inStock: product.totalInventory == null || product.totalInventory > 0,
    clinicName: name,
  })

  return (
    <BlogChrome data={data} basePath={basePath}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productLd) }}
      />
      <div className="max-w-[1100px] mx-auto px-5 sm:px-8 py-14 sm:py-20">
        <a
          href={`${basePath}/shop`}
          className="inline-flex items-center gap-1 text-[14px] font-semibold transition-all duration-300 hover:gap-2"
          style={{ color: headingInk }}
        >
          <span aria-hidden="true">←</span> All products
        </a>
        <div className="grid md:grid-cols-2 gap-10 lg:gap-14 mt-6 items-start">
          <div
            className="aspect-square w-full rounded-3xl overflow-hidden transition-transform duration-700 hover:scale-[1.01]"
            style={{ backgroundColor: `${brand}1A` }}
          >
            {product.images[0] ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={product.images[0]}
                alt={product.name}
                className="w-full h-full object-cover"
                width={800}
                height={800}
                loading="eager"
                fetchPriority="high"
                decoding="async"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-base" style={{ color: headingInk }}>
                {CATEGORY_LABELS[product.category]}
              </div>
            )}
          </div>
          <div>
            <span
              className="text-[11px] font-semibold uppercase tracking-[0.18em]"
              style={{ color: headingInk }}
            >
              {CATEGORY_LABELS[product.category]}
            </span>
            <h1
              className="text-[32px] sm:text-[40px] lg:text-[48px] font-semibold tracking-[-0.015em] leading-[1.08] mt-2"
              style={{ color: headingInk, fontFamily: 'var(--font-display, Georgia, serif)' }}
            >
              {product.name}
            </h1>
            {product.description && (
              <p
                className="text-[16px] leading-[1.65] mt-5 whitespace-pre-wrap"
                style={{ color: INK_MUTED }}
              >
                {product.description}
              </p>
            )}
            {product.fsaEligible && (
              <p className="text-[13px] mt-3 inline-flex items-center gap-1.5" style={{ color: INK_MUTED }}>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: brand }} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                FSA/HSA-eligible with a dentist&apos;s prescription.
              </p>
            )}
            <div className="mt-7 pt-7 border-t" style={{ borderColor: BORDER }}>
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
