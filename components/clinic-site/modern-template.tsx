import type { ClinicSiteData } from '@/lib/services/clinic-site'
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
  DAYS,
  DAY_LABEL,
  fmt12,
  firstSentence,
  staffInitials,
  type HoursMap,
} from '@/lib/clinic-site-helpers'
import ContactForm from '@/app/site/[slug]/contact-form'
import SiteHeader from '@/components/clinic-site/site-header'
import SiteFooter from '@/components/clinic-site/site-footer'
import SiteMobileActions from '@/components/clinic-site/site-mobile-actions'
import TestimonialsCarousel from '@/components/clinic-site/testimonials-carousel'
import ServicePills from '@/components/clinic-site/service-pills'

/**
 * Modern Family/Wellness template — the default clinic site.
 *
 * Design direction: hellotend.com verbatim, adapted for single-clinic content.
 * Two-bar header (top brand-color strip + main white nav), 3-col hero with
 * H1+secondary-H2 in the center column and large-radius oval portraits in
 * the flanking columns, pill service carousel, trust-stats card,
 * "the {clinic} difference" 2-col section, full services grid, clinical-
 * team 3-col with 4 icon callouts (only when ≥2 office photos or staff
 * present), arrow-paginated testimonials carousel, about, office tour,
 * hours+location, "it's a pleasure" closing CTA banner, dark forest-teal
 * footer. See CLAUDE.md for the full breakdown.
 */

const { BG, INK, INK_MUTED, SURFACE, BORDER } = CLINIC_THEME

interface Props {
  data: ClinicSiteData
  /** Base path for internal links — used so server renders correctly under /site/[slug] */
  basePath: string
  /** Absolute URL to the app's sign-in page. Patients + staff both auth here;
   *  tenant context routes them to the right dashboard after login. Absolute
   *  (not relative) because on a clinic subdomain a relative /signin would be
   *  rewritten to /site/<slug>/signin and 404. */
  signInUrl?: string
  /** Whether the clinic has at least one published blog post — gates the Blog nav link. */
  hasBlog?: boolean
  /** All-time count of completed `review_request` rows. Substituted into any
   *  stat with `dynamic: 'review_count'` so the "happy patients" trust signal
   *  reflects real data instead of a hardcoded "8,000+". Defaults to 0. */
  reviewCount?: number
}

/**
 * Display formatter for the live "happy patients" trust stat. Small counts
 * stay exact (a clinic with 5 reviews should not show "10+"); medium counts
 * round to the nearest 10 ("47" → "47+"); large counts collapse to "k+"
 * notation ("8,500" → "8k+"). Conservative rounding so the headline never
 * overstates what the clinic has actually earned.
 *
 * Exported for unit testing.
 */
