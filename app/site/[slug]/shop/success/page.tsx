import { notFound } from 'next/navigation'
import { getClinicSiteBySlug } from '@/lib/services/clinic-site'
import { finalizeOrderFromSession } from '@/lib/services/shop-checkout'
import { formatCents } from '@/lib/types/shop'
import BlogChrome from '@/components/clinic-site/blog-chrome'
import ClearCart from '../clear-cart'

const INK = '#1C1A17'
const INK_MUTED = '#6B635A'

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
    <BlogChrome data={data} basePath={`/site/${slug}`}>
      <ClearCart slug={slug} />
      <div className="max-w-[560px] mx-auto px-5 sm:px-8 py-20 text-center">
        <div className="w-14 h-14 rounded-full mx-auto flex items-center justify-center text-2xl text-white" style={{ backgroundColor: brand }}>✓</div>
        <h1 className="text-3xl font-bold tracking-[-0.02em] mt-5" style={{ color: INK }}>
          {paid ? 'Thank you — your order is confirmed!' : 'Thanks — we’re processing your order'}
        </h1>
        <p className="text-[16px] leading-[1.6] mt-3" style={{ color: INK_MUTED }}>
          {paid
            ? totalCents > 0
              ? `We received your payment of ${formatCents(totalCents)}. A receipt is on its way to your email.`
              : 'A receipt is on its way to your email.'
            : 'Your payment is being confirmed — you’ll get a receipt by email shortly.'}
          {paid && pickup ? ' We’ll have it ready to pick up at your next visit.' : ''}
        </p>
        <a href={`/site/${slug}/shop`} className="inline-block mt-6 text-[15px] font-semibold underline" style={{ color: brand }}>
          Continue shopping →
        </a>
      </div>
    </BlogChrome>
  )
}
