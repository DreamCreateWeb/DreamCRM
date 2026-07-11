import { notFound } from 'next/navigation'
import {
  getClinicSiteBySlug,
  publicSiteUrl,
  resolveSiteBasePath,
  clinicPortalSignInUrl,
} from '@/lib/services/clinic-site'
import { listPublishedPosts } from '@/lib/services/blog'
import { listActivePlans } from '@/lib/services/membership'
import { getOpenJobs } from '@/lib/services/careers'
import type { ClinicColoringPage, ClinicService, ClinicStaff } from '@/lib/types/clinic-content'
import {
  buildClinicNavLinks,
  navServicesFromClinicServices,
  hasColoringPages,
} from '@/lib/clinic-site-helpers'
import { resolveActiveSiteTemplate } from '@/lib/site-templates/resolve'
import ColoringGallery from './coloring-gallery'
import { SITE_BG as BG, SITE_INK as INK, SITE_INK_MUTED as INK_MUTED } from '@/components/clinic-site/tokens'

interface Props {
  params: Promise<{ slug: string }>
}

/**
 * The kids' coloring corner — staff-uploaded line art kids can print or color
 * right in the browser (see coloring-gallery.tsx). CANON content: the page
 * exists for any clinic that has uploaded pages, whatever their template;
 * templates decide whether to surface it in NAV (the Pediatric template
 * declares it as a marketing page). No content → notFound, and no template
 * ever links here in that state (the extras gate is `hasColoringPages`).
 */
export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) return {}
  const name = data.profile.displayName ?? data.orgName
  const url = `${publicSiteUrl(data)}/coloring`
  const title = `Coloring pages — ${name}`
  const description = `Free printable + color-online sheets for kids, from ${name}.`
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: name, type: 'website' },
    icons: data.profile.logoUrl
      ? { icon: data.profile.logoUrl, apple: data.profile.logoUrl }
      : undefined,
  }
}

export default async function ColoringPage({ params }: Props) {
  const { slug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) notFound()

  const pages = ((data.profile.coloringPages as ClinicColoringPage[] | null) ?? []).filter(
    (p) => p?.imageUrl,
  )
  if (pages.length === 0) notFound()

  const basePath = await resolveSiteBasePath(slug)
  const [publishedPosts, membershipPlans, openJobs] = await Promise.all([
    listPublishedPosts(data.orgId, { limit: 1 }),
    listActivePlans(data.orgId),
    getOpenJobs(data.orgId),
  ])
  const { profile } = data
  const isPro = profile.planTier === 'pro' || profile.planTier === 'premium'
  const bookHref = isPro ? `${basePath}/book` : `${basePath || '/'}#contact`
  const { def: siteTemplate } = await resolveActiveSiteTemplate(slug)
  const bookLabel = siteTemplate.bookLabel
  const { Header: SiteHeader, Footer: SiteFooter, MobileActions: SiteMobileActions } =
    siteTemplate.chrome
  const signIn = clinicPortalSignInUrl(slug)

  const navLinks = buildClinicNavLinks({
    extraPages: siteTemplate.extraMarketingPages,
    extraGates: { isPro, hasColoringPages: hasColoringPages(profile) },
    basePath,
    hasBlog: publishedPosts.length > 0,
    hasDentalPlans: membershipPlans.length > 0,
    hasTeam: ((profile.staff as ClinicStaff[] | null) ?? []).length > 0,
    hasCareers: openJobs.length > 0,
    services: navServicesFromClinicServices((profile.services as ClinicService[] | null) ?? []),
  })

  return (
    <div style={{ background: BG, color: INK }} className="min-h-screen flex flex-col">
      <SiteHeader
        data={data}
        basePath={basePath}
        navLinks={navLinks}
        bookHref={bookHref}
        bookLabel={bookLabel}
        signInUrl={signIn}
      />
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <h1 className="text-3xl sm:text-5xl font-bold mb-3" style={{ fontFamily: 'var(--font-display, Georgia, serif)' }}>
          🖍️ Coloring corner
        </h1>
        <p className="text-base sm:text-lg max-w-2xl mb-10" style={{ color: INK_MUTED }}>
          Pick a page, then color it right here — or print it out for the fridge. Made with love
          by the team at {profile.displayName ?? data.orgName}.
        </p>
        <ColoringGallery pages={pages} />
      </main>
      <SiteFooter
        data={data}
        basePath={basePath}
        navLinks={navLinks}
        bookHref={bookHref}
        bookLabel={bookLabel}
        signInUrl={signIn}
      />
      <SiteMobileActions data={data} basePath={basePath} bookHref={bookHref} bookLabel={bookLabel} />
    </div>
  )
}
