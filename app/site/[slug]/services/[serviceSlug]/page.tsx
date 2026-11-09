import { notFound } from 'next/navigation'
import { getClinicSiteBySlug, publicSiteUrl, resolveSiteBasePath, clinicPortalSignInUrl } from '@/lib/services/clinic-site'
import { listPublishedPosts } from '@/lib/services/blog'
import { listActivePlans } from '@/lib/services/membership'
import { getOpenJobs } from '@/lib/services/careers'
import type { ClinicService, ClinicStaff, ClinicTestimonial } from '@/lib/types/clinic-content'
import {
  resolveClinicServices,
  type EnrichedService,
} from '@/lib/services/service-library'
import { breadcrumbJsonLd } from '@/lib/clinic-site-jsonld'
import { buildClinicNavLinks, hasColoringPages,
  isSelfBookingEnabled,
} from '@/lib/clinic-site-helpers'
import { SITE_BG as BG, SITE_INK as INK, SITE_HEADING } from '@/components/clinic-site/tokens'
import { resolveActiveSiteTemplate } from '@/lib/site-templates/resolve'
import JsonLdScript from '@/components/json-ld'


interface Props {
  params: Promise<{ slug: string; serviceSlug: string }>
}

// Shared loader — resolve the clinic's services and find the one whose routing
// slug matches the URL segment. Used by both generateMetadata + the page so we
// don't resolve twice with divergent logic.
async function loadServiceContext(slug: string, serviceSlug: string) {
  const data = await getClinicSiteBySlug(slug)
  if (!data) return null
  const name = data.profile.displayName ?? data.orgName
  const rawServices: ClinicService[] =
    (data.profile.services as ClinicService[] | null) ?? []
  const resolved = await resolveClinicServices(rawServices, {
    clinicName: name,
    city: data.profile.city,
  })
  const service = resolved.find((s) => s.routingSlug === serviceSlug) ?? null
  return { data, name, resolved, service }
}

export async function generateMetadata({ params }: Props) {
  const { slug, serviceSlug } = await params
  const ctx = await loadServiceContext(slug, serviceSlug)
  if (!ctx || !ctx.service) return {}
  const { data, name, service } = ctx
  const title = `${service.name} at ${name}`
  const description =
    service.shortDescription ??
    service.description ??
    `${service.name} at ${name}.`
  const url = `${publicSiteUrl(data)}/services/${serviceSlug}`
  const image = service.photoUrl ?? data.profile.heroImageUrl ?? null
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
      ...(image ? { images: [{ url: image, alt: service.name }] } : {}),
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
    icons: data.profile.logoUrl
      ? { icon: data.profile.logoUrl, apple: data.profile.logoUrl }
      : undefined,
  }
}

export default async function ServiceDetailPage({ params }: Props) {
  const { slug, serviceSlug } = await params
  const ctx = await loadServiceContext(slug, serviceSlug)
  if (!ctx || !ctx.service) notFound()
  const { data, name, resolved, service } = ctx

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
  const brand = profile.brandColor ?? '#9CAF9F'
  // Contrast-safe text fill for brand-colored headings/eyebrows on the warm
  // ground (raw brand stays on backgrounds/borders/pills only).
  const headingInk = SITE_HEADING
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
    services: resolved.map((s) => ({
      name: s.name,
      routingSlug: s.routingSlug,
      category: s.category,
    })),
  })

  const testimonials: ClinicTestimonial[] =
    ((profile.testimonials as ClinicTestimonial[] | null) ?? []).slice(0, 50)

  // Related services = the curated relatedSlugs that THIS clinic also offers.
  // Match on library slug (the related list is library-keyed). Skip any the
  // clinic doesn't carry, dedupe, cap at 3.
  const offeredByLibrarySlug = new Map(
    resolved.filter((s) => s.librarySlug).map((s) => [s.librarySlug as string, s]),
  )
  const related: EnrichedService[] = service.relatedSlugs
    .map((rs) => offeredByLibrarySlug.get(rs))
    .filter((s): s is EnrichedService => Boolean(s) && s!.routingSlug !== service.routingSlug)
    .slice(0, 3)

  const heroImage = service.photoUrl ?? profile.heroImageUrl ?? null
  const categoryLabel = service.category === 'special' ? 'Special service' : 'Core service'

  // Service / MedicalProcedure JSON-LD — describes the procedure + its provider
  // (the clinic). Rendered into the initial HTML for rich results.
  const serviceJsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'MedicalProcedure',
    name: service.name,
    ...(service.shortDescription || service.body
      ? { description: service.shortDescription ?? service.body }
      : {}),
    url: `${publicSiteUrl(data)}/services/${serviceSlug}`,
    provider: {
      '@type': 'Dentist',
      name,
      url: publicSiteUrl(data),
      ...(profile.phone ? { telephone: profile.phone } : {}),
    },
  }

  // BreadcrumbList: Home › Services › {service name}.
  const siteUrl = publicSiteUrl(data)
  const breadcrumbLd = breadcrumbJsonLd([
    { name: 'Home', url: siteUrl },
    { name: 'Services', url: `${siteUrl}/services` },
    { name: service.name },
  ])

  const Body = siteTemplate.pages.subpages.servicePage
  return (
    <div
      className="min-h-screen antialiased"
      style={{
        backgroundColor: BG,
        color: INK,
        fontFamily: 'var(--font-sans, Inter, sans-serif)',
      }}
    >
      <JsonLdScript data={serviceJsonLd} />
      <JsonLdScript data={breadcrumbLd} />
      <SiteHeader
        data={data}
        basePath={basePath}
        navLinks={navLinks}
        bookHref={bookHref}
        bookLabel={bookLabel}
        signInUrl={signIn}
      />

      <main id="main-content" tabIndex={-1}>
        <Body service={service} brand={brand} categoryLabel={categoryLabel} headingInk={headingInk} name={name} bookHref={bookHref} bookLabel={bookLabel} profile={profile} heroImage={heroImage} testimonials={testimonials} related={related} basePath={basePath} />
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
