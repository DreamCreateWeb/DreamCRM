import { notFound } from 'next/navigation'
import {
  getClinicSiteBySlug,
  publicSiteUrl,
  resolveSiteBasePath,
  appBaseUrl,
} from '@/lib/services/clinic-site'
import { listPublishedPosts } from '@/lib/services/blog'
import { listActivePlans } from '@/lib/services/membership'
import type { ClinicService, ClinicTestimonial } from '@/lib/types/clinic-content'
import { DEFAULT_SERVICES } from '@/lib/types/clinic-content'
import {
  resolveClinicServices,
  type EnrichedService,
} from '@/lib/services/service-library'
import { CLINIC_THEME } from '@/lib/clinic-site-theme'
import { buildClinicNavLinks } from '@/lib/clinic-site-helpers'
import SiteHeader from '@/components/clinic-site/site-header'
import SiteFooter from '@/components/clinic-site/site-footer'
import SiteMobileActions from '@/components/clinic-site/site-mobile-actions'
import TestimonialsCarousel from '@/components/clinic-site/testimonials-carousel'

const { BG, INK, INK_MUTED, SURFACE, BORDER } = CLINIC_THEME

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
    (data.profile.services as ClinicService[] | null) ?? DEFAULT_SERVICES
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
  const [publishedPosts, membershipPlans] = await Promise.all([
    listPublishedPosts(data.orgId, { limit: 1 }),
    listActivePlans(data.orgId),
  ])
  const hasBlog = publishedPosts.length > 0
  const hasDentalPlans = membershipPlans.length > 0

  const { profile } = data
  const brand = profile.brandColor ?? '#9CAF9F'
  const isPro = profile.planTier === 'pro' || profile.planTier === 'premium'
  const bookHref = isPro ? `${basePath}/book` : `${basePath || '/'}#contact`
  const bookLabel = 'Book a Visit'
  const signIn = `${appBaseUrl()}/signin`

  const navLinks = buildClinicNavLinks({
    basePath,
    hasBlog,
    hasDentalPlans,
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

  return (
    <div
      className="min-h-screen antialiased"
      style={{
        backgroundColor: BG,
        color: INK,
        fontFamily: 'var(--font-sans, Inter, sans-serif)',
      }}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceJsonLd) }}
      />
      <SiteHeader
        data={data}
        basePath={basePath}
        navLinks={navLinks}
        bookHref={bookHref}
        bookLabel={bookLabel}
        signInUrl={signIn}
      />

      <main>
      {/* ── Promo ribbon (only when an offer is set) ───────────────────── */}
      {service.offer && (
        <div
          className="text-center text-[13px] sm:text-sm font-semibold text-white py-2.5 px-4"
          style={{ backgroundColor: brand }}
        >
          {service.offer}
        </div>
      )}

      {/* ── Hero — copy left, photo-on-color panel right ───────────────── */}
      <section className="pt-12 pb-14 sm:pt-16 sm:pb-20">
        <div className="max-w-[1240px] mx-auto px-5 sm:px-8">
          <div className="grid lg:grid-cols-12 gap-10 lg:gap-14 items-center">
            <div className="lg:col-span-6">
              <p
                className="text-xs font-semibold uppercase tracking-[0.22em] mb-5"
                style={{ color: INK_MUTED }}
              >
                {categoryLabel}
              </p>
              <h1
                className="text-[36px] sm:text-[48px] lg:text-[56px] font-semibold leading-[1.06] tracking-[-0.015em] mb-6"
                style={{ color: brand, fontFamily: 'var(--font-display, Georgia, serif)' }}
              >
                {service.name} at {name}.
              </h1>
              {service.heroBullets.length > 0 ? (
                <ul className="space-y-3 mb-8">
                  {service.heroBullets.map((b, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <svg
                        className="w-5 h-5 mt-0.5 shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                        style={{ color: brand }}
                        aria-hidden="true"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                      <span className="text-base sm:text-lg leading-[1.5]" style={{ color: INK }}>
                        {b}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                service.description && (
                  <p className="text-base sm:text-lg leading-[1.6] mb-8" style={{ color: INK }}>
                    {service.description}
                  </p>
                )
              )}
              <div className="flex flex-wrap items-center gap-3">
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
              <p className="mt-6 text-sm" style={{ color: INK_MUTED }}>
                Gentle, judgment-free care — we&apos;ll explain everything in plain
                language.
              </p>
            </div>

            {/* Photo-on-color panel — brand-tint panel with the photo on an
                organic asymmetric radius; solid panel when no photo. */}
            <div className="lg:col-span-6">
              <div
                className="relative aspect-[4/3] w-full overflow-hidden"
                style={{
                  backgroundColor: `${brand}1F`,
                  borderRadius: '40% 60% 56% 44% / 48% 42% 58% 52%',
                }}
              >
                {heroImage ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={heroImage}
                    alt={service.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  service.icon && (
                    <div
                      className="w-full h-full flex items-center justify-center text-7xl"
                      aria-hidden="true"
                    >
                      {service.icon}
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {service.hasLibraryContent && (
        <>
          {/* ── Description band ───────────────────────────────────────── */}
          {service.body && (
            <section className="py-16 sm:py-20" style={{ backgroundColor: SURFACE }}>
              <div className="max-w-[820px] mx-auto px-5 sm:px-8 text-center">
                <p
                  className="text-xl sm:text-2xl leading-[1.55] font-medium"
                  style={{ color: INK }}
                >
                  {service.body}
                </p>
              </div>
            </section>
          )}

          {/* ── What to expect — numbered process ──────────────────────── */}
          {service.processSteps.length > 0 && (
            <section className="py-16 sm:py-24">
              <div className="max-w-[1100px] mx-auto px-5 sm:px-8">
                <h2
                  className="text-3xl sm:text-4xl lg:text-[44px] font-semibold leading-[1.1] tracking-[-0.015em] mb-12 sm:mb-16 text-center"
                  style={{ color: brand, fontFamily: 'var(--font-display, Georgia, serif)' }}
                >
                  What to expect.
                </h2>
                <ol className="grid gap-6 sm:gap-7 sm:grid-cols-2">
                  {service.processSteps.map((step, i) => (
                    <li
                      key={i}
                      className="flex gap-5 rounded-2xl p-6 sm:p-7"
                      style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}` }}
                    >
                      <span
                        className="shrink-0 text-3xl sm:text-4xl font-bold leading-none tracking-[-0.02em]"
                        style={{ color: brand, fontFamily: 'var(--font-display, Georgia, serif)' }}
                        aria-hidden="true"
                      >
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <div>
                        <h3 className="text-lg font-semibold mb-2 leading-tight" style={{ color: INK }}>
                          {step.title}
                        </h3>
                        <p className="text-[15px] leading-[1.6]" style={{ color: INK_MUTED }}>
                          {step.body}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </section>
          )}

          {/* ── FAQ ────────────────────────────────────────────────────── */}
          {service.faq.length > 0 && (
            <section className="py-16 sm:py-24" style={{ backgroundColor: SURFACE }}>
              <div className="max-w-[820px] mx-auto px-5 sm:px-8">
                <h2
                  className="text-3xl sm:text-4xl lg:text-[44px] font-semibold leading-[1.1] tracking-[-0.015em] mb-10 sm:mb-12 text-center"
                  style={{ color: brand, fontFamily: 'var(--font-display, Georgia, serif)' }}
                >
                  Have questions about {service.name}?
                </h2>
                <div className="space-y-3">
                  {service.faq.map((item, i) => (
                    <details
                      key={i}
                      className="group rounded-2xl border overflow-hidden transition"
                      style={{ backgroundColor: BG, borderColor: BORDER }}
                    >
                      <summary
                        className="cursor-pointer list-none px-6 py-5 text-base sm:text-lg font-semibold leading-snug flex items-start justify-between gap-4"
                        style={{ color: INK }}
                      >
                        <span>{item.question}</span>
                        <span
                          aria-hidden="true"
                          className="shrink-0 mt-0.5 text-2xl leading-none font-light group-open:hidden"
                          style={{ color: brand }}
                        >
                          +
                        </span>
                        <span
                          aria-hidden="true"
                          className="shrink-0 mt-0.5 text-2xl leading-none font-light hidden group-open:inline"
                          style={{ color: brand }}
                        >
                          −
                        </span>
                      </summary>
                      <div
                        className="px-6 pb-6 -mt-1 text-[15px] sm:text-base leading-[1.65]"
                        style={{ color: INK_MUTED }}
                      >
                        {item.answer}
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            </section>
          )}
        </>
      )}

      {/* ── Testimonials (universal, only when present) ─────────────────── */}
      {testimonials.length > 0 && (
        <section className="py-20 sm:py-28">
          <div className="max-w-[1240px] mx-auto px-5 sm:px-8">
            <div className="max-w-[640px] mb-14">
              <p
                className="text-xs font-semibold uppercase tracking-[0.16em] mb-4"
                style={{ color: brand }}
              >
                In their words
              </p>
              <h2
                className="text-3xl sm:text-4xl lg:text-[48px] font-semibold leading-[1.08] tracking-[-0.015em]"
                style={{ color: brand, fontFamily: 'var(--font-display, Georgia, serif)' }}
              >
                Patients on the experience.
              </h2>
            </div>
            <TestimonialsCarousel testimonials={testimonials} brand={brand} />
          </div>
        </section>
      )}

      {/* ── Related services (only when the clinic offers any) ─────────── */}
      {related.length > 0 && (
        <section className="py-16 sm:py-24" style={{ backgroundColor: SURFACE }}>
          <div className="max-w-[1240px] mx-auto px-5 sm:px-8">
            <h2
              className="text-2xl sm:text-3xl lg:text-[40px] font-semibold leading-[1.1] tracking-[-0.015em] mb-10 sm:mb-12"
              style={{ color: brand, fontFamily: 'var(--font-display, Georgia, serif)' }}
            >
              You might also be interested in.
            </h2>
            <div className="grid gap-5 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((r) => (
                <a
                  key={r.id}
                  href={`${basePath}/services/${r.routingSlug}`}
                  className="flex flex-col group rounded-2xl p-7 transition-transform duration-300 hover:-translate-y-0.5"
                  style={{ backgroundColor: BG, border: `1px solid ${BORDER}` }}
                >
                  {r.icon && (
                    <span aria-hidden="true" className="text-2xl leading-none mb-4">
                      {r.icon}
                    </span>
                  )}
                  <h3 className="text-lg font-semibold mb-2 leading-tight" style={{ color: INK }}>
                    {r.name}
                  </h3>
                  {(r.shortDescription ?? r.description) && (
                    <p className="text-[14px] leading-[1.6] mb-5" style={{ color: INK_MUTED }}>
                      {r.shortDescription ?? r.description}
                    </p>
                  )}
                  <span
                    className="inline-flex items-center gap-1 text-sm font-semibold mt-auto transition group-hover:gap-2"
                    style={{ color: brand }}
                  >
                    Learn more
                    <span aria-hidden="true">→</span>
                  </span>
                </a>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Closing CTA band ───────────────────────────────────────────── */}
      <section className="py-20 sm:py-28" style={{ backgroundColor: brand }}>
        <div className="max-w-[800px] mx-auto px-5 sm:px-8 text-center">
          <h2
            className="text-3xl sm:text-4xl lg:text-[48px] font-semibold leading-[1.08] tracking-[-0.015em] mb-6 text-white"
            style={{ fontFamily: 'var(--font-display, Georgia, serif)' }}
          >
            It&apos;s a pleasure to care for you.
          </h2>
          <p className="text-lg leading-[1.6] mb-9 text-white/90">
            Book your visit and we&apos;ll take it from there — gently, and at your
            pace.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <a
              href={bookHref}
              className="inline-flex items-center px-7 py-3.5 rounded-full text-base font-semibold shadow-md transition hover:shadow-lg hover:opacity-95"
              style={{ backgroundColor: '#FFFFFF', color: INK }}
            >
              {bookLabel}
            </a>
            {profile.phone && (
              <a
                href={`tel:${profile.phone}`}
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full text-base font-medium text-white border border-white/40 transition hover:bg-white/10"
              >
                {profile.phone}
              </a>
            )}
          </div>
        </div>
      </section>

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
