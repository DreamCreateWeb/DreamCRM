import type {
  ClinicService,
  ClinicStaff,
  ClinicTestimonial,
} from '@/lib/types/clinic-content'
import type { HomePageProps } from '@/lib/site-templates/page-props'
import {
  firstSentence,
  copyOverride,
  kebab,
  buildClinicNavLinks,
  navServicesFromClinicServices,
  type SiteNavLink,
  type HoursMap,
  DAYS,
  DAY_LABEL,
  fmt12,
} from '@/lib/clinic-site-helpers'
import { resolveLeadForm, type LeadFormsConfig } from '@/lib/types/lead-forms'
import { EditText, EditImage, EditModal } from '@/components/clinic-site/editable'
import ContactForm from '@/app/site/[slug]/contact-form'
import GoogleRatingBadge, { GOOGLE_RATING_MIN_COUNT } from '@/components/clinic-site/google-rating-badge'
import ScrollReveal from '@/components/clinic-site/scroll-reveal'
import HometownHeader from './header'
import HometownFooter from './footer'
import HometownMobileActions from './mobile-actions'
import {
  SITE_BG,
  SITE_INK,
  SITE_INK_MUTED,
  SITE_SURFACE,
  SITE_BORDER,
  SITE_DEEP,
  SITE_DEEP_INK,
  SITE_DEEP_MUTED,
} from '@/components/clinic-site/tokens'

/**
 * Hometown homepage — the trusted local practice, designed to look FINISHED
 * with zero photography: a deep full-width brand hero (subtle plus-grid
 * texture, serif welcome, checkmark clarity) beside the signature marigold
 * contact/hours card, then calm information-first bands. Every image slot is
 * optional decoration, never load-bearing — the day-0 clinic ships a complete
 * site. Pure presentation from HomePageProps; "Schedule a Visit" voice.
 */

const DISPLAY = 'var(--font-display, serif)'
const SERVICE_ICONS = ['🦷', '😁', '🪥', '✨', '🛡️', '📋']

/** The hero's quiet plus-grid texture — pure decor, one SVG pattern. */
function PlusGrid({ className }: { className?: string }) {
  return (
    <svg className={className} aria-hidden="true" style={{ color: 'currentcolor' }}>
      <defs>
        <pattern id="ht-plus" width="56" height="56" patternUnits="userSpaceOnUse">
          <path d="M28 22v12M22 28h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.07" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#ht-plus)" />
    </svg>
  )
}

/** Gentle full-width wave seam out of the hero — the one flourish. */
function Wave({ fill }: { fill: string }) {
  return (
    <svg
      viewBox="0 0 1440 48"
      preserveAspectRatio="none"
      aria-hidden="true"
      className="block w-full h-8 sm:h-12"
      style={{ fill }}
    >
      <path d="M0 12c240 44 480 44 720 20S1200-8 1440 20v28H0z" />
    </svg>
  )
}

/** Checkmark bullet — the template's signature glyph. */
function Check({ tint }: { tint: string }) {
  return (
    <svg viewBox="0 0 20 20" className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" style={{ color: tint }}>
      <circle cx="10" cy="10" r="9" fill="currentColor" opacity="0.25" />
      <path d="M6 10.5l2.6 2.6L14 7.5" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Centered section heading with the classic short rule underneath. */
function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-center mb-10">
      <h2 className="text-3xl sm:text-4xl font-bold" style={{ fontFamily: DISPLAY }}>
        {children}
      </h2>
      <span
        className="block w-14 h-1 rounded-full mx-auto mt-4"
        style={{ background: 'var(--c-strip, #E8A33D)' }}
        aria-hidden="true"
      />
    </div>
  )
}