export function formatReviewCount(n: number): string {
  if (n < 10) return String(n)
  if (n < 100) return `${n}+`
  if (n < 1000) return `${Math.floor(n / 10) * 10}+`
  if (n < 10000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k+`
  return `${Math.floor(n / 1000)}k+`
}

export default function ModernTemplate({ data, basePath, signInUrl, hasBlog = false, reviewCount = 0 }: Props) {
  const { profile, primaryLocation, locations } = data
  const name = profile.displayName ?? data.orgName
  const brand = profile.brandColor ?? '#9CAF9F' // sage default — warm neutral, not clinical blue
  const hours = profile.hours as HoursMap | null
  const isPro = profile.planTier === 'pro' || profile.planTier === 'premium'
  const heroImageUrl = profile.heroImageUrl ?? null
  const services: ClinicService[] =
    ((profile.services as ClinicService[] | null) ?? DEFAULT_SERVICES).slice(0, 6)
  const staff: ClinicStaff[] = (profile.staff as ClinicStaff[] | null) ?? []
  const rawStats: ClinicStat[] = ((profile.stats as ClinicStat[] | null) ?? []).slice(0, 4)
  // Resolve dynamic stats at render. v1: only `review_count` is dynamic.
  // When the live count is 0 AND the stat is dynamic, drop the row rather
  // than display "0 happy patients" — fresh clinics see the section minus
  // that stat, and if it was the only stat the whole section hides cleanly
  // via the existing `stats.length > 0` guard below.
  const stats: ClinicStat[] = rawStats
    .map((s) =>
      s.dynamic === 'review_count'
        ? { ...s, value: formatReviewCount(reviewCount) }
        : s,
    )
    .filter((s) => !(s.dynamic === 'review_count' && reviewCount === 0))
  const testimonials: ClinicTestimonial[] =
    ((profile.testimonials as ClinicTestimonial[] | null) ?? []).slice(0, 50)
  const officePhotos: ClinicOfficePhoto[] =
    ((profile.officePhotos as ClinicOfficePhoto[] | null) ?? []).slice(0, 8)
  const bookHref = isPro ? `${basePath}/book` : `${basePath}#contact`
  const bookLabel = 'Book a Visit'
  const signIn =
    signInUrl ??
    `${(process.env.NEXT_PUBLIC_APP_URL || 'https://www.dreamcreatestudio.com').replace(/\/+$/, '')}/signin`
  const navLinks: Array<{ label: string; href: string }> = [
    { label: 'Services', href: `${basePath}/services` },
    { label: 'About', href: `${basePath}/about` },
    { label: 'FAQ', href: `${basePath}/faq` },
    ...(hasBlog ? [{ label: 'Blog', href: `${basePath}/blog` }] : []),
    { label: 'Contact', href: `${basePath}#contact` },
  ]

  // Two flanking portrait photos for the hero. Left = clinic's hero image,
  // right = first office photo. Backdrops are HARDCODED universal pastels
  // (soft blue + warm peach) — Tend pairs the photo ovals against fixed
  // complementary panels regardless of brand color so the composition
  // reads the same on every palette. Decorative chrome, not content.
  const leftPortraitImage = heroImageUrl ?? null
  const rightPortraitImage = officePhotos[0]?.url ?? null
  const leftPortraitBg = '#B8D4E8'
  const rightPortraitBg = '#F0D9BD'

  // Service pills under the hero — Tend's qualifier strip.
  const heroServicePills = services.slice(0, 6)

  // Universal value-prop chips for the "difference" feature checklist. Drawn
  // from the clinic's own services first (so it feels personal), padded
  // with universal trust signals every dental practice can honestly claim.
  const differenceChips: string[] = (() => {
    const out: string[] = []
    for (const s of services.slice(0, 4)) out.push(s.name)
    out.push('No judgment, ever')
    out.push('Same-week visits')
    out.push('Most insurance accepted')
    out.push('Modern technology')
    out.push('Friendly staff')
    return out.slice(0, 8)
  })()

  // 4 universal clinical-team callouts. Generic-dental enough to not be
  // "fake" — every dentist's office can honestly claim each of these.
  // Adapted from Tend's "decades of experience / science-based care /
  // outcomes not quotas / putting safety first" pattern.
  const teamCallouts: Array<{ icon: string; title: string; copy: string }> = [
    {
      icon: 'experience',
      title: 'Experienced clinicians',
      copy: 'Led by a team that puts your comfort first, every visit.',
    },
    {
      icon: 'science',
      title: 'Science-based care',
      copy: 'Modern technology and proven techniques, no upsells.',
    },
    {
      icon: 'outcomes',
      title: 'Outcomes, not quotas',
      copy: 'We recommend what you need — and tell you why.',
    },
    {
      icon: 'safety',
      title: 'Modern infection control',
      copy: 'Spotless, sterilized, single-use where it counts.',
    },
  ]

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
      {/* ── Hero — Tend-verbatim composition ──────────────────────────── */}
      {/* LEFT photo (asymmetric oval, breaks out of container with neg
          margin, ~35% viewport) | CENTER text column capped at 640px
          (eyebrow → H1 → leadin → CTAs → secondary H2) | RIGHT photo.
          Photos use a SOFT ASYMMETRIC OVAL radius (egg-shape, not full
          circle, not perfect ellipse) sitting on HARDCODED neutral
          backdrops (soft blue + warm peach) regardless of brand color.
          Mobile collapses to a centered single column; a horizontal
          photo scroll appears below the text instead. */}
      <section className="relative overflow-hidden pt-12 pb-16 sm:pt-16 sm:pb-20 lg:pt-20 lg:pb-24">
        <div className="relative max-w-[1400px] mx-auto px-5 sm:px-8">
          <div className="grid lg:grid-cols-[1fr_minmax(0,640px)_1fr] gap-6 lg:gap-10 items-center">
            {/* LEFT photo — breakout to ~35% viewport, soft asymmetric oval */}
            <div className="hidden lg:block lg:-ml-12 xl:-ml-20">
              <OvalPortrait src={leftPortraitImage} bg={leftPortraitBg} variant="left" />
            </div>

            {/* CENTER text column — caps at 640px so the photos take the
                breathing room. */}
            <div className="text-center max-w-[640px] mx-auto">
              <p
                className="text-[12px] sm:text-[13px] font-semibold uppercase tracking-[0.22em] mb-5 sm:mb-6 flex items-center justify-center gap-2 flex-wrap"
                style={{ color: INK_MUTED }}
              >
                <span>{name}</span>
                {(primaryLocation?.city || profile.city) && (
                  <>
                    <span aria-hidden="true" className="opacity-50">·</span>
                    <span>
                      {primaryLocation?.city
                        ? `${primaryLocation.city}, ${primaryLocation.state}`
                        : `${profile.city}, ${profile.state}`}
                    </span>
                  </>
                )}
              </p>
              <h1
                className="text-[44px] sm:text-[64px] lg:text-[80px] font-semibold leading-[1.05] tracking-[-0.02em] mb-6"
                style={{ color: brand, fontFamily: 'var(--font-display, Georgia, serif)' }}
              >
                {profile.tagline ?? 'Dental care that finally feels human.'}
              </h1>
              {profile.about && (
                <p
                  className="text-base sm:text-lg leading-[1.55] mb-8 max-w-[460px] mx-auto"
                  style={{ color: INK }}
                >
                  {firstSentence(profile.about)} with{' '}
                  <strong className="font-semibold">no judgment, ever.</strong>
                </p>
              )}
              <div className="flex flex-wrap items-center justify-center gap-3 mb-12">
                <a
                  href={bookHref}
                  className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full text-base font-semibold text-white shadow-md transition hover:shadow-lg hover:opacity-95"
                  style={{ backgroundColor: brand }}
                >
                  {bookLabel}
                </a>
                {profile.phone && (
                  <a
                    href={`tel:${profile.phone}`}
                    className="inline-flex items-center px-6 py-3.5 rounded-full text-base font-semibold bg-white transition hover:bg-[#FAF7F2]"
                    style={{
                      color: brand,
                      border: `1.5px solid ${brand}`,
                    }}
                  >
                    {profile.phone}
                  </a>
                )}
              </div>
              {/* Secondary H2 inside the same text column — Tend's verbatim
                  "A full range of care for all your needs" with bold (not
                  italic) emphasis on the last phrase. */}
              <h2
                className="text-2xl sm:text-3xl lg:text-[40px] font-semibold leading-[1.15] tracking-[-0.01em]"
                style={{ color: brand, fontFamily: 'var(--font-display, Georgia, serif)' }}
              >
                A full range of care for{' '}
                <strong className="font-bold">all your needs</strong>.
              </h2>
            </div>

            {/* RIGHT photo — breakout to ~35% viewport, soft asymmetric oval */}
            <div className="hidden lg:block lg:-mr-12 xl:-mr-20">
              <OvalPortrait src={rightPortraitImage} bg={rightPortraitBg} variant="right" />
            </div>
          </div>

          {/* Mobile-only 4-portrait horizontal scroll */}
          {officePhotos.length > 0 && (
            <ul
              className="lg:hidden mt-12 -mx-5 sm:-mx-8 px-5 sm:px-8 flex gap-3 overflow-x-auto snap-x snap-mandatory"
              style={{ scrollbarWidth: 'none' }}
            >
              {officePhotos.slice(0, 4).map((p) => (
                <li key={p.id} className="shrink-0 snap-start w-48 sm:w-56">
                  <div
                    className="aspect-[4/5] w-full overflow-hidden"
                    style={{
                      borderRadius: '50%',
                      backgroundColor: BORDER,
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.url}
                      alt={p.alt ?? ''}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* Pill carousel of services with visible prev/next arrows —
              Tend's qualifier strip just below the hero. Client component
              so the arrows can scroll the row by one page on click. */}
          {heroServicePills.length > 0 && (
            <div className="mt-12 sm:mt-14">
              <ServicePills
                pills={heroServicePills.map((s) => ({ id: s.id, name: s.name }))}
                brand={brand}
                ink={INK}
                href={`${basePath}/services`}
              />
            </div>
          )}
        </div>
      </section>

      {/* ── Trust anchors — stat card right under the hero ─────────────── */}
      {stats.length > 0 && (
        <section className="pt-8 pb-20 sm:pt-10 sm:pb-24">
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

      {/* ── "The {clinic} difference" — 2-col feature/checklist ────────── */}
      {/* Left: feature media — video when `differenceVideoUrl` is set
          (ambient autoplay loop, no controls), otherwise heroImageUrl or
          officePhoto fallback. Right: H2 + leadin + Book CTA + 2-col chip
          checklist. Mirrors Tend's "Tend Dental difference" block. */}
      <section className="py-20 sm:py-28" style={{ backgroundColor: SURFACE }}>
        <div className="max-w-[1240px] mx-auto px-5 sm:px-8">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div>
              <div
                className="overflow-hidden"
                style={{
                  borderRadius: '32px',
                  backgroundColor: `${brand}1A`,
                  aspectRatio: '4 / 3',
                }}
              >
                {profile.differenceVideoUrl ? (
                  <video
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    className="w-full h-full object-cover"
                    aria-hidden="true"
                  >
                    <source src={profile.differenceVideoUrl} />
                  </video>
                ) : (heroImageUrl ?? officePhotos[1]?.url ?? officePhotos[0]?.url) && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={heroImageUrl ?? officePhotos[1]?.url ?? officePhotos[0]?.url ?? ''}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                )}
              </div>
            </div>
            <div>
              <p
                className="text-xs font-semibold uppercase tracking-[0.16em] mb-4"
                style={{ color: brand }}
              >
                Why us?
              </p>
              <h2
                className="text-3xl sm:text-4xl lg:text-[44px] font-semibold leading-[1.1] tracking-[-0.015em] mb-5"
                style={{ color: brand, fontFamily: 'var(--font-display, Georgia, serif)' }}
              >
                The {name} <strong className="italic font-semibold">difference</strong>
              </h2>
              {profile.about && (
                <p className="text-lg leading-[1.55] mb-8" style={{ color: INK }}>
                  {firstSentence(profile.about)}
                </p>
              )}
              <a
                href={bookHref}
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full text-base font-semibold text-white shadow-sm transition hover:shadow-md hover:opacity-95 mb-8"
                style={{ backgroundColor: brand }}
              >
                {bookLabel}
              </a>
              <ul className="grid sm:grid-cols-2 gap-3">
                {differenceChips.map((chip, i) => (
                  <li key={`${chip}-${i}`}>
                    <span
                      className="flex items-center gap-2 px-4 py-3 rounded-full text-sm font-semibold"
                      style={{
                        backgroundColor: `${brand}14`,
                        color: INK,
                        border: `1px solid ${brand}30`,
                      }}
                    >
                      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: brand }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                      {chip}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── Testimonials — promoted to this slot (was: services pillars,
          deleted). Tend's verbatim: "Why people love {clinic}" left-aligned
          serif heading, prev/next arrows top-right, dark forest-teal cards
          with white quote text + gold stars + author bottom-right. The full
          services catalog lives on /services; the hero pill carousel keeps
          a name-only preview. */}
      {testimonials.length > 0 && (
        <section id="reviews" className="scroll-mt-20 py-24 sm:py-32">
          <div className="max-w-[1240px] mx-auto px-5 sm:px-8">
            <h2
              className="text-3xl sm:text-4xl lg:text-[48px] font-semibold leading-[1.08] tracking-[-0.015em] mb-10"
              style={{ color: brand, fontFamily: 'var(--font-display, Georgia, serif)' }}
            >
              Why people love <strong className="italic font-semibold">{name}</strong>
            </h2>
            <TestimonialsCarousel testimonials={testimonials} brand={brand} />
          </div>
        </section>
      )}

      {/* ── Clinical-team trust — 3-col with oval portraits + 4 callouts ── */}
      {/* Renders only when we have ≥2 office photos (so both flanking
          portraits have real content). Hides cleanly when missing — no
          half-empty grid. */}
      {officePhotos.length >= 2 && (
        <section className="py-24 sm:py-32" style={{ backgroundColor: SURFACE }}>
          <div className="max-w-[1240px] mx-auto px-5 sm:px-8">
            <div className="grid lg:grid-cols-3 gap-8 lg:gap-12 items-center">
              <div className="hidden lg:block">
                <OvalPortrait
                  src={officePhotos[1]?.url ?? null}
                  bg={`${brand}22`}
                  variant="left"
                />
              </div>
              <div className="max-w-xl mx-auto text-center lg:text-left">
                <p
                  className="text-xs font-semibold uppercase tracking-[0.16em] mb-4"
                  style={{ color: brand }}
                >
                  Care that puts you first
                </p>
                <h2
                  className="text-3xl sm:text-4xl lg:text-[44px] font-semibold leading-[1.1] tracking-[-0.015em] mb-5"
                  style={{ color: brand, fontFamily: 'var(--font-display, Georgia, serif)' }}
                >
                  A team that <strong className="italic font-semibold">truly listens.</strong>
                </h2>
                <p className="text-lg leading-[1.55] mb-8" style={{ color: INK_MUTED }}>
                  Modern dentistry meets a gentler chairside touch — exactly what you've been
                  looking for in a dental practice.
                </p>
                <ul className="space-y-5 text-left mb-8">
                  {teamCallouts.map((c) => (
                    <li key={c.title} className="flex items-start gap-4">
                      <span
                        className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${brand}1F`, color: brand }}
                        aria-hidden="true"
                      >
                        <TeamCalloutIcon kind={c.icon} />
                      </span>
                      <div>
                        <h3 className="text-[17px] font-semibold mb-1" style={{ color: INK }}>
                          {c.title}
                        </h3>
                        <p className="text-[14px] leading-[1.6]" style={{ color: INK_MUTED }}>
                          {c.copy}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
                <a
                  href={`${basePath}/about`}
                  className="inline-flex items-center gap-2 text-sm font-semibold hover:underline"
                  style={{ color: brand }}
                >
                  Meet our team →
                </a>
              </div>
              <div className="hidden lg:block">
                <OvalPortrait
                  src={officePhotos[2]?.url ?? officePhotos[0]?.url ?? null}
                  bg="#E9D6BF"
                  variant="right"
                />
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Meet the team (existing) ───────────────────────────────────── */}
      {staff.length > 0 && (
        <section id="team" className="scroll-mt-20 py-24 sm:py-32">
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
                The <strong className="italic font-semibold">people</strong> who care for you.
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
                    className="aspect-[4/5] w-full overflow-hidden mb-5 transition-transform duration-300 group-hover:-translate-y-0.5"
                    style={{
                      backgroundColor: BORDER,
                      borderRadius: '120px',
                    }}
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

      {/* ── About ──────────────────────────────────────────────────────── */}
      {profile.about && (
        <section className="py-24 sm:py-32">
          <div className="max-w-[1240px] mx-auto px-5 sm:px-8">
            <div className="grid lg:grid-cols-12 gap-10 lg:gap-16 items-start">
              <div className="lg:col-span-4">
                <p
                  className="text-xs font-semibold uppercase tracking-[0.16em]"
                  style={{ color: brand }}
                >
                  About {name}
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

      {/* ── Office tour — magazine-rhythm photo gallery ─────────────────── */}
      {officePhotos.length > 0 && (
        <section className="py-24 sm:py-32" style={{ backgroundColor: SURFACE }}>
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
                A space designed to put you <strong className="italic font-semibold">at ease.</strong>
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
              {officePhotos.slice(0, 4).map((p) => (
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

      {/* ── Hours + Location ───────────────────────────────────────────── */}
      {(hours || primaryLocation || profile.city) && (
        <section id="hours" className="scroll-mt-20 py-24 sm:py-32">
          <div className="max-w-[1240px] mx-auto px-5 sm:px-8">
            <div className="grid md:grid-cols-2 gap-6 lg:gap-8">
              {/* Hours */}
              {hours && Object.keys(hours).length > 0 && (
                <div
                  className="rounded-2xl p-8 sm:p-10"
                  style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}` }}
                >
                  <p
                    className="text-xs font-semibold uppercase tracking-[0.16em] mb-5"
                    style={{ color: brand }}
                  >
                    Office hours
                  </p>
                  <div className="space-y-3">
                    {DAYS.map((day) => {
                      const entry = (hours as HoursMap)[day]
                      if (!entry) return null
                      return (
                        <div key={day} className="flex items-baseline justify-between text-[15px]">
                          <span className="font-medium w-28 shrink-0" style={{ color: INK }}>
                            {DAY_LABEL[day]}
                          </span>
                          <span className="text-right" style={{ color: INK_MUTED }}>
                            {entry.closed
                              ? 'Closed'
                              : entry.open && entry.close
                                ? `${fmt12(entry.open)} – ${fmt12(entry.close)}`
                                : '—'}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Location */}
              {(primaryLocation || profile.city) && (
                <div
                  className="rounded-2xl p-8 sm:p-10"
                  style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}` }}
                >
                  <p
                    className="text-xs font-semibold uppercase tracking-[0.16em] mb-5"
                    style={{ color: brand }}
                  >
                    Find us
                  </p>
                  <div className="space-y-4">
                    {locations.map((loc, i) => {
                      const addr = [loc.addressLine1, loc.addressLine2].filter(Boolean).join(' ')
                      const city = [loc.city, loc.state, loc.postalCode].filter(Boolean).join(', ')
                      return (
                        <div
                          key={loc.id}
                          className={i > 0 ? 'pt-4 border-t' : ''}
                          style={i > 0 ? { borderColor: BORDER } : undefined}
                        >
                          {locations.length > 1 && (
                            <p
                              className="text-[11px] font-semibold uppercase tracking-wider mb-2"
                              style={{ color: INK_MUTED }}
                            >
                              {loc.name}
                            </p>
                          )}
                          {addr && (
                            <p className="text-[15px] font-medium" style={{ color: INK }}>
                              {addr}
                            </p>
                          )}
                          {city && (
                            <p className="text-sm" style={{ color: INK_MUTED }}>
                              {city}
                            </p>
                          )}
                          {loc.phone && (
                            <a
                              href={`tel:${loc.phone}`}
                              className="block text-sm mt-2 hover:underline"
                              style={{ color: brand }}
                            >
                              {loc.phone}
                            </a>
                          )}
                        </div>
                      )
                    })}
                    {locations.length === 0 && profile.city && (
                      <div>
                        {profile.addressLine1 && (
                          <p className="text-[15px] font-medium" style={{ color: INK }}>
                            {profile.addressLine1}
                          </p>
                        )}
                        <p className="text-sm" style={{ color: INK_MUTED }}>
                          {[profile.city, profile.state, profile.postalCode].filter(Boolean).join(', ')}
                        </p>
                        {profile.phone && (
                          <a
                            href={`tel:${profile.phone}`}
                            className="block text-sm mt-2 hover:underline"
                            style={{ color: brand }}
                          >
                            {profile.phone}
                          </a>
                        )}
                      </div>
                    )}
                    {profile.email && (
                      <a
                        href={`mailto:${profile.email}`}
                        className="inline-block text-sm font-medium mt-3 hover:underline"
                        style={{ color: brand }}
                      >
                        {profile.email}
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ── "It's a pleasure" closing CTA banner ─────────────────────────── */}
      {/* Full-width band in the clinic's brand color (with optional photo
          overlay) carrying the Tend-verbatim "Care isn't just X, it's a
          pleasure" closing line + Book Now CTA. The brand-color saturation
          + white serif headline is the single most recognizable Tend
          composition element. */}
      <section
        className="relative overflow-hidden"
        style={{
          backgroundColor: brand,
          color: '#FFFFFF',
        }}
      >
        {heroImageUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={heroImageUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-25"
            loading="lazy"
          />
        )}
        <div className="relative max-w-[1240px] mx-auto px-5 sm:px-8 py-20 sm:py-28">
          <div className="grid lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-8">
              <h2
                className="text-3xl sm:text-4xl lg:text-[52px] font-semibold leading-[1.1] tracking-[-0.015em]"
                style={{ color: '#FFFFFF', fontFamily: 'var(--font-display, Georgia, serif)' }}
              >
                Care at {name} isn't just easy, it's{' '}
                <strong className="italic font-semibold">a pleasure.</strong>
              </h2>
            </div>
            <div className="lg:col-span-4 lg:text-right">
              <a
                href={bookHref}
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full text-base font-semibold transition hover:opacity-95 shadow-lg"
                style={{ backgroundColor: '#FFFFFF', color: brand }}
              >
                {bookLabel}
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── Booking CTA / Contact form ─────────────────────────────────── */}
      <section
        id="contact"
        className="py-24 sm:py-32"
      >
        <div className="max-w-[1240px] mx-auto px-5 sm:px-8">
          <div className="max-w-[600px] mx-auto text-center">
            <p
              className="text-xs font-semibold uppercase tracking-[0.16em] mb-5"
              style={{ color: brand }}
            >
              {isPro ? 'Book online' : 'Get in touch'}
            </p>
            <h2
              className="text-3xl sm:text-4xl lg:text-[48px] font-semibold leading-[1.08] tracking-[-0.015em] mb-5"
              style={{ color: brand, fontFamily: 'var(--font-display, Georgia, serif)' }}
            >
              {isPro ? "Let's get you on the schedule." : "We'd love to see you."}
            </h2>
            <p className="text-lg leading-[1.6] mb-10" style={{ color: INK_MUTED }}>
              {isPro
                ? 'Pick a time that works. Most patients are seen the same week.'
                : 'Fill out the form and we\'ll be in touch to confirm your visit.'}
            </p>
            <ContactForm orgId={data.orgId} brand={brand} isPro={isPro} basePath={basePath} />
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
        signInUrl={signIn}
      />
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// OvalPortrait — symmetric vertical-pill photo panel that flanks the hero
// + the clinical-team section's outer columns. Uses a pure `50%` ellipse
// over a 4/5 portrait aspect so both ends are equally rounded and the
// curvature reads as a soft wide-pill shape (smoother than the prior
// asymmetric pebble). Backdrops are the clinic-site palette's blue and
// peach (passed in by the parent), giving a Tend-style flat solid backing.
// ────────────────────────────────────────────────────────────────────────

function OvalPortrait({
  src,
  bg,
  variant: _variant,
}: {
  src: string | null
  bg: string
  variant?: 'left' | 'right'
}) {
  return (
    <div
      className="relative overflow-hidden w-full aspect-[4/5]"
      style={{ borderRadius: '50%', backgroundColor: bg }}
    >
      {src ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={src}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : null}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// TeamCalloutIcon — tiny inline-SVG icons for the clinical-team callouts.
// Server-renderable, no icon-lib dependency. Each kind matches one of the
// 4 universal trust signals (experience / science / outcomes / safety).
// ────────────────────────────────────────────────────────────────────────

function TeamCalloutIcon({ kind }: { kind: string }) {
  const props = {
    className: 'w-5 h-5',
    fill: 'none',
    viewBox: '0 0 24 24',
    stroke: 'currentColor',
    strokeWidth: 1.75,
  }
  switch (kind) {
    case 'experience':
      // Badge / shield with checkmark
      return (
        <svg {...props}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    case 'science':
      // Beaker / flask
      return (
        <svg {...props}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M14.25 3.104v5.714a2.25 2.25 0 00.659 1.591L19 14.5m-9.5-1.5h5m-7.122 3.5h9.244a2.25 2.25 0 002.121-2.997L17.5 9.5h-11l-1.243 4.003A2.25 2.25 0 007.378 16.5z" />
        </svg>
      )
    case 'outcomes':
      // Sparkle / star
      return (
        <svg {...props}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
        </svg>
      )
    case 'safety':
      // Shield
      return (
        <svg {...props}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
        </svg>
      )
    default:
      return null
  }
}

