import { notFound } from 'next/navigation'
import { getClinicSiteBySlug, resolveSiteBasePath } from '@/lib/services/clinic-site'
import { finalizeOrderFromSession } from '@/lib/services/shop-checkout'
import { formatCents } from '@/lib/types/shop'
import BlogChrome from '@/components/clinic-site/blog-chrome'
import { readableInk } from '@/lib/clinic-site-theme'
import ClearCart from '../clear-cart'
import { SITE_INK_MUTED as INK_MUTED } from '@/components/clinic-site/tokens'


interface Props {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ session_id?: string }>
}

export const metadata = { title: 'Order confirmed', robots: { index: false } }

export default async function ShopSuccessPage({ params, searchParams }: Props) {
  const { slug } = await params
  const { session_id } = await searchParams
  const data = await getClinicSiteBySlug(slug)
  if (!data) notFound()

  const brand = data.profile.brandColor ?? '#9CAF9F'
  // Contrast-safe text fill for brand-colored headings/eyebrows on the warm
  // ground (raw brand stays on backgrounds/borders/pills only).
  const headingInk = readableInk(brand)
  const basePath = await resolveSiteBasePath(slug)
  let paid = false
  let totalCents = 0
  let pickup = false
  if (session_id) {
    try {
      const order = await finalizeOrderFromSession(data.orgId, session_id)
      if (order) {
        paid = order.status === 'paid'
        totalCents = order.totalCents
        pickup = order.fulfillmentType === 'pickup'
      }
    } catch {
      // Finalization is best-effort here; the webhook is the backstop.
    }
  }

  return (
    <BlogChrome data={data} basePath={basePath}>
      <ClearCart slug={slug} />
      <div className="max-w-[600px] mx-auto px-5 sm:px-8 py-14 sm:py-20 text-center">
        <div
          className="w-16 h-16 rounded-full mx-auto flex items-center justify-center text-3xl text-white shadow-md"
          style={{ backgroundColor: brand }}
        >
          ✓
        </div>
        <h1
          className="text-[32px] sm:text-[44px] lg:text-[52px] font-semibold leading-[1.06] tracking-[-0.015em] mt-7"
          style={{ color: headingInk, fontFamily: 'var(--font-display, Georgia, serif)' }}
        >
          {paid ? 'Thank you — your order is confirmed!' : 'Thanks — we’re processing your order'}
        </h1>
        <p className="text-[16px] sm:text-lg leading-[1.6] mt-4" style={{ color: INK_MUTED }}>
          {paid
            ? totalCents > 0
              ? `We received your payment of ${formatCents(totalCents)}. A receipt is on its way to your email.`
              : 'A receipt is on its way to your email.'
            : 'Your payment is being confirmed — you’ll get a receipt by email shortly.'}
          {paid && pickup ? ' We’ll have it ready to pick up at your next visit.' : ''}
        </p>
        <a
          href={`${basePath}/shop`}
          className="inline-flex items-center gap-1.5 mt-7 text-[15px] font-semibold transition-all duration-300 hover:gap-2.5"
          style={{ color: headingInk }}
        >
          Continue shopping <span aria-hidden="true">→</span>
        </a>
      </div>
    </BlogChrome>
  )
}
