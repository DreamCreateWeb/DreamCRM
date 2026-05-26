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

interface HourEntry { open?: string; close?: string; closed?: boolean }
type HoursMap = Record<string, HourEntry>

interface Props {
  data: ClinicSiteData
  /** Base path for internal links — used so server renders correctly under /site/[slug] */
  basePath: string
  /** Whether the clinic has at least one published blog post — gates the Blog nav link. */
  hasBlog?: boolean
}

export default function ModernTemplate({ data, basePath, hasBlog = false }: Props) {
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
  const testimonials: ClinicTestimonial[] =
    ((profile.testimonials as ClinicTestimonial[] | null) ?? []).slice(0, 6)
  const officePhotos: ClinicOfficePhoto[] =
    ((profile.officePhotos as ClinicOfficePhoto[] | null) ?? []).slice(0, 8)
  const bookHref = isPro ? `${basePath}/book` : `${basePath}#contact`
  const bookLabel = 'Book a Visit'

  return (
    <div
      className="min-h-screen font-inter antialiased"
      style={{ backgroundColor: BG, color: INK }}
    >

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-40 backdrop-blur-md border-b"
        style={{ backgroundColor: `${BG}EE`, borderColor: BORDER }}
      >
        <div className="max-w-[1240px] mx-auto px-5 sm:px-8 h-[72px] flex items-center justify-between gap-4">
          <a href={basePath} className="flex items-center gap-3 min-w-0">
            {logoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={logoUrl}
                alt={name}
                className="w-10 h-10 rounded-lg object-cover shrink-0"
              />
            ) : (
              <span
                className="flex items-center justify-center w-10 h-10 rounded-lg text-white text-base font-bold shrink-0"
                style={{ backgroundColor: brand }}
              >
                {name.charAt(0).toUpperCase()}
              </span>
            )}
            <span className="font-semibold text-[17px] leading-tight truncate" style={{ color: INK }}>
              {name}
            </span>
          </a>
          <div className="flex items-center gap-2 sm:gap-4">
            {hasBlog && (
              <a
                href={`${basePath}/blog`}
                className="hidden sm:inline-flex items-center text-sm font-medium px-3 py-2 rounded-lg transition hover:bg-[#F1ECE3]"
                style={{ color: INK_MUTED }}
              >
                Blog
              </a>
            )}
            {profile.phone && (
              <a
                href={`tel:${profile.phone}`}
                className="hidden sm:inline-flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg transition hover:bg-[#F1ECE3]"
                style={{ color: INK_MUTED }}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                </svg>
                {profile.phone}
              </a>
            )}
            <a
              href={bookHref}
              className="inline-flex items-center px-5 py-2.5 rounded-full text-sm font-semibold text-white shadow-sm transition hover:shadow-md hover:opacity-95"
              style={{ backgroundColor: brand }}
            >
              {bookLabel}
            </a>
          </div>
        </div>
      </header>

      {/* ── Hero — one viewport, photo + warm overlay or copy-primacy ──── */}
      <section className="relative overflow-hidden">
        {heroImageUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={heroImageUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
            {/* Warm gradient overlay that keeps the photo present but ensures copy contrast */}
            <div
              className="absolute inset-0"
              style={{
                background: `linear-gradient(105deg, ${BG} 0%, ${BG}F2 35%, ${BG}80 60%, transparent 100%)`,
              }}
            />
          </>
        ) : (
          // No-photo state: warm panel + subtle radial accent in brand color
          <div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(ellipse at 80% 50%, ${brand}14 0%, transparent 60%)`,
            }}
          />
        )}
        <div className="relative max-w-[1240px] mx-auto px-5 sm:px-8 py-24 sm:py-32 lg:py-40">
          <div className="max-w-[640px]">
            {(primaryLocation?.city || profile.city) && (
              <p
                className="text-xs font-semibold uppercase tracking-[0.16em] mb-6"
                style={{ color: brand }}
              >
                {primaryLocation?.city
                  ? `${primaryLocation.city}, ${primaryLocation.state}`
                  : `${profile.city}, ${profile.state}`}
              </p>
            )}
            <h1
              className="text-[44px] sm:text-[56px] lg:text-[64px] font-bold leading-[1.05] tracking-[-0.02em] mb-6"
              style={{ color: INK }}
            >
              {name}
            </h1>
            <p
              className="text-lg sm:text-xl leading-[1.55] mb-10 max-w-[520px]"
              style={{ color: INK_MUTED }}
            >
              {profile.tagline ?? 'No judgment, ever. Just better dental care.'}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <a
                href={bookHref}
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full text-base font-semibold text-white shadow-md transition hover:shadow-lg hover:opacity-95"
                style={{ backgroundColor: brand }}
              >
                {bookLabel}
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </a>
              {profile.phone && (
                <a
                  href={`tel:${profile.phone}`}
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full text-base font-medium border transition hover:bg-white"
                  style={{ color: INK, borderColor: BORDER, backgroundColor: 'transparent' }}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                  </svg>
                  {profile.phone}
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Stat anchors — trust signals immediately after hero ────────── */}
      {stats.length > 0 && (
        <section className="py-12 sm:py-16 border-y" style={{ borderColor: BORDER }}>
          <div className="max-w-[1240px] mx-auto px-5 sm:px-8">
            <div
              className={`grid gap-8 sm:gap-12 ${
                stats.length === 4
                  ? 'grid-cols-2 lg:grid-cols-4'
                  : stats.length === 3
                    ? 'grid-cols-1 sm:grid-cols-3'
                    : stats.length === 2
                      ? 'grid-cols-1 sm:grid-cols-2 max-w-3xl mx-auto'
                      : 'grid-cols-1 max-w-md mx-auto'
              }`}
            >
              {stats.map((s) => (
                <div key={s.id} className="text-center sm:text-left">
                  <div
                    className="text-3xl sm:text-4xl font-bold leading-none mb-2 tracking-[-0.02em]"
                    style={{ color: brand }}
                  >
                    {s.value}
                  </div>
                  <div
                    className="text-sm sm:text-[15px] leading-snug"
                    style={{ color: INK_MUTED }}
                  >
                    {s.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Services — numbered pillars ────────────────────────────────── */}
      <section className="py-20 sm:py-28" style={{ backgroundColor: SURFACE }}>
        <div className="max-w-[1240px] mx-auto px-5 sm:px-8">
          <div className="max-w-[640px] mb-14">
            <p
              className="text-xs font-semibold uppercase tracking-[0.16em] mb-4"
              style={{ color: brand }}
            >
              What we do
            </p>
            <h2
              className="text-3xl sm:text-4xl lg:text-[44px] font-bold leading-[1.1] tracking-[-0.02em]"
              style={{ color: INK }}
            >
              Comprehensive dental care, gently delivered.
            </h2>
          </div>
          <div className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((s, i) => (
              <div key={s.id} className="flex flex-col">
                <span
                  className="text-sm font-semibold tracking-[0.12em] mb-4"
                  style={{ color: brand }}
                >
                  {String(i + 1).padStart(2, '0')}
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
        <section className="py-20 sm:py-28">
          <div className="max-w-[1240px] mx-auto px-5 sm:px-8">
            <div className="max-w-[640px] mb-14">
              <p
                className="text-xs font-semibold uppercase tracking-[0.16em] mb-4"
                style={{ color: brand }}
              >
                Our team
              </p>
              <h2
                className="text-3xl sm:text-4xl lg:text-[44px] font-bold leading-[1.1] tracking-[-0.02em]"
                style={{ color: INK }}
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
                <div key={s.id} className="flex flex-col">
                  <div
                    className="aspect-[4/5] w-full rounded-2xl overflow-hidden mb-5"
                    style={{ backgroundColor: BORDER }}
                  >
                    {s.photoUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={s.photoUrl} alt={s.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-5xl opacity-30">
                        👤
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
                className="text-3xl sm:text-4xl lg:text-[44px] font-bold leading-[1.1] tracking-[-0.02em]"
                style={{ color: INK }}
              >
                Patients on the experience.
              </h2>
            </div>
            <div
              className={`grid gap-6 lg:gap-8 ${
                testimonials.length >= 3
                  ? 'md:grid-cols-3'
                  : testimonials.length === 2
                    ? 'md:grid-cols-2 max-w-4xl'
                    : 'max-w-2xl'
              }`}
            >
              {testimonials.slice(0, 3).map((t) => (
                <figure
                  key={t.id}
                  className="rounded-2xl p-7 sm:p-8 flex flex-col"
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
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── About ──────────────────────────────────────────────────────── */}
      {profile.about && (
        <section className="py-20 sm:py-28" style={{ backgroundColor: SURFACE }}>
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
                className="text-3xl sm:text-4xl lg:text-[44px] font-bold leading-[1.1] tracking-[-0.02em]"
                style={{ color: INK }}
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
                <figure key={p.id}>
                  <div
                    className="overflow-hidden rounded-2xl"
                    style={{ backgroundColor: BORDER }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.url}
                      alt={p.alt ?? ''}
                      className="w-full aspect-[4/5] object-cover"
                      loading="lazy"
                    />
                  </div>
                  {p.caption && (
                    <figcaption className="mt-3 text-sm" style={{ color: INK_MUTED }}>
                      {p.caption}
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
        <section className="py-20 sm:py-28">
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
              className="text-3xl sm:text-4xl lg:text-[44px] font-bold leading-[1.1] tracking-[-0.02em] mb-5"
              style={{ color: INK }}
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
        <div className="max-w-[1240px] mx-auto px-5 sm:px-8 py-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm">
          <div style={{ color: INK_MUTED }}>
            © {new Date().getFullYear()} {name}.
            {profile.phone && <span className="ml-2">{profile.phone}</span>}
          </div>
          <div style={{ color: INK_MUTED }}>
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
