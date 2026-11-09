import { notFound } from 'next/navigation'
import { getClinicSiteBySlug, publicSiteUrl, resolveSiteBasePath, clinicPortalSignInUrl } from '@/lib/services/clinic-site'
import { listPublishedPosts } from '@/lib/services/blog'
import { listActivePlans } from '@/lib/services/membership'
import { getOpenJobs } from '@/lib/services/careers'
import type {
  ClinicService,
  ClinicStaff,
  ClinicStat,
  ClinicTestimonial,
  ClinicOfficePhoto,
} from '@/lib/types/clinic-content'
import { readableInk } from '@/lib/clinic-site-theme'
import { aboutOrganizationJsonLd } from '@/lib/clinic-site-jsonld'
import { firstSentence, afterFirstSentence, staffSlug, buildClinicNavLinks, navServicesFromClinicServices, hasColoringPages, isSelfBookingEnabled } from '@/lib/clinic-site-helpers'
import { resolveSeoMeta, applySeoOverride } from '@/lib/types/seo-meta'
import { SITE_BG as BG, SITE_INK as INK } from '@/components/clinic-site/tokens'
import { resolveActiveSiteTemplate } from '@/lib/site-templates/resolve'
import JsonLdScript from '@/components/json-ld'
import { siteOffices } from '@/lib/site-offices'


interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) return {}
  const name = data.profile.displayName ?? data.orgName
  const tagline = data.profile.tagline ?? null
  const url = `${publicSiteUrl(data)}/about`
  const { title, description } = applySeoOverride(resolveSeoMeta(data.profile.seoMeta).about, {
    title: `About — ${name}`,
    description: tagline ?? (data.profile.about ? firstSentence(data.profile.about) : `About ${name}.`),
  })
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: name,
      type: 'website',
      ...(data.profile.heroImageUrl
        ? { images: [{ url: data.profile.heroImageUrl, alt: name }] }
        : {}),
    },
    twitter: {
      card: data.profile.heroImageUrl ? 'summary_large_image' : 'summary',
      title,
      description,
      ...(data.profile.heroImageUrl ? { images: [data.profile.heroImageUrl] } : {}),
    },
    icons: data.profile.logoUrl
      ? { icon: data.profile.logoUrl, apple: data.profile.logoUrl }
      : undefined,
  }
}

export default async function AboutPage({ params }: Props) {
  const { slug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) notFound()

  const basePath = await resolveSiteBasePath(slug)
  const [publishedPosts, membershipPlans, openJobs] = await Promise.all([
    listPublishedPosts(data.orgId, { limit: 1 }),
    listActivePlans(data.orgId),
    getOpenJobs(data.orgId),
  ])
  const hasBlog = publishedPosts.length > 0
  const hasDentalPlans = membershipPlans.length > 0
  const hasCareers = openJobs.length > 0
  const hasTeam = ((data.profile.staff as ClinicStaff[] | null) ?? []).length > 0

  const { profile } = data
  const name = profile.displayName ?? data.orgName
  const brand = profile.brandColor ?? '#9CAF9F'
  // Contrast-safe text fill for brand-colored headings/eyebrows on the warm
  // ground (raw brand stays on backgrounds/borders/pills only).
  const headingInk = readableInk(brand)
  const bookHref = isSelfBookingEnabled(profile) ? `${basePath}/book` : `${basePath || '/'}#contact`
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
      (profile.services as ClinicService[] | null) ?? [],
    ),
  })

  const staff: ClinicStaff[] = (profile.staff as ClinicStaff[] | null) ?? []
  // The hero subhead already shows `firstSentence(about)`; the Story section
  // below shows the REMAINDER so the first line isn't printed twice. When about
  // is a single sentence there's no remainder → the Story section hides.
  const aboutRest = profile.about ? afterFirstSentence(profile.about) : ''
  const stats: ClinicStat[] = ((profile.stats as ClinicStat[] | null) ?? []).slice(0, 4)
  const testimonials: ClinicTestimonial[] =
    ((profile.testimonials as ClinicTestimonial[] | null) ?? []).slice(0, 50)
  const officePhotos: ClinicOfficePhoto[] =
    ((profile.officePhotos as ClinicOfficePhoto[] | null) ?? []).slice(0, 8)
  const copyOverrides = (profile.copyOverrides as Record<string, string> | null) ?? null
  const mapOffice = siteOffices(data)[0] ?? null

  // Dentist/Organization JSON-LD enumerating the team as Person members — the
  // About-page variant of the homepage's primary Dentist node. Staff URLs deep-
  // link to their /team/[slug] detail pages.
  const siteUrl = publicSiteUrl(data)
  const aboutLd = aboutOrganizationJsonLd(
    {
      name,
      url: siteUrl,
      description: profile.about ?? profile.tagline ?? null,
      logo: profile.logoUrl ?? null,
    },
    staff.map((s) => {
      const sslug = staffSlug(s)
      return {
        name: s.name,
        jobTitle: s.title ?? null,
        url: sslug ? `${siteUrl}/team/${sslug}` : null,
      }
    }),
  )

  const Body = siteTemplate.pages.subpages.about
  return (
    <div
      className="min-h-screen antialiased"
      style={{
        backgroundColor: BG,
        color: INK,
        fontFamily: 'var(--font-sans, Inter, sans-serif)',
      }}
    >
      <JsonLdScript data={aboutLd} />
      <SiteHeader
        data={data}
        basePath={basePath}
        navLinks={navLinks}
        bookHref={bookHref}
        bookLabel={bookLabel}
        signInUrl={signIn}
      />

      <main id="main-content" tabIndex={-1}>
        <Body copyOverrides={copyOverrides} name={name} headingInk={headingInk} profile={profile} bookHref={bookHref} brand={brand} bookLabel={bookLabel} aboutRest={aboutRest} stats={stats} staff={staff} officePhotos={officePhotos} testimonials={testimonials} mapOffice={mapOffice} data={data} />
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
