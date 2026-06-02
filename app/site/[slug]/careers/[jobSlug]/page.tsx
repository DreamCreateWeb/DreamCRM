import { notFound } from 'next/navigation'
import {
  getClinicSiteBySlug,
  publicSiteUrl,
  resolveSiteBasePath,
  appBaseUrl,
} from '@/lib/services/clinic-site'
import { listPublishedPosts } from '@/lib/services/blog'
import { listActivePlans } from '@/lib/services/membership'
import { getOpenJobBySlug } from '@/lib/services/careers'
import { ROLE_LABELS, EMPLOYMENT_LABELS, formatComp, jobPostingJsonLd } from '@/lib/types/careers'
import { DEFAULT_SERVICES, type ClinicService } from '@/lib/types/clinic-content'
import { CLINIC_THEME } from '@/lib/clinic-site-theme'
import {
  buildClinicNavLinks,
  navServicesFromClinicServices,
} from '@/lib/clinic-site-helpers'
import SiteHeader from '@/components/clinic-site/site-header'
import SiteFooter from '@/components/clinic-site/site-footer'
import SiteMobileActions from '@/components/clinic-site/site-mobile-actions'
import ApplyForm from '../apply-form'

const { BG, INK, INK_MUTED, BORDER } = CLINIC_THEME

interface Props {
  params: Promise<{ slug: string; jobSlug: string }>
}

export async function generateMetadata({ params }: Props) {
  const { slug, jobSlug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) return {}
  const job = await getOpenJobBySlug(data.orgId, jobSlug)
  if (!job) return {}
  const name = data.profile.displayName ?? data.orgName
  const url = `${publicSiteUrl(data)}/careers/${job.slug}`
  const title = `${job.title} — ${name}`
  const description = job.description.slice(0, 180)
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: name, type: 'website' },
    twitter: { card: 'summary', title, description },
  }
}

function Section({ title, body }: { title: string; body: string | null }) {
  if (!body) return null
  return (
    <div className="mt-7">
      <h2 className="text-lg font-bold mb-2" style={{ color: INK }}>{title}</h2>
      <p className="text-[16px] leading-[1.6] whitespace-pre-wrap" style={{ color: INK_MUTED }}>{body}</p>
    </div>
  )
}

export default async function ClinicJobDetailPage({ params }: Props) {
  const { slug, jobSlug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) notFound()
  const job = await getOpenJobBySlug(data.orgId, jobSlug)
  if (!job) notFound()

  const basePath = await resolveSiteBasePath(slug)
  const brand = data.profile.brandColor ?? '#9CAF9F'
  const name = data.profile.displayName ?? data.orgName
  const comp = formatComp(job)
  const loc = data.primaryLocation
  const cityState = [loc?.city, loc?.state].filter(Boolean).join(', ')
  const [publishedPosts, membershipPlans] = await Promise.all([
    listPublishedPosts(data.orgId, { limit: 1 }),
    listActivePlans(data.orgId),
  ])
  const hasBlog = publishedPosts.length > 0
  const hasDentalPlans = membershipPlans.length > 0

  const isPro = data.profile.planTier === 'pro' || data.profile.planTier === 'premium'
  const bookHref = isPro ? `${basePath}/book` : `${basePath || '/'}#contact`
  const bookLabel = 'Book a Visit'
  const signIn = `${appBaseUrl()}/signin`

  const navLinks = buildClinicNavLinks({
    basePath,
    hasBlog,
    hasDentalPlans,
    services: navServicesFromClinicServices(
      (data.profile.services as ClinicService[] | null) ?? DEFAULT_SERVICES,
    ),
  })

  const jsonLd = jobPostingJsonLd(job, {
    orgName: name,
    jobUrl: `${publicSiteUrl(data)}/careers/${job.slug}`,
    datePosted: job.postedAt ?? job.createdAt,
    location: loc
      ? {
          streetAddress: loc.addressLine1 ?? undefined,
          addressLocality: loc.city ?? undefined,
          addressRegion: loc.state ?? undefined,
          postalCode: loc.postalCode ?? undefined,
        }
      : null,
  })

  return (
    <div
      className="min-h-screen antialiased"
      style={{
        backgroundColor: BG,
        color: INK,
        fontFamily: 'var(--font-sans, Inter, sans-serif)',
      }}
    >
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SiteHeader
        data={data}
        basePath={basePath}
        navLinks={navLinks}
        bookHref={bookHref}
        bookLabel={bookLabel}
        signInUrl={signIn}
      />

      <main>
        <div className="max-w-[760px] mx-auto px-5 sm:px-8 py-14 sm:py-20">
          <a href={`${basePath}/careers`} className="text-[14px] font-medium" style={{ color: brand }}>
            ← All openings
          </a>
          <h1 className="text-4xl sm:text-5xl font-bold leading-[1.05] tracking-[-0.02em] mt-4" style={{ color: INK }}>
            {job.title}
          </h1>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 text-[15px]" style={{ color: INK_MUTED }}>
            <span>{ROLE_LABELS[job.role]}</span>
            <span>·</span>
            <span>{EMPLOYMENT_LABELS[job.employmentType]}</span>
            {comp && (<><span>·</span><span className="font-semibold" style={{ color: INK }}>{comp}</span></>)}
            {cityState && (<><span>·</span><span>{cityState}</span></>)}
          </div>

          <div className="mt-7">
            <p className="text-[16px] leading-[1.6] whitespace-pre-wrap" style={{ color: INK_MUTED }}>{job.description}</p>
          </div>
          <Section title="Responsibilities" body={job.responsibilities} />
          <Section title="Requirements" body={job.requirements} />
          <Section title="Benefits & perks" body={job.benefits} />

          {/* Apply */}
          <div className="mt-12 pt-8 border-t" style={{ borderColor: BORDER }}>
            <h2 className="text-2xl font-bold mb-5" style={{ color: INK }}>Apply</h2>
            {job.applyMethod === 'external' && job.externalApplyUrl ? (
              <a
                href={job.externalApplyUrl}
                target="_blank"
                rel="noopener"
                className="inline-block text-[15px] font-semibold px-6 py-3 rounded-xl text-white"
                style={{ backgroundColor: brand }}
              >
                Apply now →
              </a>
            ) : (
              <ApplyForm orgId={data.orgId} jobPostingId={job.id} brand={brand} />
            )}
          </div>
        </div>
      </main>

      <SiteFooter
        data={data}
        basePath={basePath}
        navLinks={navLinks}
        bookHref={bookHref}
        bookLabel={bookLabel}
        signInUrl={signIn}
      />

      <SiteMobileActions
        data={data}
        basePath={basePath}
        bookHref={bookHref}
        bookLabel={bookLabel}
      />
    </div>
  )
}
