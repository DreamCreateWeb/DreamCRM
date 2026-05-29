import type { ClinicSiteData } from '@/lib/services/clinic-site'
import type {
  ClinicService,
  ClinicStaff,
  ClinicStat,
  ClinicTestimonial,
  ClinicOfficePhoto,
} from '@/lib/types/clinic-content'
import { DEFAULT_SERVICES } from '@/lib/types/clinic-content'
import ContactForm from '@/app/site/[slug]/contact-form'

/**
 * Modern Family/Wellness template — the default clinic site.
 *
 * Design direction: modern healthcare DTC (hellotend.com reference), not
 * clinical-medical. Warm off-white background, warm dark ink text, brand
 * color used sparingly for CTAs + accents only. See DESIGN.md for the full
 * design language.
 */

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
const DAY_LABEL: Record<string, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
  fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
}

// Template-level warm-neutral palette. Brand color (set by the clinic) is
// layered on top for CTAs + small accents only — the overall feel is
// warm-neutral regardless of what color the clinic picks.
const BG = '#FAF7F2'
const INK = '#1C1A17'
const INK_MUTED = '#6B635A'
const SURFACE = '#FFFFFF'
const BORDER = '#E8E2D9'

function fmt12(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

/** First sentence of a longer about paragraph — used as the hero subhead so
 *  the H1 stays a clean value-prop statement and the warm context lives one
 *  beat below it. Falls back to the whole string when no terminator is
 *  found. */
function firstSentence(text: string): string {
  const m = text.trim().match(/^[\s\S]+?[.!?](?=\s|$)/)
  return m ? m[0] : text.trim()
}

/** Top-strip rotating-style chips. Static for v1 — we just inline 3 chips
 *  separated by middots so the patient scans the value props without
 *  needing JS-driven rotation. The clinic's tagline (when not the default)
 *  becomes the leading chip; the other two are universal trust signals. */
function announcementChips(tagline: string | null): string[] {
  const base = ['No judgment, ever', 'Same-week visits', 'Most insurance accepted']
  if (!tagline) return base
  const trimmed = tagline.trim()
  // Don't repeat the H1 verbatim in the strip — only surface the tagline
  // here when it's short enough to feel like a chip (≤ 40 chars).
  if (trimmed.length > 0 && trimmed.length <= 40) {
    return [trimmed, ...base.slice(0, 2)]
  }
  return base
}

/** "Open today · 8:00 AM – 5:00 PM" or "Closed today" — the footer's
 *  at-a-glance availability blurb. Uses the same `mon`/`tue`/... key
 *  ordering as the hours grid so today's lookup is straightforward. */
function todaysHoursLabel(hours: Record<string, { open?: string; close?: string; closed?: boolean }>): string {
  const KEY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  const todayKey = KEY[new Date().getDay()]
  const entry = hours[todayKey]
  if (!entry || entry.closed) return 'Closed today'
  if (!entry.open || !entry.close) return 'Hours by appointment'
  return `Open today · ${fmt12(entry.open)} – ${fmt12(entry.close)}`
}

const HONORIFICS = new Set(['dr.', 'dr', 'mr.', 'mr', 'mrs.', 'mrs', 'ms.', 'ms'])
const POST_NOMINALS = /(,\s*)?(rdh|dds|dmd|md|np|rn|phd)\.?$/i

/** Initials chip for staff who haven't uploaded a photo yet. Strips common
 *  honorifics ("Dr. Jane Lee" → "JL", not "DJ") + post-nominals
 *  ("Maria Vega, RDH" → "MV", not "MR") so the chip reads as the person's
 *  actual name rather than their credentials. */
function staffInitials(fullName: string): string {
  const cleaned = fullName.trim().replace(POST_NOMINALS, '').trim()
  const words = cleaned
    .split(/\s+/)
    .filter((w) => w && !HONORIFICS.has(w.toLowerCase()))
  if (words.length === 0) return '?'
  const first = words[0][0]
  const last = words.length > 1 ? words[words.length - 1][0] : ''
  return (first + last).toUpperCase()
}

interface HourEntry { open?: string; close?: string; closed?: boolean }
type HoursMap = Record<string, HourEntry>

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
}

