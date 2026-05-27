import { notFound } from 'next/navigation'
import { getClinicSiteBySlug, publicSiteUrl } from '@/lib/services/clinic-site'
import { getShopConfig } from '@/lib/services/shop'
import { listActivePlans } from '@/lib/services/membership'
import BlogChrome from '@/components/clinic-site/blog-chrome'
import MembershipJoin from './membership-join'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) return {}
  const name = data.profile.displayName ?? data.orgName
  const url = `${publicSiteUrl(data)}/membership`
  const title = `Membership — ${name}`
  const description = `No insurance? Join the ${name} membership plan — preventive care covered plus savings on treatment.`
  return { title, description, alternates: { canonical: url }, openGraph: { title, description, url, type: 'website' } }
}

const INK = '#1C1A17'
const INK_MUTED = '#6B635A'

export default async function ClinicMembershipPage({ params }: Props) {
  const { slug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) notFound()
  const config = await getShopConfig(data.orgId)
  if (!config.membershipEnabled) notFound()
  const plans = await listActivePlans(data.orgId)

  const brand = data.profile.brandColor ?? '#9CAF9F'
  const name = data.profile.displayName ?? data.orgName

  return (
    <BlogChrome data={data} basePath={`/site/${slug}`}>
      <div className="max-w-[900px] mx-auto px-5 sm:px-8 py-14 sm:py-20">
        <div className="text-center mb-10">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] mb-4" style={{ color: brand }}>Membership</p>
          <h1 className="text-4xl sm:text-5xl font-bold leading-[1.05] tracking-[-0.02em]" style={{ color: INK }}>
            No insurance? No problem.
          </h1>
          <p className="text-lg leading-[1.55] mt-3 max-w-[560px] mx-auto" style={{ color: INK_MUTED }}>
            Join the {name} membership plan — your preventive care is covered, plus you save on any other treatment you
            need. No deductibles, no claim forms, no waiting periods.
          </p>
        </div>
        <MembershipJoin slug={slug} brand={brand} plans={plans} />
      </div>
    </BlogChrome>
  )
}
