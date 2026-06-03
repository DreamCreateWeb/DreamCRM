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
import type { ClinicService, ClinicStaff } from '@/lib/types/clinic-content'
import { DEFAULT_SERVICES } from '@/lib/types/clinic-content'
import {
  resolveClinicServices,
  groupByCategory,
  type EnrichedService,
} from '@/lib/services/service-library'
import { CLINIC_THEME } from '@/lib/clinic-site-theme'
import { buildClinicNavLinks } from '@/lib/clinic-site-helpers'
import SiteHeader from '@/components/clinic-site/site-header'
import SiteFooter from '@/components/clinic-site/site-footer'
import SiteMobileActions from '@/components/clinic-site/site-mobile-actions'
import ScrollReveal from '@/components/clinic-site/scroll-reveal'
import ClosingCTA from '@/components/clinic-site/closing-cta'

const { BG, INK, INK_MUTED, SURFACE, BORDER } = CLINIC_THEME

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) return {}
  const name = data.profile.displayName ?? data.orgName
  const url = `${publicSiteUrl(data)}/services`
  const title = `Services — ${name}`
  const description = `Dental services at ${name}.`
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
  const brand = profile.brandColor ?? '#9CAF9F'
  const isPro = profile.planTier === 'pro' || profile.planTier === 'premium'
  // Per-card Book CTA: pro+ goes to the slot picker; basic routes back to the
  // homepage's #contact anchor since there is no /services#contact section.
  const bookHref = isPro ? `${basePath}/book` : `${basePath || '/'}#contact`
  const bookLabel = 'Book a Visit'
  const signIn = `${appBaseUrl()}/signin`

  // Resolve the clinic's services into library-enriched rows, then split by
  // category. Show ALL configured services on the index — no 6-cap (the
  // homepage caps for layout; the index is the full catalog).
  const rawServices: ClinicService[] =
    (profile.services as ClinicService[] | null) ?? DEFAULT_SERVICES
  const resolved = await resolveClinicServices(rawServices, {
    clinicName: name,
    city: profile.city,
  })
  const { core, special } = groupByCategory(resolved)

  const navLinks = buildClinicNavLinks({
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
      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="pt-10 pb-12 sm:pt-20 sm:pb-20">
        <div className="max-w-[800px] mx-auto px-5 sm:px-8 text-center">
          <p
            className="text-xs font-semibold uppercase tracking-[0.22em] mb-5"
            style={{ color: INK_MUTED }}
          >
            What we do
          </p>
          <h1
            className="text-[32px] sm:text-[48px] lg:text-[64px] font-semibold leading-[1.05] tracking-[-0.015em] mb-6"
            style={{ color: brand, fontFamily: 'var(--font-display, Georgia, serif)' }}
          >
            Dental services at {name}.
          </h1>
          <p
            className="text-base sm:text-lg leading-[1.6] mb-9"
            style={{ color: INK }}
          >
            Comprehensive care, gently delivered — from routine cleanings to
            cosmetic work and same-day fixes.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <a
              href={bookHref}
              className="inline-flex items-center px-7 py-3.5 rounded-full text-base font-semibold text-white shadow-md transition hover:shadow-lg hover:opacity-95"
              style={{ backgroundColor: brand }}
            >
              {bookLabel}
            </a>
            {profile.phone && (
              <a
                href={`tel:${profile.phone}`}
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full text-base font-medium border bg-white transition hover:shadow-sm"
                style={{ color: INK, borderColor: BORDER }}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} style={{ color: brand }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                </svg>
                {profile.phone}
              </a>
            )}
          </div>
        </div>
      </section>

      {/* ── Core services ──────────────────────────────────────────────── */}
      <section
        className="pb-16 sm:pb-20"
        style={{ backgroundColor: SURFACE }}
        data-edit-field="services"
        data-edit-kind="modal"
        data-edit-label="services"
      >
        <div className="max-w-[1240px] mx-auto px-5 sm:px-8 pt-20 sm:pt-24">
          <ScrollReveal>
            <h2
              className="text-3xl sm:text-4xl lg:text-[48px] font-semibold leading-[1.08] tracking-[-0.015em] mb-10 sm:mb-14"
              style={{ color: brand, fontFamily: 'var(--font-display, Georgia, serif)' }}
            >
              Core services.
            </h2>
          </ScrollReveal>
          <ServiceGrid
            services={core}
            basePath={basePath}
            brand={brand}
            bookHref={bookHref}
            bookLabel={bookLabel}
          />
        </div>

        {/* ── Special services (only when any) ─────────────────────────── */}
        {special.length > 0 && (
          <div className="max-w-[1240px] mx-auto px-5 sm:px-8 pt-16 sm:pt-20">
            <ScrollReveal>
              <h2
                className="text-3xl sm:text-4xl lg:text-[48px] font-semibold leading-[1.08] tracking-[-0.015em] mb-10 sm:mb-14"
                style={{ color: brand, fontFamily: 'var(--font-display, Georgia, serif)' }}
              >
                Special services.
              </h2>
            </ScrollReveal>
            <ServiceGrid
              services={special}
              basePath={basePath}
              brand={brand}
              bookHref={bookHref}
              bookLabel={bookLabel}
            />
          </div>
        )}
      </section>

      <ClosingCTA
        heading="Not sure which one you need?"
        subhead="Book a visit and we’ll figure it out together — no judgment, no pressure."
        primary={{ label: bookLabel, href: bookHref }}
        secondary={
          profile.phone
            ? { label: profile.phone, href: `tel:${profile.phone}` }
            : undefined
        }
        brand={brand}
      />

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

/** A responsive grid of service cards — icon + name + one-liner + "Learn more"
 *  (links to the detail page) + a tier-aware Book CTA. Cards link to
 *  `/services/<routingSlug>`. */
function ServiceGrid({
  services,
  basePath,
  brand,
  bookHref,
  bookLabel,
}: {
  services: EnrichedService[]
  basePath: string
  brand: string
  bookHref: string
  bookLabel: string
}) {
  return (
    <div className="grid gap-5 sm:gap-6 lg:gap-7 sm:grid-cols-2 lg:grid-cols-3">
      {services.map((s, i) => {
        const detailHref = `${basePath}/services/${s.routingSlug}`
        const oneLiner = s.shortDescription ?? s.description ?? null
        return (
          <ScrollReveal as="div" key={s.id} delay={(i % 3) * 90}>
            <div
              className="flex flex-col group rounded-2xl p-7 sm:p-8 h-full transition-all duration-300 hover:-translate-y-1 hover:shadow-md"
              style={{ backgroundColor: BG, border: `1px solid ${BORDER}` }}
            >
              <div className="flex items-center gap-3 mb-4">
                {s.icon && (
                  <span aria-hidden="true" className="text-2xl leading-none">
                    {s.icon}
                  </span>
                )}
                <span
                  className="text-xs font-semibold tracking-[0.18em] uppercase"
                  style={{ color: INK_MUTED, fontFamily: 'var(--font-display, Georgia, serif)' }}
                  aria-hidden="true"
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                {s.offer && (
                  <span
                    className="ml-auto inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold text-white"
                    style={{ backgroundColor: brand }}
                  >
                    {s.offer}
                  </span>
                )}
              </div>
              <h3
                className="text-xl font-semibold mb-3 leading-tight"
                style={{ color: INK, fontFamily: 'var(--font-display, Georgia, serif)' }}
              >
                <a href={detailHref} className="transition group-hover:opacity-80">
                  {s.name}
                </a>
              </h3>
              {oneLiner && (
                <p className="text-[15px] leading-[1.6] mb-6" style={{ color: INK_MUTED }}>
                  {oneLiner}
                </p>
              )}
              <div className="mt-auto flex flex-wrap items-center gap-3">
                <a
                  href={detailHref}
                  className="inline-flex items-center gap-1 text-sm font-semibold transition-all duration-300 group-hover:gap-2.5"
                  style={{ color: brand }}
                >
                  Learn more
                  <span aria-hidden="true">→</span>
                </a>
                <a
                  href={bookHref}
                  className="inline-flex items-center px-5 py-2.5 rounded-full text-sm font-semibold border transition hover:shadow-sm hover:scale-[1.02]"
                  style={{ color: brand, borderColor: brand }}
                >
                  {bookLabel}
                </a>
              </div>
            </div>
          </ScrollReveal>
        )
      })}
    </div>
  )
}
