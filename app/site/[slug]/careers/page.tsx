import { notFound } from 'next/navigation'
import { getClinicSiteBySlug, publicSiteUrl, resolveSiteBasePath, clinicPortalSignInUrl } from '@/lib/services/clinic-site'
import { listPublishedPosts } from '@/lib/services/blog'
import { listActivePlans } from '@/lib/services/membership'
import { getOpenJobs } from '@/lib/services/careers'
import { type ClinicService, type ClinicStaff } from '@/lib/types/clinic-content'
import { readableInk } from '@/lib/clinic-site-theme'
import { buildClinicNavLinks, navServicesFromClinicServices, hasColoringPages, isSelfBookingEnabled } from '@/lib/clinic-site-helpers'
import { resolveSeoMeta, applySeoOverride } from '@/lib/types/seo-meta'
import { SITE_BG as BG, SITE_INK as INK } from '@/components/clinic-site/tokens'
import { resolveActiveSiteTemplate } from '@/lib/site-templates/resolve'


interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) return {}
  const name = data.profile.displayName ?? data.orgName
  const url = `${publicSiteUrl(data)}/careers`
  const { title, description } = applySeoOverride(resolveSeoMeta(data.profile.seoMeta).careers, {
    title: `Careers — ${name}`,
    description: `Join the team at ${name}. See our open dental positions and apply today.`,
  })
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
  // Contrast-safe text fill for brand-colored headings/eyebrows on the warm
  // ground (raw brand stays on backgrounds/borders/pills only).
  const headingInk = readableInk(brand)
  const name = data.profile.displayName ?? data.orgName
  const copyOverrides = (data.profile.copyOverrides as Record<string, string> | null) ?? null
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

  const bookHref = isSelfBookingEnabled(data.profile) ? `${basePath}/book` : `${basePath || '/'}#contact`
  const { def: siteTemplate } = await resolveActiveSiteTemplate(slug)
  const bookLabel = siteTemplate.bookLabel
  const { Header: SiteHeader, Footer: SiteFooter, MobileActions: SiteMobileActions } = siteTemplate.chrome
  const signIn = clinicPortalSignInUrl(slug, data.profile.portalSettings)

  const navLinks = buildClinicNavLinks({
    // Template-declared marketing pages (e.g. Pediatric's /coloring), gated
    // inside the builder against the same flags as everything else.
    extraPages: siteTemplate.extraMarketingPages,
    extraGates: {
      hasColoringPages: hasColoringPages(data.profile),
    },
    basePath,
    hasBlog,
    hasDentalPlans,
    hasTeam,
    hasCareers,
    services: navServicesFromClinicServices(
      (data.profile.services as ClinicService[] | null) ?? [],
    ),
  })

  const Body = siteTemplate.pages.subpages.careers
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

      <main id="main-content" tabIndex={-1}>
        <Body headingInk={headingInk} copyOverrides={copyOverrides} name={name} brand={brand} jobs={jobs} basePath={basePath} cityState={cityState} data={data} />
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
