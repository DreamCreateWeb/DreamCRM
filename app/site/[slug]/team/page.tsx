import { notFound } from 'next/navigation'
import { getClinicSiteBySlug, publicSiteUrl, resolveSiteBasePath, clinicPortalSignInUrl } from '@/lib/services/clinic-site'
import { listPublishedPosts } from '@/lib/services/blog'
import { listActivePlans } from '@/lib/services/membership'
import { getOpenJobs } from '@/lib/services/careers'
import type {
  ClinicService,
  ClinicStaff,
} from '@/lib/types/clinic-content'
import { teamItemListJsonLd } from '@/lib/clinic-site-jsonld'
import { firstSentence, staffSlug as resolveStaffSlug, buildClinicNavLinks, navServicesFromClinicServices, hasColoringPages, isSelfBookingEnabled } from '@/lib/clinic-site-helpers'
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
  const url = `${publicSiteUrl(data)}/team`
  const { title, description } = applySeoOverride(resolveSeoMeta(data.profile.seoMeta).team, {
    title: `Our team — ${name}`,
    description: data.profile.about ? firstSentence(data.profile.about) : `Meet the team behind ${name}.`,
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

export default async function TeamPage({ params }: Props) {
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

  const { profile } = data
  const name = profile.displayName ?? data.orgName
  const brand = profile.brandColor ?? '#9CAF9F'
  // Contrast-safe text fill for brand-colored headings/eyebrows on the warm
  // ground (raw brand stays on backgrounds/borders/pills only).
  const headingInk = SITE_HEADING
  const bookHref = isSelfBookingEnabled(profile) ? `${basePath}/book` : `${basePath || '/'}#contact`
  const { def: siteTemplate } = await resolveActiveSiteTemplate(slug)
  const bookLabel = siteTemplate.bookLabel
  const { Header: SiteHeader, Footer: SiteFooter, MobileActions: SiteMobileActions } = siteTemplate.chrome
  const signIn = clinicPortalSignInUrl(slug, data.profile.portalSettings)

  const staff: ClinicStaff[] = (profile.staff as ClinicStaff[] | null) ?? []
  const hasTeam = staff.length > 0
  const copyOverrides = (profile.copyOverrides as Record<string, string> | null) ?? null

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

  // Universal warm intro when the clinic hasn't authored an about paragraph
  // we can pull a first sentence from. Generic enough to fit every practice.
  const heroLead = profile.about
    ? firstSentence(profile.about)
    : `Real people who care about the experience you have at ${name}.`

  // ItemList of Person — the team roster. Only emitted when there's staff.
  const siteUrl = publicSiteUrl(data)
  const teamLd = hasTeam
    ? teamItemListJsonLd(
        staff.map((s) => {
          const sslug = resolveStaffSlug(s)
          return {
            name: s.name,
            jobTitle: s.title ?? null,
            image: s.photoUrl ?? null,
            url: sslug ? `${siteUrl}/team/${sslug}` : null,
          }
        }),
        { name, url: siteUrl },
      )
    : null

  const Body = siteTemplate.pages.subpages.team
  return (
    <div
      className="min-h-screen antialiased"
      style={{
        backgroundColor: BG,
        color: INK,
        fontFamily: 'var(--font-sans, Inter, sans-serif)',
      }}
    >
      {teamLd && (
        <JsonLdScript data={teamLd} />
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
        <Body copyOverrides={copyOverrides} headingInk={headingInk} name={name} heroLead={heroLead} hasTeam={hasTeam} staff={staff} basePath={basePath} brand={brand} bookHref={bookHref} bookLabel={bookLabel} profile={profile} />
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
