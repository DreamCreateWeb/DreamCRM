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
} from '@/lib/clinic-site-helpers'
import { resolveLeadForm, type LeadFormsConfig } from '@/lib/types/lead-forms'
import { EditText, EditImage, EditModal } from '@/components/clinic-site/editable'
import ContactForm from '@/app/site/[slug]/contact-form'
import GoogleRatingBadge, { GOOGLE_RATING_MIN_COUNT } from '@/components/clinic-site/google-rating-badge'
import ScrollReveal from '@/components/clinic-site/scroll-reveal'
import PediatricHeader from './header'
import PediatricFooter from './footer'
import PediatricMobileActions from './mobile-actions'
import { PEDIATRIC_EXTRA_PAGES } from '@/lib/site-templates/pediatric/pages'
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
 * Pediatric homepage — the playful/cartoon register (DESIGN.md variant 3):
 * soft pastels with a bouncy bright accent, rounded everything, inline-SVG
 * clouds/stars (no external assets), parent-focused reassurance copy, and the
 * kids' COLORING CORNER teaser when the clinic has uploaded sheets — the
 * first template surface built on the coloring-pages canon content. Pure
 * presentation from HomePageProps; "Book a Visit" voice.
 */

const DISPLAY = 'var(--font-display, sans-serif)'
const SERVICE_EMOJI = ['🦷', '✨', '🪥', '😁', '🍎', '⭐']

/** Puffy cartoon cloud — pure decor, brand-tinted via currentColor. */
function Cloud({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 44" className={className} aria-hidden="true" fill="currentColor">
      <ellipse cx="30" cy="30" rx="22" ry="13" />
      <ellipse cx="55" cy="22" rx="20" ry="15" />
      <ellipse cx="76" cy="31" rx="18" ry="11" />
    </svg>
  )
}

