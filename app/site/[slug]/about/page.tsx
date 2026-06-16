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
import { CLINIC_THEME, readableInk } from '@/lib/clinic-site-theme'
import { aboutOrganizationJsonLd } from '@/lib/clinic-site-jsonld'
import {
  firstSentence,
  afterFirstSentence,
  staffInitials,
  staffSlug,
  buildClinicNavLinks,
  navServicesFromClinicServices,
  copyOverride,
} from '@/lib/clinic-site-helpers'
import SiteHeader from '@/components/clinic-site/site-header'
import SiteFooter from '@/components/clinic-site/site-footer'
import SiteMobileActions from '@/components/clinic-site/site-mobile-actions'
import TestimonialsCarousel from '@/components/clinic-site/testimonials-carousel'
import ScrollReveal from '@/components/clinic-site/scroll-reveal'
import ClosingCTA from '@/components/clinic-site/closing-cta'
import { resolveSeoMeta, applySeoOverride } from '@/lib/types/seo-meta'

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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(aboutLd) }}
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
      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="pt-10 pb-12 sm:pt-20 sm:pb-20">
        <div className="max-w-[800px] mx-auto px-5 sm:px-8 text-center">
          <p
            className="text-xs font-semibold uppercase tracking-[0.22em] mb-5"
            style={{ color: INK_MUTED }}
            data-edit-field="copy:about.heroEyebrow"
            data-edit-kind="text"
            data-edit-label="eyebrow"
          >
            {copyOverride(copyOverrides, 'about.heroEyebrow', `About ${name}`)}
          </p>
          <h1
            className="text-[32px] sm:text-[48px] lg:text-[64px] font-semibold leading-[1.05] tracking-[-0.015em] mb-6"
            style={{ color: headingInk, fontFamily: 'var(--font-display, Georgia, serif)' }}
            data-edit-field="copy:about.heroTitle"
            data-edit-kind="text"
            data-edit-label="headline"
          >
            {copyOverride(copyOverrides, 'about.heroTitle', profile.tagline ?? `Get to know ${name}.`)}
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
      {/* Body shows everything AFTER the hero's first-sentence subhead, so the
          opening line isn't duplicated. Hidden entirely for a one-sentence
          about (the hero already carried it). */}
      {aboutRest && (
        <section
          className="py-14 sm:py-24"
          style={{ backgroundColor: SURFACE }}
          data-edit-field="about"
          data-edit-kind="modal"
          data-edit-label="about text"
        >
          <div className="max-w-[1240px] mx-auto px-5 sm:px-8">
            <div className="grid lg:grid-cols-12 gap-10 lg:gap-16 items-start">
              <ScrollReveal className="lg:col-span-4">
                <p
                  className="text-xs font-semibold uppercase tracking-[0.16em]"
                  style={{ color: headingInk }}
                >
                  Our story
                </p>
              </ScrollReveal>
              <ScrollReveal delay={100} className="lg:col-span-8">
                <p
                  className="text-xl sm:text-2xl leading-[1.55] whitespace-pre-wrap font-medium"
                  style={{ color: INK }}
                >
                  {aboutRest}
                </p>
              </ScrollReveal>
            </div>
          </div>
        </section>
      )}

      {/* ── Stats anchors ──────────────────────────────────────────────── */}
      {stats.length > 0 && (
        <section
          className="py-14 sm:py-20"
          data-edit-field="stats"
          data-edit-kind="modal"
          data-edit-label="trust stats"
        >
          <div className="max-w-[1100px] mx-auto px-5 sm:px-8">
            <ScrollReveal
              className="rounded-2xl overflow-hidden"
              style={{
                backgroundColor: SURFACE,
                border: `1px solid ${BORDER}`,
                boxShadow: '0 1px 2px rgba(28, 26, 23, 0.04)',
              }}
            >
              <ul
                className={`grid ${
                  stats.length === 4
                    ? 'grid-cols-2 lg:grid-cols-4'
                    : stats.length === 3
                      ? 'grid-cols-1 sm:grid-cols-3'
                      : stats.length === 2
                        ? 'grid-cols-2'
                        : 'grid-cols-1'
                }`}
                style={{ borderColor: BORDER }}
              >
                {stats.map((s) => (
                  <li key={s.id} className="text-center px-6 py-7 sm:py-9" style={{ borderColor: BORDER }}>
                    <div
                      className="text-[34px] sm:text-5xl font-bold leading-none mb-2 tracking-[-0.025em]"
                      style={{ color: headingInk, fontFamily: 'var(--font-display, Georgia, serif)' }}
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
            </ScrollReveal>
          </div>
        </section>
      )}

      {/* ── Team ───────────────────────────────────────────────────────── */}
      {staff.length > 0 && (
        <section
          className="py-14 sm:py-24"
          style={{ backgroundColor: SURFACE }}
          data-edit-field="staff"
          data-edit-kind="modal"
          data-edit-label="team"
        >
          <div className="max-w-[1240px] mx-auto px-5 sm:px-8">
            <ScrollReveal className="max-w-[640px] mb-10 sm:mb-14 text-center mx-auto">
              <p
                className="text-xs font-semibold uppercase tracking-[0.22em] mb-4"
                style={{ color: headingInk }}
              >
                Our team
              </p>
              <h2
                className="text-3xl sm:text-4xl lg:text-[48px] font-semibold leading-[1.08] tracking-[-0.015em]"
                style={{ color: headingInk, fontFamily: 'var(--font-display, Georgia, serif)' }}
                data-edit-field="copy:about.teamTitle"
                data-edit-kind="text"
                data-edit-label="headline"
              >
                {copyOverride(copyOverrides, 'about.teamTitle', 'The people who care for you.')}
              </h2>
            </ScrollReveal>
            <div
              className={`grid gap-x-6 gap-y-10 sm:gap-y-12 ${
                staff.length >= 4
                  ? 'grid-cols-2 lg:grid-cols-4'
                  : staff.length === 3
                    ? 'grid-cols-1 sm:grid-cols-3'
                    : staff.length === 2
                      ? 'grid-cols-1 sm:grid-cols-2 max-w-3xl mx-auto'
                      : 'max-w-sm mx-auto'
              }`}
            >
              {staff.map((s, i) => (
                <ScrollReveal as="div" key={s.id} delay={(i % 4) * 90}>
                  <div className="flex flex-col items-center text-center group h-full">
                    {/* Oval portrait — matches /team index + homepage clinical-team
                        band + /team/[staffSlug] hero so the team look is consistent
                        across every surface that renders a staff card. */}
                    <div
                      className="aspect-[4/5] w-full max-w-[220px] overflow-hidden mb-5 transition-transform duration-500 group-hover:scale-[1.04]"
                      style={{
                        borderRadius: '50%',
                        backgroundColor: BORDER,
                      }}
                    >
                      {s.photoUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={s.photoUrl}
                          alt={s.name}
                          className="w-full h-full object-cover"
                          style={s.photoPosition ? { objectPosition: s.photoPosition } : undefined}
                        />
                      ) : (
                        <div
                          className="w-full h-full flex items-center justify-center text-5xl font-semibold"
                          style={{
                            background: `linear-gradient(135deg, ${brand}33 0%, ${brand}1A 100%)`,
                            color: headingInk,
                            fontFamily: 'var(--font-display, Georgia, serif)',
                          }}
                          aria-label={s.name}
                        >
                          {staffInitials(s.name)}
                        </div>
                      )}
                    </div>
                    {s.title && (
                      <p
                        className="text-[12px] font-semibold uppercase tracking-[0.12em] mb-1.5"
                        style={{ color: INK_MUTED }}
                      >
                        {s.title}
                      </p>
                    )}
                    <h3
                      className="text-lg sm:text-xl font-semibold mb-2 leading-tight"
                      style={{ color: INK, fontFamily: 'var(--font-display, Georgia, serif)' }}
                    >
                      {s.name}
                    </h3>
                    {s.bio && (
                      <p className="text-[14px] leading-[1.6]" style={{ color: INK_MUTED }}>
                        {s.bio}
                      </p>
                    )}
                  </div>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Office tour ────────────────────────────────────────────────── */}
      {officePhotos.length > 0 && (
        <section
          className="py-14 sm:py-24"
          data-edit-field="officePhotos"
          data-edit-kind="modal"
          data-edit-label="office photos"
        >
          <div className="max-w-[1240px] mx-auto px-5 sm:px-8">
            <ScrollReveal className="max-w-[640px] mb-10 sm:mb-14">
              <p
                className="text-xs font-semibold uppercase tracking-[0.16em] mb-4"
                style={{ color: headingInk }}
              >
                Inside the office
              </p>
              <h2
                className="text-3xl sm:text-4xl lg:text-[48px] font-semibold leading-[1.08] tracking-[-0.015em]"
                style={{ color: headingInk, fontFamily: 'var(--font-display, Georgia, serif)' }}
                data-edit-field="copy:about.officeTitle"
                data-edit-kind="text"
                data-edit-label="headline"
              >
                {copyOverride(copyOverrides, 'about.officeTitle', 'A space designed to put you at ease.')}
              </h2>
            </ScrollReveal>
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
              {officePhotos.map((p, i) => (
                <ScrollReveal as="div" key={p.id} delay={(i % 4) * 80}>
                  <figure className="group">
                    <div
                      className="overflow-hidden rounded-2xl"
                      style={{ backgroundColor: BORDER }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.url}
                        alt={p.alt ?? ''}
                        className="w-full aspect-[4/5] object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
                        style={p.position ? { objectPosition: p.position } : undefined}
                        loading="lazy"
                      />
                    </div>
                    {(p.caption || p.alt) && (
                      <figcaption className="mt-3 text-sm" style={{ color: INK_MUTED }}>
                        {p.caption ?? p.alt}
                      </figcaption>
                    )}
                  </figure>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Testimonials ───────────────────────────────────────────────── */}
      {testimonials.length > 0 && (
        <section className="py-14 sm:py-24" style={{ backgroundColor: SURFACE }}>
          <div className="max-w-[1240px] mx-auto px-5 sm:px-8">
            <ScrollReveal className="max-w-[640px] mb-10 sm:mb-14">
              <p
                className="text-xs font-semibold uppercase tracking-[0.16em] mb-4"
                style={{ color: headingInk }}
              >
                In their words
              </p>
              <h2
                className="text-3xl sm:text-4xl lg:text-[48px] font-semibold leading-[1.08] tracking-[-0.015em]"
                style={{ color: headingInk, fontFamily: 'var(--font-display, Georgia, serif)' }}
                data-edit-field="copy:about.testimonialsTitle"
                data-edit-kind="text"
                data-edit-label="headline"
              >
                {copyOverride(copyOverrides, 'about.testimonialsTitle', 'Patients on the experience.')}
              </h2>
            </ScrollReveal>
            <TestimonialsCarousel testimonials={testimonials} brand={brand} />
          </div>
        </section>
      )}

      <ClosingCTA
        heading={copyOverride(copyOverrides, 'about.cta.heading', 'Ready to come see us?')}
        subhead={copyOverride(copyOverrides, 'about.cta.subhead', 'Same-week visits are usually possible. We’d love to meet you.')}
        editKeyPrefix="about.cta"
        primary={{ label: bookLabel, href: bookHref }}
        secondary={
          profile.phone
            ? { label: profile.phone, href: `tel:${profile.phone}` }
            : undefined
        }
        brand={brand}
        variant="teal"
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
