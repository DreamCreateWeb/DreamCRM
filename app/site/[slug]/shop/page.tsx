import { notFound } from 'next/navigation'
import { getClinicSiteBySlug, publicSiteUrl, resolveSiteBasePath } from '@/lib/services/clinic-site'
import { listActiveProducts, getShopConfig } from '@/lib/services/shop'
import { CATEGORY_LABELS, priceRangeLabel } from '@/lib/types/shop'
import BlogChrome from '@/components/clinic-site/blog-chrome'
import ScrollReveal from '@/components/clinic-site/scroll-reveal'
import { readableInk } from '@/lib/clinic-site-theme'
import CartButton from './cart-button'
import { SITE_INK as INK, SITE_INK_MUTED as INK_MUTED, SITE_BORDER as BORDER } from '@/components/clinic-site/tokens'


interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) return {}
  const name = data.profile.displayName ?? data.orgName
  const url = `${publicSiteUrl(data)}/shop`
  const title = `Shop — ${name}`
  const description = `Professional-grade dental products from ${name} — whitening, brushes, and more.`
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: name, type: 'website' },
  }
}

export default async function ClinicShopPage({ params }: Props) {
  const { slug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) notFound()
  const config = await getShopConfig(data.orgId)
  if (!config.storefrontEnabled) notFound()

  const basePath = await resolveSiteBasePath(slug)
  const brand = data.profile.brandColor ?? '#9CAF9F'
  // Contrast-safe text fill for brand-colored headings/eyebrows on the warm
  // ground (raw brand stays on backgrounds/borders/pills only).
  const headingInk = readableInk(brand)
  const products = await listActiveProducts(data.orgId)

  return (
    <BlogChrome data={data} basePath={basePath}>
      <div className="max-w-[1180px] mx-auto px-5 sm:px-8 py-14 sm:py-20">
        <div className="flex items-start justify-between gap-4 mb-12 sm:mb-14">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] mb-5" style={{ color: headingInk }}>
              Shop
            </p>
            <h1
              className="text-[32px] sm:text-[48px] lg:text-[64px] font-semibold leading-[1.05] tracking-[-0.015em]"
              style={{ color: headingInk, fontFamily: 'var(--font-display, Georgia, serif)' }}
            >
              Our recommended products
            </h1>
            <p className="text-lg leading-[1.55] mt-4 max-w-[560px]" style={{ color: INK_MUTED }}>
              The same professional-grade products we use and trust — buy online and pick up at your next visit or
              ship to your door.
            </p>
          </div>
          <CartButton slug={slug} brand={brand} basePath={basePath} />
        </div>

        {products.length === 0 ? (
          <div
            className="rounded-2xl border border-dashed py-16 text-center"
            style={{ borderColor: BORDER, color: INK_MUTED }}
          >
            <p className="text-base">No products available right now — check back soon.</p>
          </div>
        ) : (
          <div className="grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((p, i) => (
              <ScrollReveal as="div" key={p.id} delay={(i % 3) * 90}>
                <a href={`${basePath}/shop/${p.slug}`} className="group flex flex-col h-full">
                  <div
                    className="aspect-square w-full rounded-2xl overflow-hidden mb-5"
                    style={{ backgroundColor: `${brand}1A` }}
                  >
                    {p.images[0] ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={p.images[0]}
                        alt={p.name}
                        className="w-full h-full object-cover transition duration-500 group-hover:scale-[1.04]"
                        width={600}
                        height={600}
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-sm" style={{ color: headingInk }}>
                        {CATEGORY_LABELS[p.category]}
                      </div>
                    )}
                  </div>
                  <span
                    className="text-[11px] font-semibold uppercase tracking-[0.12em] mb-1"
                    style={{ color: headingInk }}
                  >
                    {CATEGORY_LABELS[p.category]}
                  </span>
                  <h2
                    className="text-lg font-semibold leading-snug tracking-[-0.01em] transition group-hover:opacity-80"
                    style={{ color: INK, fontFamily: 'var(--font-display, Georgia, serif)' }}
                  >
                    {p.name}
                  </h2>
                  <p className="text-[15px] mt-1 font-medium" style={{ color: INK }}>
                    {priceRangeLabel(p)}
                  </p>
                </a>
              </ScrollReveal>
            ))}
          </div>
        )}
      </div>
    </BlogChrome>
  )
}
