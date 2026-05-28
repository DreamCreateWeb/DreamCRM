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
      <div className="max-w-[560px] mx-auto px-5 sm:px-8 py-20 text-center">
        <div className="w-14 h-14 rounded-full mx-auto flex items-center justify-center text-2xl text-white" style={{ backgroundColor: brand }}>✓</div>
        <h1 className="text-3xl font-bold tracking-[-0.02em] mt-5" style={{ color: INK }}>
          {active ? `You're a member!` : 'Almost there — confirming your membership'}
        </h1>
        <p className="text-[16px] leading-[1.6] mt-3" style={{ color: INK_MUTED }}>
          {active
            ? `Welcome to the ${planName}. Your preventive care is covered and your member savings apply from today. A receipt is on its way to your email.`
            : 'Your payment is being confirmed — you’ll get a receipt by email shortly.'}
        </p>
        <a href={`${basePath || '/'}`} className="inline-block mt-6 text-[15px] font-semibold underline" style={{ color: brand }}>
          Back to home →
        </a>
      </div>
    </BlogChrome>
  )
}
