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
import type {
  ClinicService,
  ClinicStaff,
  ClinicStat,
  ClinicTestimonial,
  ClinicOfficePhoto,
} from '@/lib/types/clinic-content'
import { DEFAULT_SERVICES } from '@/lib/types/clinic-content'
import { CLINIC_THEME } from '@/lib/clinic-site-theme'
import {
  firstSentence,
  staffInitials,
  buildClinicNavLinks,
  navServicesFromClinicServices,
} from '@/lib/clinic-site-helpers'
import SiteHeader from '@/components/clinic-site/site-header'
import SiteFooter from '@/components/clinic-site/site-footer'
import SiteMobileActions from '@/components/clinic-site/site-mobile-actions'
import TestimonialsCarousel from '@/components/clinic-site/testimonials-carousel'

const { BG, INK, INK_MUTED, SURFACE, BORDER } = CLINIC_THEME

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) return {}
  const name = data.profile.displayName ?? data.orgName
  const tagline = data.profile.tagline ?? null
  const description =
    tagline ??
    (data.profile.about ? firstSentence(data.profile.about) : `About ${name}.`)
  const url = `${publicSiteUrl(data)}/about`
  const title = `About — ${name}`
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
  const isPro = profile.planTier === 'pro' || profile.planTier === 'premium'
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
      (profile.services as ClinicService[] | null) ?? DEFAULT_SERVICES,
    ),
  })

  const staff: ClinicStaff[] = (profile.staff as ClinicStaff[] | null) ?? []
  const stats: ClinicStat[] = ((profile.stats as ClinicStat[] | null) ?? []).slice(0, 4)
  const testimonials: ClinicTestimonial[] =
    ((profile.testimonials as ClinicTestimonial[] | null) ?? []).slice(0, 50)
  const officePhotos: ClinicOfficePhoto[] =
    ((profile.officePhotos as ClinicOfficePhoto[] | null) ?? []).slice(0, 8)

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
      <section className="pt-14 pb-16 sm:pt-20 sm:pb-20">
        <div className="max-w-[800px] mx-auto px-5 sm:px-8 text-center">
          <p
            className="text-xs font-semibold uppercase tracking-[0.22em] mb-5"
            style={{ color: INK_MUTED }}
          >
            About {name}
          </p>
          <h1
            className="text-[40px] sm:text-[56px] lg:text-[64px] font-semibold leading-[1.05] tracking-[-0.015em] mb-6"
            style={{ color: brand, fontFamily: 'var(--font-display, Georgia, serif)' }}
          >
            {profile.tagline ?? `Get to know ${name}.`}
          </h1>
          {profile.about && (
            <p
              className="text-base sm:text-lg leading-[1.6] mb-9"
              style={{ color: INK }}
            >
              {firstSentence(profile.about)}
            </p>
          )}
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

      {/* ── Story ──────────────────────────────────────────────────────── */}
      {profile.about && (
        <section className="py-20 sm:py-28" style={{ backgroundColor: SURFACE }}>
          <div className="max-w-[1240px] mx-auto px-5 sm:px-8">
            <div className="grid lg:grid-cols-12 gap-10 lg:gap-16 items-start">
              <div className="lg:col-span-4">
                <p
                  className="text-xs font-semibold uppercase tracking-[0.16em]"
                  style={{ color: brand }}
                >
                  Our story
                </p>
              </div>
              <div className="lg:col-span-8">
                <p
                  className="text-xl sm:text-2xl leading-[1.55] whitespace-pre-wrap font-medium"
                  style={{ color: INK }}
                >
                  {profile.about}
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Stats anchors ──────────────────────────────────────────────── */}
      {stats.length > 0 && (
        <section className="py-20 sm:py-24">
          <div className="max-w-[1100px] mx-auto px-5 sm:px-8">
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                backgroundColor: SURFACE,
                border: `1px solid ${BORDER}`,
                boxShadow: '0 1px 2px rgba(28, 26, 23, 0.04)',
              }}
            >
              <ul
                className={`grid divide-y sm:divide-y-0 sm:divide-x ${
                  stats.length === 4
                    ? 'sm:grid-cols-2 lg:grid-cols-4'
                    : stats.length === 3
                      ? 'sm:grid-cols-3'
                      : stats.length === 2
                        ? 'sm:grid-cols-2'
                        : 'grid-cols-1'
                }`}
                style={{ borderColor: BORDER }}
              >
                {stats.map((s) => (
                  <li key={s.id} className="text-center px-6 py-7 sm:py-9" style={{ borderColor: BORDER }}>
                    <div
                      className="text-[40px] sm:text-5xl font-bold leading-none mb-2 tracking-[-0.025em]"
                      style={{ color: brand }}
                    >
                      {s.value}
                    </div>
                    <div
                      className="text-[13px] sm:text-sm leading-snug font-medium"
                      style={{ color: INK_MUTED }}
                    >
                      {s.label}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      {/* ── Team ───────────────────────────────────────────────────────── */}
      {staff.length > 0 && (
        <section className="py-20 sm:py-28" style={{ backgroundColor: SURFACE }}>
          <div className="max-w-[1240px] mx-auto px-5 sm:px-8">
            <div className="max-w-[640px] mb-14">
              <p
                className="text-xs font-semibold uppercase tracking-[0.16em] mb-4"
                style={{ color: brand }}
              >
                Our team
              </p>
              <h2
                className="text-3xl sm:text-4xl lg:text-[48px] font-semibold leading-[1.08] tracking-[-0.015em]"
                style={{ color: brand, fontFamily: 'var(--font-display, Georgia, serif)' }}
              >
                The people who care for you.
              </h2>
            </div>
            <div
              className={`grid gap-x-6 gap-y-12 ${
                staff.length >= 4
                  ? 'grid-cols-2 lg:grid-cols-4'
                  : staff.length === 3
                    ? 'sm:grid-cols-3'
                    : staff.length === 2
                      ? 'sm:grid-cols-2 max-w-3xl'
                      : 'max-w-sm'
              }`}
            >
              {staff.map((s) => (
                <div key={s.id} className="flex flex-col group">
                  <div
                    className="aspect-[4/5] w-full rounded-2xl overflow-hidden mb-5 transition-transform duration-300 group-hover:-translate-y-0.5"
                    style={{ backgroundColor: BORDER }}
                  >
                    {s.photoUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={s.photoUrl} alt={s.name} className="w-full h-full object-cover" />
                    ) : (
                      <div
                        className="w-full h-full flex items-center justify-center text-5xl font-bold"
                        style={{
                          background: `linear-gradient(135deg, ${brand}33 0%, ${brand}1A 100%)`,
                          color: brand,
                        }}
                        aria-label={s.name}
                      >
                        {staffInitials(s.name)}
                      </div>
                    )}
                  </div>
                  <h3 className="text-lg font-semibold mb-1 leading-tight" style={{ color: INK }}>
                    {s.name}
                  </h3>
                  {s.title && (
                    <p className="text-sm font-medium mb-3" style={{ color: brand }}>
                      {s.title}
                    </p>
                  )}
                  {s.bio && (
                    <p className="text-[14px] leading-[1.6]" style={{ color: INK_MUTED }}>
                      {s.bio}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Office tour ────────────────────────────────────────────────── */}
      {officePhotos.length > 0 && (
        <section className="py-20 sm:py-28">
          <div className="max-w-[1240px] mx-auto px-5 sm:px-8">
            <div className="max-w-[640px] mb-14">
              <p
                className="text-xs font-semibold uppercase tracking-[0.16em] mb-4"
                style={{ color: brand }}
              >
                Inside the office
              </p>
              <h2
                className="text-3xl sm:text-4xl lg:text-[48px] font-semibold leading-[1.08] tracking-[-0.015em]"
                style={{ color: brand, fontFamily: 'var(--font-display, Georgia, serif)' }}
              >
                A space designed to put you at ease.
              </h2>
            </div>
            <div
              className={`grid gap-4 sm:gap-6 ${
                officePhotos.length >= 4
                  ? 'grid-cols-2 lg:grid-cols-4'
                  : officePhotos.length === 3
                    ? 'grid-cols-1 sm:grid-cols-3'
                    : officePhotos.length === 2
                      ? 'grid-cols-1 sm:grid-cols-2'
                      : 'grid-cols-1 max-w-2xl'
              }`}
            >
              {officePhotos.map((p) => (
                <figure key={p.id} className="group">
                  <div
                    className="overflow-hidden rounded-2xl"
                    style={{ backgroundColor: BORDER }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.url}
                      alt={p.alt ?? ''}
                      className="w-full aspect-[4/5] object-cover transition-transform duration-500 ease-out group-hover:scale-[1.025]"
                      loading="lazy"
                    />
                  </div>
                  {(p.caption || p.alt) && (
                    <figcaption className="mt-3 text-sm" style={{ color: INK_MUTED }}>
                      {p.caption ?? p.alt}
                    </figcaption>
                  )}
                </figure>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Testimonials ───────────────────────────────────────────────── */}
      {testimonials.length > 0 && (
        <section className="py-20 sm:py-28" style={{ backgroundColor: SURFACE }}>
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

      {/* ── Closing CTA band ───────────────────────────────────────────── */}
      <section
        className="py-20 sm:py-28"
        style={{ backgroundColor: brand }}
      >
        <div className="max-w-[800px] mx-auto px-5 sm:px-8 text-center">
          <h2
            className="text-3xl sm:text-4xl lg:text-[48px] font-semibold leading-[1.08] tracking-[-0.015em] mb-6 text-white"
            style={{ fontFamily: 'var(--font-display, Georgia, serif)' }}
          >
            Ready to come see us?
          </h2>
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
