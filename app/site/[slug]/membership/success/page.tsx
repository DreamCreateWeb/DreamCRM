import { notFound } from 'next/navigation'
import { getClinicSiteBySlug, resolveSiteBasePath } from '@/lib/services/clinic-site'
import { finalizeMembershipFromSession } from '@/lib/services/membership'
import BlogChrome from '@/components/clinic-site/blog-chrome'

const INK = '#1C1A17'
const INK_MUTED = '#6B635A'

interface Props {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ session_id?: string }>
}

export const metadata = { title: 'Welcome to the club', robots: { index: false } }

export default async function MembershipSuccessPage({ params, searchParams }: Props) {
  const { slug } = await params
  const { session_id } = await searchParams
  const data = await getClinicSiteBySlug(slug)
  if (!data) notFound()
  const brand = data.profile.brandColor ?? '#9CAF9F'
  const basePath = await resolveSiteBasePath(slug)

  let active = false
  let planName = 'membership'
  if (session_id) {
    try {
      const res = await finalizeMembershipFromSession(data.orgId, session_id)
      if (res) {
        active = res.active
        planName = res.planName
      }
    } catch {
      /* webhook is the backstop */
    }
  }

  return (
    <BlogChrome data={data} basePath={basePath}>
      <div className="max-w-[600px] mx-auto px-5 sm:px-8 py-14 sm:py-20 text-center">
        <div
          className="w-16 h-16 rounded-full mx-auto flex items-center justify-center text-3xl text-white shadow-md"
          style={{ backgroundColor: brand }}
        >
          ✓
        </div>
        <h1
          className="text-[32px] sm:text-[44px] lg:text-[52px] font-semibold leading-[1.06] tracking-[-0.015em] mt-7"
          style={{ color: brand, fontFamily: 'var(--font-display, Georgia, serif)' }}
        >
          {active ? `You're a member!` : 'Almost there — confirming your membership'}
        </h1>
        <p className="text-[16px] sm:text-lg leading-[1.6] mt-4" style={{ color: INK_MUTED }}>
          {active
            ? `Welcome to the ${planName}. Your preventive care is covered and your member savings apply from today. A receipt is on its way to your email.`
            : 'Your payment is being confirmed — you’ll get a receipt by email shortly.'}
        </p>
        <a
          href={`${basePath || '/'}`}
          className="inline-flex items-center gap-1.5 mt-7 text-[15px] font-semibold transition-all duration-300 hover:gap-2.5"
          style={{ color: brand }}
        >
          Back to home <span aria-hidden="true">→</span>
        </a>
      </div>
    </BlogChrome>
  )
}