export default function PediatricHome(props: HomePageProps) {
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
  ].slice(0, 4)
  const carriers = (p.acceptedInsuranceCarriers as string[] | null) ?? []
  const rating = props.googleRating
  const showRating = !!rating && rating.average != null && rating.count >= GOOGLE_RATING_MIN_COUNT
  const navLinks = propsNav(props)

  return (
    <div style={{ background: SITE_BG, color: SITE_INK }}>
      <PediatricHeader
        data={data}
        basePath={basePath}
        navLinks={navLinks}
        bookHref={bookHref}
        bookLabel={bookLabel}
        signInUrl={signInUrl}
      />

      {/* ── Hero — big, round, and reassuring ─────────────────────────────── */}
      <section className="relative overflow-hidden">
        <Cloud className="absolute -left-8 top-10 w-40 opacity-60 pointer-events-none" aria-hidden="true" />
        <Cloud className="absolute right-4 top-24 w-28 opacity-40 pointer-events-none" aria-hidden="true" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-12 sm:pt-16 pb-14 sm:pb-20 grid lg:grid-cols-[6fr_5fr] gap-10 items-center">
          <div>
            <p
              className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-bold mb-5"
              style={{ background: 'var(--c-strip, #E7FB7E)', color: 'var(--c-strip-ink, #1C1A17)' }}
            >
              🎈 {name}
              {p.city ? ` · ${p.city}` : ''}
            </p>
            <EditText
              field="tagline"
              as="h1"
              label="Hero headline"
              className="text-4xl sm:text-6xl font-bold leading-[1.06] mb-5"
              style={{ fontFamily: DISPLAY }}
            >
              {p.tagline ?? 'Happy teeth, happy kids.'}
            </EditText>
            <EditText
              field="copy:pediatricHome.heroStatement"
              as="p"
              label="Hero statement (for parents)"
              className="text-lg leading-relaxed max-w-xl mb-7"
              style={{ color: SITE_INK_MUTED }}
            >
              {copy(
                'pediatricHome.heroStatement',
                'Gentle visits, silly jokes, and zero scary stuff. We help kids actually look forward to the dentist — and give parents straight answers. No judgment, ever.',
              )}
            </EditText>
            <div className="flex flex-wrap items-center gap-3">
              <a
                href={bookHref}
                className="inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-base font-bold shadow-md transition-transform hover:scale-105"
                style={{ background: 'var(--c-brand-strong, #36514c)', color: 'var(--c-brand-ink, #FFFFFF)' }}
              >
                🗓️ {bookLabel}
              </a>
              {p.phone && (
                <a href={`tel:${p.phone}`} className="text-sm font-semibold underline-offset-4 hover:underline" style={{ color: SITE_INK }}>
                  or call {p.phone}
                </a>
              )}
            </div>
            {showRating && (
              <div className="mt-6">
                <GoogleRatingBadge average={rating!.average!} count={rating!.count} headingInk={SITE_INK} variant="hero" />
              </div>
            )}
          </div>

          <EditImage field="heroImageUrl" label="Hero photo" className="relative">
            {p.heroImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.heroImageUrl}
                alt={`${name} — smiles all around`}
                className="w-full aspect-square object-cover rounded-[3rem]"
                style={{ border: `4px solid ${SITE_SURFACE}`, boxShadow: `0 12px 40px -12px var(--c-brand-soft, #EFEAE1)` }}
              />
            ) : (
              <div
                className="w-full aspect-square rounded-[3rem] flex flex-col items-center justify-center gap-3"
                style={{ background: 'var(--c-brand-soft, #EFEAE1)', border: `4px solid ${SITE_SURFACE}` }}
                aria-hidden="true"
              >
                <span className="text-8xl">🦷</span>
                <span className="text-lg font-bold" style={{ fontFamily: DISPLAY, color: 'var(--c-brand-soft-ink, #1C1A17)' }}>
                  Say cheese!
                </span>
              </div>
            )}
          </EditImage>
        </div>
      </section>

      {/* ── Parent-reassurance chips ──────────────────────────────────────── */}
      {chips.length > 0 && (
        <EditModal field="differenceChips" label="Why-us highlights" as="section">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-12 flex flex-wrap justify-center gap-2.5">
            {chips.slice(0, 6).map((c, i) => (
              <span
                key={c}
                className="rounded-full px-4 py-2 text-sm font-semibold"
                style={{
                  background: i % 2 === 0 ? 'var(--c-brand-soft, #EFEAE1)' : 'var(--c-surface-alt, #F4EBDD)',
                  color: SITE_INK,
                }}
              >
                ✅ {c}
              </span>
            ))}
          </div>
        </EditModal>
      )}

      {/* ── Services — bright rounded cards, max 6 ────────────────────────── */}
      {services.length > 0 && (
        <EditModal field="services" label="Services" section="services" as="section">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
            <h2 className="text-3xl sm:text-4xl font-bold text-center mb-10" style={{ fontFamily: DISPLAY }}>
              <EditText field="copy:pediatricHome.servicesHeading" label="Services headline">
                {copy('pediatricHome.servicesHeading', 'What we do (it doesn’t hurt, promise)')}
              </EditText>
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {services.slice(0, 6).map((s, i) => {
                const slug = s.librarySlug || kebab(s.name) || s.id
                return (
                  <ScrollReveal key={s.id} delay={i * 60}>
                    <a
                      href={`${basePath}/services/${slug}`}
                      className="block rounded-3xl p-6 h-full transition-transform hover:-translate-y-1"
                      style={{ background: SITE_SURFACE, border: `2px solid ${SITE_BORDER}` }}
                    >
                      <span className="text-4xl block mb-3" aria-hidden="true">
                        {s.icon || SERVICE_EMOJI[i % SERVICE_EMOJI.length]}
                      </span>
                      <span className="block text-lg font-bold mb-1" style={{ fontFamily: DISPLAY }}>
                        {s.name}
                      </span>
                      {s.description && (
                        <span className="block text-sm" style={{ color: SITE_INK_MUTED }}>
                          {firstSentence(s.description)}
                        </span>
                      )}
                    </a>
                  </ScrollReveal>
                )
              })}
            </div>
            <div className="text-center mt-8">
              <a href={`${basePath}/services`} className="text-sm font-bold underline underline-offset-4" style={{ color: SITE_INK }}>
                See everything we do →
              </a>
            </div>
          </div>
        </EditModal>
      )}

      {/* ── Coloring corner teaser — the coloring-pages canon surface ─────── */}
      {gates.hasColoringPages && (
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-14 sm:pb-20">
          <div
            className="relative overflow-hidden rounded-[2.5rem] px-6 sm:px-12 py-10 sm:py-14 text-center"
            style={{ background: 'var(--c-surface-alt, #F4EBDD)', border: `2px dashed ${SITE_BORDER}` }}
          >
            <span className="text-5xl block mb-4" aria-hidden="true">🖍️</span>
            <h2 className="text-3xl sm:text-4xl font-bold mb-3" style={{ fontFamily: DISPLAY }}>
              <EditText field="copy:pediatricHome.coloringHeading" label="Coloring corner headline">
                {copy('pediatricHome.coloringHeading', 'The coloring corner')}
              </EditText>
            </h2>
            <p className="text-base max-w-xl mx-auto mb-7" style={{ color: SITE_INK_MUTED }}>
              <EditText field="copy:pediatricHome.coloringBlurb" label="Coloring corner blurb">
                {copy(
                  'pediatricHome.coloringBlurb',
                  'Free coloring pages from our team — color them right here on the site, or print them out for the car ride over.',
                )}
              </EditText>
            </p>
            <a
              href={`${basePath}/coloring`}
              className="inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-base font-bold shadow-md transition-transform hover:scale-105"
              style={{ background: 'var(--c-brand-strong, #36514c)', color: 'var(--c-brand-ink, #FFFFFF)' }}
            >
              🎨 Start coloring
            </a>
          </div>
        </section>
      )}

      {/* ── Meet the team — friendly circles ──────────────────────────────── */}
      {staff.length > 0 && (
        <EditModal field="staff" label="Team" section="staff" as="section">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-20" style={{ borderTop: `2px dashed ${SITE_BORDER}` }}>
            <h2 className="text-3xl sm:text-4xl font-bold text-center mb-10" style={{ fontFamily: DISPLAY }}>
              <EditText field="copy:pediatricHome.teamHeading" label="Team headline">
                {copy('pediatricHome.teamHeading', 'The friendly faces your kids will love')}
              </EditText>
            </h2>
            <div className="flex flex-wrap justify-center gap-8">
              {staff.slice(0, 4).map((m) => (
                <div key={m.id} className="text-center w-40">
                  {m.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={m.photoUrl}
                      alt={m.name}
                      className="w-32 h-32 rounded-full object-cover mx-auto mb-3"
                      style={{ border: `4px solid var(--c-brand-soft, #EFEAE1)` }}
                    />
                  ) : (
                    <div
                      className="w-32 h-32 rounded-full mx-auto mb-3 flex items-center justify-center text-4xl"
                      style={{ background: 'var(--c-brand-soft, #EFEAE1)' }}
                      aria-hidden="true"
                    >
                      😊
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
                <a href={`${basePath}/team`} className="text-sm font-bold underline underline-offset-4" style={{ color: SITE_INK }}>
                  Meet everyone →
                </a>
              </div>
            )}
          </div>
        </EditModal>
      )}

      {/* ── Parents' words — speech bubbles ───────────────────────────────── */}
      {testimonials.length > 0 && (
        <EditModal field="testimonials" label="Testimonials" section="testimonials" as="section">
          <div className="py-14 sm:py-20" style={{ background: SITE_SURFACE, borderTop: `2px solid ${SITE_BORDER}`, borderBottom: `2px solid ${SITE_BORDER}` }}>
            <div className="max-w-5xl mx-auto px-4 sm:px-6">
              <h2 className="text-3xl sm:text-4xl font-bold text-center mb-10" style={{ fontFamily: DISPLAY }}>
                <EditText field="copy:pediatricHome.testimonialsHeading" label="Testimonials headline">
                  {copy('pediatricHome.testimonialsHeading', 'Notes from happy parents')}
                </EditText>
              </h2>
              <div className="grid sm:grid-cols-2 gap-6">
                {testimonials.map((t, i) => (
                  <ScrollReveal key={t.id} delay={i * 70}>
                    <figure
                      className="relative rounded-3xl p-6"
                      style={{ background: i % 2 === 0 ? 'var(--c-brand-soft, #EFEAE1)' : 'var(--c-surface-alt, #F4EBDD)' }}
                    >
                      <blockquote className="text-base leading-relaxed mb-3" style={{ color: SITE_INK }}>
                        “{t.quote}”
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
            We take {carriers.slice(0, 3).join(', ')}
            {carriers.length > 3 ? ` and ${carriers.length - 3} more` : ''} —{' '}
            <a href={`${basePath}/insurance`} className="underline underline-offset-4 font-semibold" style={{ color: SITE_INK }}>
              insurance details
            </a>
            .
          </p>
        </section>
      )}

      {/* ── Closing — night-sky band ──────────────────────────────────────── */}
      <section className="mx-4 sm:mx-6 rounded-[2.5rem] overflow-hidden" style={{ background: SITE_DEEP, color: SITE_DEEP_INK }}>
        <div className="max-w-3xl mx-auto px-6 py-16 sm:py-20 text-center">
          <span className="text-4xl block mb-4" aria-hidden="true">🌙✨</span>
          <h2 className="text-3xl sm:text-4xl font-bold mb-3" style={{ fontFamily: DISPLAY }}>
            <EditText field="copy:pediatricHome.closerHeading" label="Closing headline">
              {copy('pediatricHome.closerHeading', 'Ready for a visit that ends in high-fives?')}
            </EditText>
          </h2>
          <p className="text-base mb-8" style={{ color: SITE_DEEP_MUTED }}>
            <EditText field="copy:pediatricHome.closerSub" label="Closing subhead">
              {copy('pediatricHome.closerSub', 'New families welcome — bring the whole crew.')}
            </EditText>
          </p>
          <a
            href={bookHref}
            className="inline-flex items-center gap-2 rounded-full px-8 py-4 text-base font-bold transition-transform hover:scale-105"
            style={{ background: SITE_DEEP_INK, color: SITE_DEEP }}
          >
            🗓️ {bookLabel}
          </a>
        </div>
      </section>

      {/* ── Contact form — basic tier only (bookHref targets #contact) ────── */}
      {!gates.isPro && (
        <section id="contact" className="max-w-2xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
          <h2 className="text-3xl font-bold mb-2 text-center" style={{ fontFamily: DISPLAY }}>
            Say hello 👋
          </h2>
          <p className="text-sm text-center mb-8" style={{ color: SITE_INK_MUTED }}>
            Tell us about your kiddo and we’ll get right back to you.
          </p>
          <ContactForm
            slug={data.slug}
            brand={p.brandColor ?? '#17BEBB'}
            isPro={gates.isPro}
            basePath={basePath}
            fields={resolveLeadForm(p.leadForms as LeadFormsConfig | null, 'contact')}
            services={services.length > 0 ? services.map((s) => s.name) : null}
            carriers={carriers.length > 0 ? carriers : null}
          />
        </section>
      )}

      <PediatricFooter
        data={data}
        basePath={basePath}
        navLinks={navLinks}
        bookHref={bookHref}
        bookLabel={bookLabel}
        signInUrl={signInUrl}
      />
      <PediatricMobileActions data={data} basePath={basePath} bookHref={bookHref} bookLabel={bookLabel} />
    </div>
  )
}

// Same helper + gates the shells use, INCLUDING this template's own declared
// marketing pages (the coloring corner), so Home's nav matches the subpages.
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
    extraPages: PEDIATRIC_EXTRA_PAGES,
    extraGates: {
      isPro: props.gates.isPro,
      selfBooking: props.gates.selfBooking,
      hasColoringPages: props.gates.hasColoringPages,
    },
  })
}