export default function HometownHome(props: HomePageProps) {
  const { data, basePath, signInUrl, gates, bookHref, bookLabel } = props
  const p = data.profile
  const name = p.displayName ?? data.orgName
  const overrides = (p.copyOverrides as Record<string, string> | null) ?? {}
  const copy = (key: string, fallback: string) => copyOverride(overrides, key, fallback)

  const staff = (p.staff as ClinicStaff[] | null) ?? []
  const services = ((p.services as ClinicService[] | null) ?? []).filter((s) => s.name?.trim())
  const chips = ((p.differenceChips as string[] | null) ?? []).filter((c) => c?.trim())
  const testimonials = [
    ...(((p.testimonials as ClinicTestimonial[] | null) ?? []).filter((t) => t.quote?.trim())),
    ...props.featuredGoogleReviews,
  ].slice(0, 3)
  const carriers = (p.acceptedInsuranceCarriers as string[] | null) ?? []
  const hours = (p.hours as HoursMap | null) ?? null
  const rating = props.googleRating
  const showRating = !!rating && rating.average != null && rating.count >= GOOGLE_RATING_MIN_COUNT
  const navLinks = propsNav(props)

  return (
    <div style={{ background: SITE_BG, color: SITE_INK }}>
      <HometownHeader
        data={data}
        basePath={basePath}
        navLinks={navLinks}
        bookHref={bookHref}
        bookLabel={bookLabel}
        signInUrl={signInUrl}
      />

      {/* ── Hero — deep brand wash, no photo needed, ever ─────────────────── */}
      <section className="relative overflow-hidden" style={{ background: SITE_DEEP, color: SITE_DEEP_INK }}>
        <PlusGrid className="absolute inset-0 w-full h-full pointer-events-none" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-12 sm:pt-16 pb-16 sm:pb-20 grid lg:grid-cols-[7fr_5fr] gap-10 lg:gap-14 items-start">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] mb-4" style={{ color: SITE_DEEP_MUTED }}>
              {name}
              {p.city ? ` · ${p.city}${p.state ? `, ${p.state}` : ''}` : ''}
            </p>
            <EditText
              field="tagline"
              as="h1"
              label="Hero headline"
              className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.08] mb-5"
              style={{ fontFamily: DISPLAY }}
            >
              {p.tagline ?? `Welcome to ${name}`}
            </EditText>
            <EditText
              field="copy:hometownHome.heroIntro"
              as="p"
              label="Hero introduction"
              className="text-lg leading-relaxed max-w-xl mb-7"
              style={{ color: SITE_DEEP_MUTED }}
            >
              {copy(
                'hometownHome.heroIntro',
                'If you’re looking for a dental practice that treats your whole family like neighbors — because you are — you’ve found it. Honest recommendations, comfortable visits, and a team that remembers your name.',
              )}
            </EditText>
            {chips.length > 0 && (
              <EditModal field="differenceChips" label="Why-us highlights" as="ul" className="space-y-2.5 mb-8">
                {chips.slice(0, 4).map((c) => (
                  <li key={c} className="flex items-start gap-3 text-base font-medium">
                    <Check tint="var(--c-strip, #E8A33D)" />
                    <span>{c}</span>
                  </li>
                ))}
              </EditModal>
            )}
            <div className="flex flex-wrap items-center gap-4">
              <a
                href={bookHref}
                className="inline-flex items-center rounded-md px-7 py-3.5 text-base font-bold shadow-sm"
                style={{ background: 'var(--c-strip, #E8A33D)', color: 'var(--c-strip-ink, #27303B)' }}
              >
                {bookLabel}
              </a>
              {p.phone && (
                <a href={`tel:${p.phone}`} className="text-base font-semibold underline-offset-4 hover:underline">
                  or call {p.phone}
                </a>
              )}
            </div>
            {showRating && (
              <div className="mt-6">
                <GoogleRatingBadge average={rating!.average!} count={rating!.count} headingInk={SITE_DEEP_INK} variant="hero" />
              </div>
            )}
          </div>

          {/* The signature contact/hours card — phone + hours readable from
              across the room. This card IS the hero image. */}
          <aside
            className="rounded-xl p-6 sm:p-7 shadow-xl"
            style={{ background: 'var(--c-strip, #E8A33D)', color: 'var(--c-strip-ink, #27303B)' }}
          >
            <h2 className="text-xl sm:text-2xl font-bold text-center leading-snug mb-4" style={{ fontFamily: DISPLAY }}>
              <EditText field="copy:hometownHome.hoursCardHeading" label="Contact card heading">
                {copy('hometownHome.hoursCardHeading', 'Schedule your visit with us today')}
              </EditText>
            </h2>
            {p.phone && (
              <a href={`tel:${p.phone}`} className="block text-center text-2xl sm:text-3xl font-bold mb-4 underline-offset-4 hover:underline">
                {p.phone}
              </a>
            )}
            <div className="text-center mb-5">
              <a
                href={bookHref}
                className="inline-flex items-center rounded-md px-6 py-3 text-sm font-bold shadow-sm"
                style={{ background: 'var(--c-brand-strong, #1F4E79)', color: 'var(--c-brand-ink, #FFFFFF)' }}
              >
                Request an appointment
              </a>
            </div>
            <div className="rounded-lg px-5 py-4" style={{ background: SITE_DEEP, color: SITE_DEEP_INK }}>
              <h3 className="text-sm font-bold uppercase tracking-wide text-center mb-3">Office hours</h3>
              {hours ? (
                <ul className="grid grid-cols-1 min-[460px]:grid-cols-2 gap-x-6 gap-y-1.5 text-[13px]">
                  {DAYS.map((day) => {
                    const h = hours[day]
                    return (
                      <li key={day} className="flex justify-between gap-3">
                        <span className="font-semibold" style={{ color: SITE_DEEP_MUTED }}>
                          {DAY_LABEL[day].slice(0, 3).toUpperCase()}
                        </span>
                        <span className="whitespace-nowrap">
                          {h && !h.closed && h.open && h.close ? `${fmt12(h.open)} – ${fmt12(h.close)}` : 'Closed'}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="text-sm text-center" style={{ color: SITE_DEEP_MUTED }}>
                  Call us for current hours.
                </p>
              )}
            </div>
          </aside>
        </div>
        <Wave fill={SITE_BG} />
      </section>

      {/* ── Services — calm information-first cards ───────────────────────── */}
      {services.length > 0 && (
        <EditModal field="services" label="Services" section="services" as="section">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-18">
            <SectionHeading>
              <EditText field="copy:hometownHome.servicesHeading" label="Services headline">
                {copy('hometownHome.servicesHeading', 'Our dental services')}
              </EditText>
            </SectionHeading>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {services.slice(0, 6).map((s, i) => {
                const slug = s.librarySlug || kebab(s.name) || s.id
                return (
                  <ScrollReveal key={s.id} delay={i * 50}>
                    <a
                      href={`${basePath}/services/${slug}`}
                      className="block rounded-lg p-6 h-full transition-shadow hover:shadow-md"
                      style={{ background: SITE_SURFACE, border: `1px solid ${SITE_BORDER}`, color: SITE_INK }}
                    >
                      <span
                        className="inline-flex items-center justify-center w-12 h-12 rounded-full text-2xl mb-4"
                        style={{ background: 'var(--c-brand-soft, #E4EAF2)' }}
                        aria-hidden="true"
                      >
                        {s.icon || SERVICE_ICONS[i % SERVICE_ICONS.length]}
                      </span>
                      <span className="block text-lg font-bold mb-1.5" style={{ fontFamily: DISPLAY }}>
                        {s.name}
                      </span>
                      {s.description && (
                        <span className="block text-sm leading-relaxed" style={{ color: SITE_INK_MUTED }}>
                          {firstSentence(s.description)}
                        </span>
                      )}
                    </a>
                  </ScrollReveal>
                )
              })}
            </div>
            <div className="text-center mt-9">
              <a
                href={`${basePath}/services`}
                className="text-sm font-bold underline underline-offset-4"
                style={{ color: 'var(--c-heading, #1F4E79)' }}
              >
                See all services →
              </a>
            </div>
          </div>
        </EditModal>
      )}

      {/* ── About band — plain talk where other templates put photos ──────── */}
      <section className="py-14 sm:py-18" style={{ background: 'var(--c-surface-alt, #E9EDF3)' }}>
        <div className={`max-w-6xl mx-auto px-4 sm:px-6 grid gap-10 items-center ${p.heroImageUrl ? 'lg:grid-cols-[6fr_5fr]' : 'max-w-3xl text-center'}`}>
          <div>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4" style={{ fontFamily: DISPLAY }}>
              <EditText field="copy:hometownHome.aboutHeading" label="About headline">
                {copy('hometownHome.aboutHeading', 'Straightforward care from people who know you')}
              </EditText>
            </h2>
            <p className="text-base sm:text-lg leading-relaxed" style={{ color: SITE_INK_MUTED }}>
              <EditText field="copy:hometownHome.aboutBody" label="About paragraph">
                {copy(
                  'hometownHome.aboutBody',
                  'No upsells, no mystery bills, no rushing you out of the chair. We explain what we see, tell you what can wait, and treat the schedule like a promise. That’s how a practice earns a family for decades — one honest visit at a time.',
                )}
              </EditText>
            </p>
            <div className="mt-6">
              <a
                href={`${basePath}/about`}
                className="text-sm font-bold underline underline-offset-4"
                style={{ color: 'var(--c-heading, #1F4E79)' }}
              >
                More about our practice →
              </a>
            </div>
          </div>
          {p.heroImageUrl && (
            <EditImage field="heroImageUrl" label="Practice photo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.heroImageUrl}
                alt={`Inside ${name}`}
                className="w-full aspect-[4/3] object-cover rounded-xl"
                style={{ border: `1px solid ${SITE_BORDER}` }}
              />
            </EditImage>
          )}
        </div>
      </section>

      {/* ── Team — classic circles, initials when no photo ────────────────── */}
      {staff.length > 0 && (
        <EditModal field="staff" label="Team" section="staff" as="section">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-18">
            <SectionHeading>Meet our team</SectionHeading>
            <div className="flex flex-wrap justify-center gap-8">
              {staff.slice(0, 4).map((m) => (
                <div key={m.id} className="text-center w-40">
                  {m.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={m.photoUrl}
                      alt={m.name}
                      className="w-28 h-28 rounded-full object-cover mx-auto mb-3"
                      style={{ border: `3px solid ${SITE_BORDER}` }}
                    />
                  ) : (
                    <div
                      className="w-28 h-28 rounded-full mx-auto mb-3 flex items-center justify-center text-2xl font-bold"
                      style={{ background: 'var(--c-brand-soft, #E4EAF2)', color: 'var(--c-brand-soft-ink, #1F4E79)', fontFamily: DISPLAY }}
                      aria-hidden="true"
                    >
                      {m.name
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((w) => w[0])
                        .join('')
                        .toUpperCase()}
                    </div>
                  )}
                  <span className="block text-base font-bold" style={{ fontFamily: DISPLAY }}>
                    {m.name}
                  </span>
                  {m.title && (
                    <span className="block text-sm" style={{ color: SITE_INK_MUTED }}>
                      {m.title}
                    </span>
                  )}
                </div>
              ))}
            </div>
            {gates.hasTeam && (
              <div className="text-center mt-8">
                <a
                  href={`${basePath}/team`}
                  className="text-sm font-bold underline underline-offset-4"
                  style={{ color: 'var(--c-heading, #1F4E79)' }}
                >
                  Meet everyone →
                </a>
              </div>
            )}
          </div>
        </EditModal>
      )}

      {/* ── Testimonials — classic centered quotes ────────────────────────── */}
      {testimonials.length > 0 && (
        <EditModal field="testimonials" label="Testimonials" section="testimonials" as="section">
          <div className="py-14 sm:py-18" style={{ background: SITE_SURFACE, borderTop: `1px solid ${SITE_BORDER}`, borderBottom: `1px solid ${SITE_BORDER}` }}>
            <div className="max-w-6xl mx-auto px-4 sm:px-6">
              <SectionHeading>
                <EditText field="copy:hometownHome.testimonialsHeading" label="Testimonials headline">
                  {copy('hometownHome.testimonialsHeading', 'Kind words from our patients')}
                </EditText>
              </SectionHeading>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {testimonials.map((t, i) => (
                  <ScrollReveal key={t.id} delay={i * 60}>
                    <figure
                      className="h-full rounded-lg p-6"
                      style={{ background: SITE_BG, border: `1px solid ${SITE_BORDER}` }}
                    >
                      <span className="block text-4xl leading-none mb-3" style={{ color: 'var(--c-strip, #E8A33D)', fontFamily: DISPLAY }} aria-hidden="true">
                        “
                      </span>
                      <blockquote className="text-base leading-relaxed mb-4" style={{ color: SITE_INK }}>
                        {t.quote}
                      </blockquote>
                      <figcaption className="text-sm font-bold" style={{ color: SITE_INK_MUTED }}>
                        — {t.authorName}
                      </figcaption>
                    </figure>
                  </ScrollReveal>
                ))}
              </div>
            </div>
          </div>
        </EditModal>
      )}

      {/* ── Insurance one-liner ───────────────────────────────────────────── */}
      {carriers.length > 0 && (
        <section className="max-w-6xl mx-auto px-4 sm:px-6 py-10 text-center">
          <p className="text-sm" style={{ color: SITE_INK_MUTED }}>
            We accept {carriers.slice(0, 3).join(', ')}
            {carriers.length > 3 ? ` and ${carriers.length - 3} more` : ''} —{' '}
            <a href={`${basePath}/insurance`} className="underline underline-offset-4 font-semibold" style={{ color: SITE_INK }}>
              insurance details
            </a>
            .
          </p>
        </section>
      )}

      {/* ── Contact form — basic tier only (bookHref targets #contact) ────── */}
      {!gates.isPro && (
        <section id="contact" className="max-w-2xl mx-auto px-4 sm:px-6 py-14 sm:py-18">
          <SectionHeading>Request an appointment</SectionHeading>
          <p className="text-sm text-center -mt-6 mb-8" style={{ color: SITE_INK_MUTED }}>
            Tell us a good time and we’ll call you back to confirm.
          </p>
          <ContactForm
            slug={data.slug}
            brand={p.brandColor ?? '#1F4E79'}
            isPro={gates.isPro}
            basePath={basePath}
            fields={resolveLeadForm(p.leadForms as LeadFormsConfig | null, 'contact')}
            services={services.length > 0 ? services.map((s) => s.name) : null}
            carriers={carriers.length > 0 ? carriers : null}
          />
        </section>
      )}

      <HometownFooter
        data={data}
        basePath={basePath}
        navLinks={navLinks}
        bookHref={bookHref}
        bookLabel={bookLabel}
        signInUrl={signInUrl}
      />
      <HometownMobileActions data={data} basePath={basePath} bookHref={bookHref} bookLabel={bookLabel} />
    </div>
  )
}

// Same helper + gates the shells use, so Home's nav matches the subpages.
function propsNav(props: HomePageProps): SiteNavLink[] {
  const services = ((props.data.profile.services as ClinicService[] | null) ?? []).filter(
    (s) => s.name?.trim(),
  )
  return buildClinicNavLinks({
    basePath: props.basePath,
    hasBlog: props.gates.hasBlog,
    hasDentalPlans: props.gates.hasDentalPlans,
    hasTeam: props.gates.hasTeam,
    hasCareers: props.gates.hasCareers,
    services: navServicesFromClinicServices(services),
    extraGates: {
      isPro: props.gates.isPro,
      selfBooking: props.gates.selfBooking,
      hasColoringPages: props.gates.hasColoringPages,
    },
  })
}
