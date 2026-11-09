import { notFound } from 'next/navigation'
import { getClinicSiteBySlug, publicSiteUrl, resolveSiteBasePath, clinicPortalSignInUrl } from '@/lib/services/clinic-site'
import { listPublishedPosts } from '@/lib/services/blog'
import { listActivePlans } from '@/lib/services/membership'
import { getOpenJobs } from '@/lib/services/careers'
import type { ClinicService, ClinicStaff } from '@/lib/types/clinic-content'
import { resolveClinicServices, groupByCategory } from '@/lib/services/service-library'
import { servicesItemListJsonLd } from '@/lib/clinic-site-jsonld'
import { buildClinicNavLinks, hasColoringPages,
  isSelfBookingEnabled,
  copyOverride,
} from '@/lib/clinic-site-helpers'
import { resolveSeoMeta, applySeoOverride } from '@/lib/types/seo-meta'
import { SITE_BG as BG, SITE_INK as INK, SITE_HEADING } from '@/components/clinic-site/tokens'
import { resolveActiveSiteTemplate } from '@/lib/site-templates/resolve'
import JsonLdScript from '@/components/json-ld'


interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) return {}
  const name = data.profile.displayName ?? data.orgName
  const url = `${publicSiteUrl(data)}/services`
  const overrides = (data.profile.copyOverrides as Record<string, string> | null) ?? null
  const { title, description } = applySeoOverride(resolveSeoMeta(data.profile.seoMeta).services, {
    title: `Services — ${name}`,
    description: copyOverride(overrides, 'services.heading', `Dental services at ${name}.`),
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

export default async function ServicesPage({ params }: Props) {
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
  const overrides = (data.profile.copyOverrides as Record<string, string> | null) ?? null
  const copy = (key: string, fallback: string) => copyOverride(overrides, key, fallback)
  const brand = profile.brandColor ?? '#9CAF9F'
  // Contrast-safe text fill for brand-colored headings/links on the warm
  // ground (raw brand stays on backgrounds/borders/pills only).
  const headingInk = SITE_HEADING
  // Per-card Book CTA: pro+ goes to the slot picker; basic routes back to the
  // homepage's #contact anchor since there is no /services#contact section.
  const bookHref = isSelfBookingEnabled(profile) ? `${basePath}/book` : `${basePath || '/'}#contact`
  const { def: siteTemplate } = await resolveActiveSiteTemplate(slug)
  const bookLabel = siteTemplate.bookLabel
  const { Header: SiteHeader, Footer: SiteFooter, MobileActions: SiteMobileActions } = siteTemplate.chrome
  const signIn = clinicPortalSignInUrl(slug, data.profile.portalSettings)

  // Resolve the clinic's services into library-enriched rows, then split by
  // category. Show ALL configured services on the index — no 6-cap (the
  // homepage caps for layout; the index is the full catalog).
  const rawServices: ClinicService[] =
    (profile.services as ClinicService[] | null) ?? []
  const resolved = await resolveClinicServices(rawServices, {
    clinicName: name,
    city: profile.city,
  })
  const { core, special } = groupByCategory(resolved)

  // ItemList of MedicalProcedure for the services index — lets search engines
  // surface the catalog as a carousel. Only emitted when the clinic actually
  // has services (no empty list).
  const siteUrl = publicSiteUrl(data)
  const servicesLd =
    resolved.length > 0
      ? servicesItemListJsonLd(
          resolved.map((s) => ({
            name: s.name,
            description: s.shortDescription ?? s.description ?? null,
            url: `${siteUrl}/services/${s.routingSlug}`,
          })),
          name,
          siteUrl,
        )
      : null

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

  const Body = siteTemplate.pages.subpages.services
  return (
    <div
      className="min-h-screen antialiased"
      style={{
        backgroundColor: BG,
        color: INK,
        fontFamily: 'var(--font-sans, Inter, sans-serif)',
      }}
    >
      {servicesLd && (
        <JsonLdScript data={servicesLd} />
      )}
      <SiteHeader
        data={data}
        basePath={basePath}
        navLinks={navLinks}
        bookHref={bookHref}
        bookLabel={bookLabel}
        signInUrl={signIn}
      />

      <main id="main-content" tabIndex={-1}>
        <Body copy={copy} headingInk={headingInk} name={name} bookHref={bookHref} brand={brand} bookLabel={bookLabel} profile={profile} resolved={resolved} core={core} basePath={basePath} special={special} />
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
