import { notFound } from 'next/navigation'
import {
  getClinicSiteBySlug,
  publicSiteUrl,
  resolveSiteBasePath,
  appBaseUrl,
} from '@/lib/services/clinic-site'
import { listPublishedPosts } from '@/lib/services/blog'
import { listActivePlans } from '@/lib/services/membership'
import { getOpenJobs } from '@/lib/services/careers'
import { ROLE_LABELS, EMPLOYMENT_LABELS, formatComp } from '@/lib/types/careers'
import { DEFAULT_SERVICES, type ClinicService, type ClinicStaff } from '@/lib/types/clinic-content'
import { CLINIC_THEME } from '@/lib/clinic-site-theme'
import {
  buildClinicNavLinks,
  navServicesFromClinicServices,
} from '@/lib/clinic-site-helpers'
import SiteHeader from '@/components/clinic-site/site-header'
import SiteFooter from '@/components/clinic-site/site-footer'
import SiteMobileActions from '@/components/clinic-site/site-mobile-actions'

const { BG, INK, INK_MUTED, BORDER } = CLINIC_THEME

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) return {}
  const name = data.profile.displayName ?? data.orgName
  const url = `${publicSiteUrl(data)}/careers`
  const title = `Careers — ${name}`
  const description = `Join the team at ${name}. See our open dental positions and apply today.`
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: name, type: 'website' },
    twitter: { card: 'summary', title, description },
  }
}

export default async function ClinicCareersPage({ params }: Props) {
  const { slug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) notFound()

  const basePath = await resolveSiteBasePath(slug)
  const brand = data.profile.brandColor ?? '#9CAF9F'
  const name = data.profile.displayName ?? data.orgName
  const [jobs, publishedPosts, membershipPlans] = await Promise.all([
    getOpenJobs(data.orgId),
    listPublishedPosts(data.orgId, { limit: 1 }),
    listActivePlans(data.orgId),
  ])
  const hasBlog = publishedPosts.length > 0
  const hasDentalPlans = membershipPlans.length > 0
  // Careers nav-dropdown gate is "has open jobs" — by construction this page
  // only renders meaningfully when jobs.length > 0, so reuse that. Team gate
  // mirrors the other call sites: clinic has ≥1 staff entry.
  const hasCareers = jobs.length > 0
  const hasTeam = ((data.profile.staff as ClinicStaff[] | null) ?? []).length > 0
  const cityState = [data.primaryLocation?.city, data.primaryLocation?.state].filter(Boolean).join(', ')

  const isPro = data.profile.planTier === 'pro' || data.profile.planTier === 'premium'
  const bookHref = isPro ? `${basePath}/book` : `${basePath || '/'}#contact`
  const bookLabel = 'Book a Visit'
  const signIn = `${appBaseUrl()}/signin`

  const navLinks = buildClinicNavLinks({
    basePath,
    hasBlog,
    hasDentalPlans,
    hasTeam,
    hasCareers,
    services: navServicesFromClinicServices(
      (data.profile.services as ClinicService[] | null) ?? DEFAULT_SERVICES,
    ),
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
      <SiteHeader
        data={data}
        basePath={basePath}
        navLinks={navLinks}
        bookHref={bookHref}
        bookLabel={bookLabel}
        signInUrl={signIn}
      />

      <main>
        <div className="max-w-[900px] mx-auto px-5 sm:px-8 py-14 sm:py-20">
          <div className="mb-10">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] mb-4" style={{ color: brand }}>
              Careers
            </p>
            <h1 className="text-4xl sm:text-5xl font-bold leading-[1.05] tracking-[-0.02em]" style={{ color: INK }}>
              Join the {name} team
            </h1>
            <p className="text-lg leading-[1.55] mt-3 max-w-[560px]" style={{ color: INK_MUTED }}>
              We&apos;re always looking for kind, talented people who care about patients. Here&apos;s what we&apos;re
              hiring for right now.
            </p>
          </div>

          {jobs.length === 0 ? (
            <div className="rounded-2xl border border-dashed py-16 text-center" style={{ borderColor: BORDER, color: INK_MUTED }}>
              <p className="text-base">No open positions at the moment — check back soon, or reach out to introduce yourself.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {jobs.map((j) => {
                const comp = formatComp(j)
                return (
                  <a
                    key={j.id}
                    href={`${basePath}/careers/${j.slug}`}
                    className="block rounded-2xl border p-5 sm:p-6 transition hover:shadow-sm"
                    style={{ borderColor: BORDER, backgroundColor: '#fff' }}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h2 className="text-xl font-bold tracking-[-0.01em]" style={{ color: INK }}>{j.title}</h2>
                        <p className="text-[14px] mt-1" style={{ color: INK_MUTED }}>
                          {ROLE_LABELS[j.role]} · {EMPLOYMENT_LABELS[j.employmentType]}
                          {comp ? ` · ${comp}` : ''}
                          {cityState ? ` · ${cityState}` : ''}
                        </p>
                      </div>
                      <span
                        className="shrink-0 text-[13px] font-semibold px-4 py-2 rounded-full"
                        style={{ backgroundColor: brand, color: '#fff' }}
                      >
                        View &amp; apply
                      </span>
                    </div>
                  </a>
                )
              })}
            </div>
          )}
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