export default function ModernTemplate({ data, basePath, signInUrl, hasBlog = false }: Props) {
  const { profile, primaryLocation, locations } = data
  const name = profile.displayName ?? data.orgName
  const brand = profile.brandColor ?? '#9CAF9F' // sage default — warm neutral, not clinical blue
  const hours = profile.hours as HoursMap | null
  const isPro = profile.planTier === 'pro' || profile.planTier === 'premium'
  const logoUrl = profile.logoUrl ?? null
  const heroImageUrl = profile.heroImageUrl ?? null
  const services: ClinicService[] =
    ((profile.services as ClinicService[] | null) ?? DEFAULT_SERVICES).slice(0, 6)
  const staff: ClinicStaff[] = (profile.staff as ClinicStaff[] | null) ?? []
  const stats: ClinicStat[] = ((profile.stats as ClinicStat[] | null) ?? []).slice(0, 4)
  // Defensive cap — generous enough that real clinics with hundreds of
  // featured testimonials still render them all, but bounded against
  // pathological JSON. The marquee handles arbitrarily many.
  const testimonials: ClinicTestimonial[] =
    ((profile.testimonials as ClinicTestimonial[] | null) ?? []).slice(0, 50)
  const officePhotos: ClinicOfficePhoto[] =
    ((profile.officePhotos as ClinicOfficePhoto[] | null) ?? []).slice(0, 8)
  const bookHref = isPro ? `${basePath}/book` : `${basePath}#contact`
  const bookLabel = 'Book a Visit'
  // Logo / "home" links must never be an empty href on a subdomain (basePath='').
  const homeHref = basePath || '/'
  // Both patient + staff sign-in route through the app's /signin (tenant
  // context decides the destination). Absolute so it survives the subdomain
  // rewrite. Fall back to the canonical app host when no prop is supplied.
  const signIn =
    signInUrl ??
    `${(process.env.NEXT_PUBLIC_APP_URL || 'https://www.dreamcreatestudio.com').replace(/\/+$/, '')}/signin`
  // In-page anchor nav — only surface sections that actually render.
  const navLinks: Array<{ label: string; href: string }> = [
    { label: 'Services', href: `${basePath}#services` },
    ...(staff.length > 0 ? [{ label: 'Team', href: `${basePath}#team` }] : []),
    ...(testimonials.length > 0 ? [{ label: 'Reviews', href: `${basePath}#reviews` }] : []),
    ...(hasBlog ? [{ label: 'Blog', href: `${basePath}/blog` }] : []),
    { label: 'Contact', href: `${basePath}#contact` },
  ]

  // Two side-flanking photos for the centered hero blob composition. Use
  // the clinic's hero image as the LEFT blob, and the first office photo
  // (when seeded) as the RIGHT blob. Graceful degradation: if either is
  // missing, the blob renders as a solid warm-color panel — keeping the
  // hero's three-column rhythm even on a brand-new clinic with no photos.
  const leftBlobImage = heroImageUrl ?? null
  const rightBlobImage = officePhotos[0]?.url ?? null
  const leftBlobBg = `${brand}33` // warm panel fallback
  const rightBlobBg = '#E9D6BF'

  // Service pill carousel (right under hero) — up to 6 service names as
  // pills the patient can scan instantly. Carries an anchor to the full
  // services section further down the page.
  const heroServicePills = services.slice(0, 6)

  return (
    <div
      className="min-h-screen antialiased"
      style={{
        backgroundColor: BG,
        color: INK,
        fontFamily: 'var(--font-sans, Inter, sans-serif)',
      }}
    >
      {/* ── Top announcement strip ─────────────────────────────────────── */}
      {/* Tend-style thin strip carrying the clinic's value-prop tagline +
          rotating chips. Static for v1 (no JS); the chips just sit
          inline with separators so the patient gets the gist without a
          carousel that fights with the rest of the page. */}
      <div
        className="text-[12px] sm:text-[13px] font-medium"
        style={{ backgroundColor: brand, color: '#FFFFFF' }}
      >
        <div className="max-w-[1240px] mx-auto px-5 sm:px-8 py-2.5 flex items-center justify-center gap-3 sm:gap-6 flex-wrap text-center">
          {announcementChips(profile.tagline).map((chip, i) => (
            <span key={i} className="flex items-center gap-3 sm:gap-6">
              {i > 0 && <span aria-hidden="true" className="opacity-50">·</span>}
              <span>{chip}</span>
            </span>
          ))}
        </div>
      </div>

      {/* ── Floating pill header ───────────────────────────────────────── */}
      {/* Tend-shaped nav: a white pill floating inside the warm-neutral page
          rather than a full-width bar. Sticks to the top with a small
          breathing margin. Backdrop blur keeps it legible over scrolling
          content. The pill never spans the full width so the eye reads the
          page edge as the warm BG color, not as the nav. */}
      <header className="sticky top-0 z-40 px-3 sm:px-5 pt-3 sm:pt-4">
        <div className="max-w-[1240px] mx-auto">
          <div
            className="rounded-full backdrop-blur-md flex items-center justify-between gap-3 sm:gap-4 px-3 sm:px-4 py-2 sm:py-2.5"
            style={{
              backgroundColor: '#FFFFFFE6',
              border: `1px solid ${BORDER}`,
              boxShadow: '0 2px 12px rgba(28, 26, 23, 0.06)',
            }}
          >
            {/* Logo / wordmark */}
            <a href={homeHref} className="flex items-center gap-2 min-w-0 shrink pl-1.5 sm:pl-2">
              {logoUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={logoUrl}
                  alt={name}
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg object-cover shrink-0"
                />
              ) : (
                <span
                  className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg text-white text-sm font-bold shrink-0"
                  style={{ backgroundColor: brand }}
                >
                  {name.charAt(0).toUpperCase()}
                </span>
              )}
              <span
                className="font-semibold text-[15px] sm:text-[17px] leading-tight truncate"
                style={{ color: INK, fontFamily: 'var(--font-display, Georgia, serif)' }}
              >
                {name}
              </span>
            </a>

            {/* Section nav — desktop only */}
            <nav className="hidden lg:flex items-center gap-0.5">
              {navLinks.map((l) => (
                <a
                  key={l.label}
                  href={l.href}
                  className="text-sm font-medium px-3 py-1.5 rounded-full transition hover:bg-[#F1ECE3]"
                  style={{ color: INK_MUTED }}
                >
                  {l.label}
                </a>
              ))}
            </nav>

            {/* Right-side actions */}
            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              <a
                href={signIn}
                className="inline-flex items-center gap-1.5 text-[13px] sm:text-sm font-medium px-2.5 sm:px-3 py-1.5 rounded-full transition hover:bg-[#F1ECE3]"
                style={{ color: INK_MUTED }}
              >
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
                <span className="hidden sm:inline">Patient Login</span>
                <span className="sm:hidden">Login</span>
              </a>
              <a
                href={bookHref}
                className="inline-flex items-center px-4 sm:px-5 py-2 sm:py-2.5 rounded-full text-[13px] sm:text-sm font-semibold text-white shadow-sm transition hover:shadow-md hover:opacity-95"
                style={{ backgroundColor: brand }}
              >
                {bookLabel}
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* ── Hero — centered text with two flanking blob photos ─────────── */}
      {/* Composition cribs Tend's symmetric hero — a center text column
          with two organic-blob photos floating to the left and right. The
          blob shape is achieved with asymmetric border-radius (no SVG
          mask needed, server-renderable), and the photo lives inside a
          colored panel so the whole shape stays present even when the
          photo is small or fails to load. */}
      <section className="relative overflow-hidden pt-10 pb-16 sm:pt-14 sm:pb-20 lg:pt-16 lg:pb-24">
        <div className="relative max-w-[1240px] mx-auto px-5 sm:px-8">
          <div className="grid lg:grid-cols-12 gap-6 lg:gap-8 items-center">
            {/* LEFT BLOB — heroImageUrl when present */}
            <div className="hidden lg:block lg:col-span-3">
              <BlobPhoto
                src={leftBlobImage}
                bg={leftBlobBg}
                shape="left"
                aspect="aspect-[4/5]"
              />
            </div>

            {/* CENTER — text column */}
            <div className="lg:col-span-6 text-center">
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
              {/* H1 — serif display in brand color. Italic-bold inline
                  emphasis on the value-prop phrase mirrors Tend's "no
                  judgment, ever" treatment without copying the wording. */}
              <h1
                className="text-[40px] sm:text-[56px] lg:text-[68px] font-semibold leading-[1.05] tracking-[-0.015em] mb-7"
                style={{ color: brand, fontFamily: 'var(--font-display, Georgia, serif)' }}
              >
                {profile.tagline ?? 'Dental care that finally feels human.'}
              </h1>
              {profile.about && (
                <p
                  className="text-base sm:text-lg leading-[1.55] mb-9 max-w-[520px] mx-auto"
                  style={{ color: INK }}
                >
                  {firstSentence(profile.about)}
                </p>
              )}
              <div className="flex flex-wrap items-center justify-center gap-3">
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

            {/* RIGHT BLOB — officePhotos[0] when present */}
            <div className="hidden lg:block lg:col-span-3">
              <BlobPhoto
                src={rightBlobImage}
                bg={rightBlobBg}
                shape="right"
                aspect="aspect-[4/5]"
              />
            </div>
          </div>

          {/* Service pill carousel — sits just below the hero text/photos.
              Quick-glance category navigation that double-links to the
              full services section further down. Scrolls horizontally
              on narrow viewports. */}
          {heroServicePills.length > 0 && (
            <>
              <p
                className="text-center text-sm sm:text-base mt-12 sm:mt-14 mb-5"
                style={{ color: INK_MUTED }}
              >
                A full range of care for{' '}
                <span className="font-semibold italic" style={{ color: INK }}>
                  every visit
                </span>
                .
              </p>
              <ul
                className="flex gap-3 overflow-x-auto pb-1 snap-x snap-mandatory sm:flex-wrap sm:justify-center sm:overflow-visible"
                style={{ scrollbarWidth: 'none' }}
              >
                {heroServicePills.map((s) => (
                  <li key={s.id} className="snap-start shrink-0">
                    <a
                      href={`${basePath}#services`}
                      className="inline-flex items-center px-5 sm:px-6 py-3 sm:py-3.5 rounded-full text-sm sm:text-[15px] font-semibold transition hover:shadow-sm"
                      style={{
                        backgroundColor: `${brand}1F`,
                        color: INK,
                        border: `1px solid ${brand}40`,
                      }}
                    >
                      {s.name}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </section>

      {/* ── Floating phone CTA — desktop only ──────────────────────────── */}
      {profile.phone && (
        <a
          href={`tel:${profile.phone}`}
          className="hidden lg:flex fixed bottom-8 right-8 z-30 w-14 h-14 rounded-full items-center justify-center shadow-lg transition hover:shadow-xl hover:-translate-y-0.5"
          style={{ backgroundColor: brand }}
          aria-label={`Call ${name} at ${profile.phone}`}
        >
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
          </svg>
        </a>
      )}

      {/* ── Trust anchors — stat card right under the hero ─────────────── */}
      {stats.length > 0 && (
        <section className="pt-14 pb-20 sm:pt-16 sm:pb-24">
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

      {/* ── Services — numbered pillars ────────────────────────────────── */}
      <section id="services" className="scroll-mt-20 py-24 sm:py-32" style={{ backgroundColor: SURFACE }}>
        <div className="max-w-[1240px] mx-auto px-5 sm:px-8">
          <div className="max-w-[640px] mb-14">
            <p
              className="text-xs font-semibold uppercase tracking-[0.16em] mb-4"
              style={{ color: brand }}
            >
              What we do
            </p>
            <h2
              className="text-3xl sm:text-4xl lg:text-[48px] font-semibold leading-[1.08] tracking-[-0.015em]"
              style={{ color: brand, fontFamily: 'var(--font-display, Georgia, serif)' }}
            >
              Comprehensive dental care, gently delivered.
            </h2>
          </div>
          {/* Soft warm-neutral tiles give the numbered services a card shape
              without losing the magazine column feel — the cream BG against
              the white surface creates a quiet visual rhythm with the rest
              of the page. */}
          <div className="grid gap-5 sm:gap-6 lg:gap-7 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((s, i) => (
              <div
                key={s.id}
                className="flex flex-col group rounded-2xl p-7 sm:p-8 transition-transform duration-300 hover:-translate-y-0.5"
                style={{ backgroundColor: BG, border: `1px solid ${BORDER}` }}
              >
                <span
                  className="text-sm font-semibold tracking-[0.12em] mb-4 inline-flex items-center gap-2"
                  style={{ color: brand }}
                >
                  <span>{String(i + 1).padStart(2, '0')}</span>
                  <span
                    aria-hidden="true"
                    className="h-px w-0 group-hover:w-8 transition-[width] duration-300"
                    style={{ backgroundColor: brand }}
                  />
                </span>
                <h3 className="text-xl font-semibold mb-3 leading-tight" style={{ color: INK }}>
                  {s.name}
                </h3>
                {s.description && (
                  <p className="text-[15px] leading-[1.6]" style={{ color: INK_MUTED }}>
                    {s.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Meet the team ──────────────────────────────────────────────── */}
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
                      // No-photo state: warm gradient panel with the staff
                      // member's initials. Replaces the prior emoji (👤),
                      // which read as "unfinished site" rather than as a
                      // deliberate placeholder.
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

      {/* ── Testimonials — long-form, photo + first name + city ────────── */}
      {testimonials.length > 0 && (
        <section id="reviews" className="scroll-mt-20 py-24 sm:py-32" style={{ backgroundColor: SURFACE }}>
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
            {testimonials.length > 3 ? (
              <TestimonialsMarquee
                testimonials={testimonials}
                brand={brand}
                surface={SURFACE}
              />
            ) : (
              <div
                className={`grid gap-6 lg:gap-8 ${
                  testimonials.length === 3
                    ? 'md:grid-cols-3'
                    : testimonials.length === 2
                      ? 'md:grid-cols-2 max-w-4xl'
                      : 'max-w-2xl'
                }`}
              >
                {testimonials.map((t) => (
                  <TestimonialCard key={t.id} t={t} brand={brand} />
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── About ──────────────────────────────────────────────────────── */}
      {profile.about && (
        <section className="py-24 sm:py-32" style={{ backgroundColor: SURFACE }}>
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
        <section className="py-24 sm:py-32">
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

      {/* ── Booking CTA section ─────────────────────────────────────────── */}
      <section
        id="contact"
        className="py-24 sm:py-32"
        style={{ backgroundColor: SURFACE }}
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

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="border-t" style={{ borderColor: BORDER }}>
        <div className="max-w-[1240px] mx-auto px-5 sm:px-8 py-16 sm:py-20">
          <div className="grid gap-12 sm:gap-8 sm:grid-cols-2 lg:grid-cols-12">
            {/* Brand + contact */}
            <div className="lg:col-span-5 max-w-sm">
              <a href={homeHref} className="flex items-center gap-2.5 mb-5">
                {logoUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={logoUrl} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
                ) : (
                  <span
                    className="flex items-center justify-center w-9 h-9 rounded-lg text-white text-sm font-bold shrink-0"
                    style={{ backgroundColor: brand }}
                  >
                    {name.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="font-semibold text-[16px]" style={{ color: INK }}>{name}</span>
              </a>
              {profile.tagline && (
                <p className="text-sm leading-[1.6] mb-6" style={{ color: INK_MUTED }}>{profile.tagline}</p>
              )}
              <div className="space-y-1.5 text-sm">
                {(profile.addressLine1 || profile.city) && (
                  <p style={{ color: INK_MUTED }}>
                    {[profile.addressLine1, [profile.city, profile.state].filter(Boolean).join(', ')]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}
                {profile.phone && (
                  <a href={`tel:${profile.phone}`} className="block hover:underline" style={{ color: INK }}>
                    {profile.phone}
                  </a>
                )}
                {profile.email && (
                  <a href={`mailto:${profile.email}`} className="block hover:underline" style={{ color: INK }}>
                    {profile.email}
                  </a>
                )}
              </div>
            </div>

            {/* Explore */}
            <div className="lg:col-span-2 lg:col-start-7">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] mb-4" style={{ color: INK_MUTED }}>
                Explore
              </p>
              <ul className="space-y-2.5">
                {navLinks.map((l) => (
                  <li key={l.label}>
                    <a href={l.href} className="text-sm hover:underline" style={{ color: INK }}>{l.label}</a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Patients */}
            <div className="lg:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] mb-4" style={{ color: INK_MUTED }}>
                Patients
              </p>
              <ul className="space-y-2.5">
                <li>
                  <a href={bookHref} className="text-sm hover:underline" style={{ color: INK }}>{bookLabel}</a>
                </li>
                <li>
                  <a href={signIn} className="text-sm hover:underline" style={{ color: INK }}>Patient Login</a>
                </li>
                {profile.phone && (
                  <li>
                    <a href={`tel:${profile.phone}`} className="text-sm hover:underline" style={{ color: INK_MUTED }}>
                      Call to book
                    </a>
                  </li>
                )}
              </ul>
            </div>

            {/* Today's hours — short, scannable: "Open today · 8 AM – 5 PM"
                or "Closed today". Avoids forcing the patient to scroll back
                up to the hours grid to know if they can drop in now. */}
            {hours && Object.keys(hours).length > 0 && (
              <div className="lg:col-span-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] mb-4" style={{ color: INK_MUTED }}>
                  Today
                </p>
                <p className="text-sm leading-[1.55]" style={{ color: INK }}>
                  {todaysHoursLabel(hours)}
                </p>
                <a
                  href={`${basePath}#hours`}
                  className="inline-block mt-2 text-[13px] font-medium hover:underline"
                  style={{ color: brand }}
                >
                  See all hours →
                </a>
              </div>
            )}
          </div>

          {/* Bottom bar — copyright · accessibility · staff login · attribution */}
          <div
            className="mt-14 pt-6 border-t flex flex-col sm:flex-row items-center justify-between gap-3 text-sm"
            style={{ borderColor: BORDER }}
          >
            <span style={{ color: INK_MUTED }}>
              © {new Date().getFullYear()} {name}. All rights reserved.
            </span>
            <div className="flex items-center gap-3" style={{ color: INK_MUTED }}>
              <a href={signIn} className="hover:underline" style={{ color: INK_MUTED }}>
                Staff login
              </a>
              <span aria-hidden="true">·</span>
              <span>
                Powered by{' '}
                <a
                  href="https://dreamcreateweb.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium hover:underline"
                  style={{ color: INK }}
                >
                  DreamCreate
                </a>
              </span>
            </div>
          </div>
        </div>
      </footer>

      {/* ── Sticky mobile booking bar — Book + Call ────────────────────── */}
      {/* Always-visible bottom bar on small screens. Two equal buttons.    */}
      <div
        className="lg:hidden fixed bottom-0 left-0 right-0 z-50 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3"
        style={{
          background: `linear-gradient(to top, ${BG} 60%, ${BG}00)`,
        }}
      >
        <div className="flex gap-2 max-w-md mx-auto">
          <a
            href={bookHref}
            className="flex-1 inline-flex items-center justify-center px-4 py-3.5 rounded-full text-sm font-semibold text-white shadow-lg"
            style={{ backgroundColor: brand }}
          >
            {bookLabel}
          </a>
          {profile.phone && (
            <a
              href={`tel:${profile.phone}`}
              className="inline-flex items-center justify-center w-14 h-[52px] rounded-full shadow-lg"
              style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}`, color: INK }}
              aria-label={`Call ${name}`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
              </svg>
            </a>
          )}
        </div>
      </div>

      {/* Bottom padding to keep content above sticky bar on mobile */}
      <div className="lg:hidden h-20" aria-hidden="true" />
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Testimonial card — shared between the static row (≤3 testimonials) and
// the marquee track (>3). Same warm-neutral card shape used pre-marquee.
// ────────────────────────────────────────────────────────────────────────

// ────────────────────────────────────────────────────────────────────────
// BlobPhoto — the organic-shape photo panel that flanks the hero's center
// text column. Asymmetric border-radius (with a small per-side rotation
// for the right blob) gives the pebble/blob feel without an SVG mask, so
// the whole thing stays server-renderable and degrades cleanly when no
// image is available (the colored panel still anchors the composition).
// ────────────────────────────────────────────────────────────────────────

function BlobPhoto({
  src,
  bg,
  shape,
  aspect,
}: {
  src: string | null
  bg: string
  shape: 'left' | 'right'
  aspect: string
}) {
  // Two slightly different pebble shapes so the left/right blobs don't look
  // like mirror copies — small asymmetry sells the organic vibe.
  const radii =
    shape === 'left'
      ? '62% 38% 55% 45% / 50% 60% 40% 50%'
      : '45% 55% 38% 62% / 60% 50% 50% 40%'
  return (
    <div
      className={`relative overflow-hidden w-full ${aspect}`}
      style={{ borderRadius: radii, backgroundColor: bg }}
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

function TestimonialCard({ t, brand }: { t: ClinicTestimonial; brand: string }) {
  return (
    <figure
      className="rounded-2xl p-7 sm:p-8 flex flex-col h-full transition-transform duration-300 hover:-translate-y-0.5"
      style={{ backgroundColor: BG, border: `1px solid ${BORDER}` }}
    >
      <blockquote
        className="text-[17px] leading-[1.55] flex-1 mb-6"
        style={{ color: INK }}
      >
        &ldquo;{t.quote}&rdquo;
      </blockquote>
      <figcaption className="flex items-center gap-3">
        {t.authorPhotoUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={t.authorPhotoUrl}
            alt=""
            className="w-11 h-11 rounded-full object-cover shrink-0"
          />
        ) : (
          <span
            className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-semibold text-white shrink-0"
            style={{ backgroundColor: brand }}
            aria-hidden="true"
          >
            {t.authorName.charAt(0).toUpperCase()}
          </span>
        )}
        <div>
          <div className="text-sm font-semibold leading-tight" style={{ color: INK }}>
            {t.authorName}
          </div>
          {t.authorLocation && (
            <div className="text-xs mt-0.5" style={{ color: INK_MUTED }}>
              {t.authorLocation}
            </div>
          )}
        </div>
      </figcaption>
    </figure>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Looping marquee — kicks in when a clinic features more than 3
// testimonials. CSS-only continuous scroll:
//   • Cards are rendered twice in the same flex track, then translated
//     from 0 → -50% so the visual cycle is seamless (when the first
//     copy scrolls off, the second copy is exactly where the first
//     started — no perceptible jump).
//   • Duration scales with card count so the perceived scroll speed
//     stays roughly constant whether the clinic features 4 reviews or
//     50 — fast at low counts feels frenetic, slow at high counts
//     feels broken; both anchored to ~8s/card with a 30s floor.
//   • Pause on hover so a patient can stop and read.
//   • Respects prefers-reduced-motion → falls back to a horizontally
//     scrollable strip (touch-friendly, no animation).
//   • Soft gradient edges so cards fade in/out of the viewport instead
//     of clipping abruptly.
// Stays server-renderable (no `'use client'`) — the animation is pure
// CSS so we don't pay a hydration cost on what's otherwise a static page.
// ────────────────────────────────────────────────────────────────────────

function TestimonialsMarquee({
  testimonials,
  brand,
  surface,
}: {
  testimonials: ClinicTestimonial[]
  brand: string
  surface: string
}) {
  // ~12 seconds of stage time per testimonial, with a 60s floor so the
  // perceived repetition stays subdued even at low counts (5 testimonials
  // cycle in a full minute rather than 40 seconds, which felt frenetic
  // and made the "wait, I've seen this one" sensation acute).
  const durationSec = Math.max(60, testimonials.length * 12)
  // Stable suffix so two clinic-site renders on the same page don't fight
  // over CSS class names. Built from the testimonial id list — same data,
  // same hash, so SSR + hydration agree.
  const suffix = stableSuffix(testimonials.map((t) => t.id).join('|'))
  const wrapperClass = `tm-wrap-${suffix}`
  const trackClass = `tm-track-${suffix}`
  // Render each card twice — first set for the visible scroll, second
  // set to bridge the seam so translateX(-50%) lines up perfectly with
  // translateX(0).
  const doubled = [...testimonials, ...testimonials]

  return (
    <>
      <style>{`
        @keyframes ${trackClass} {
          from { transform: translate3d(0, 0, 0); }
          to   { transform: translate3d(-50%, 0, 0); }
        }
        .${trackClass} {
          animation: ${trackClass} ${durationSec}s linear infinite;
          will-change: transform;
        }
        .${wrapperClass}:hover .${trackClass} { animation-play-state: paused; }
        @media (prefers-reduced-motion: reduce) {
          .${trackClass} { animation: none; }
          .${wrapperClass} { overflow-x: auto; }
        }
      `}</style>
      <div
        className={`${wrapperClass} relative overflow-hidden`}
        aria-roledescription="carousel"
        aria-label="Patient testimonials"
      >
        <ul className={`${trackClass} flex gap-6 lg:gap-8 w-max items-stretch`}>
          {doubled.map((t, i) => (
            <li
              key={`${t.id}-${i}`}
              className="w-[300px] sm:w-[340px] lg:w-[380px] shrink-0"
              // The duplicates carry the same DOM but are visually identical;
              // hide them from assistive tech so a screen reader only hears
              // each testimonial once.
              aria-hidden={i >= testimonials.length ? 'true' : undefined}
            >
              <TestimonialCard t={t} brand={brand} />
            </li>
          ))}
        </ul>
        {/* Edge fades — soften the in/out boundary against the section bg. */}
        <div
          className="pointer-events-none absolute inset-y-0 left-0 w-12 sm:w-20"
          style={{ background: `linear-gradient(to right, ${surface}, ${surface}00)` }}
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-12 sm:w-20"
          style={{ background: `linear-gradient(to left, ${surface}, ${surface}00)` }}
          aria-hidden="true"
        />
      </div>
    </>
  )
}

/** Tiny stable hash so the marquee animation/class names are deterministic
 *  across SSR + hydrate (we render in a server component; React would shout
 *  about a mismatch if these names were Math.random()). */
function stableSuffix(input: string): string {
  let h = 0
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0
  }
  return Math.abs(h).toString(36)
}
