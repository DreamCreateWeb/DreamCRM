import type {
  ClinicService,
  ClinicStaff,
  ClinicTestimonial,
  ClinicOfficePhoto,
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
import CosmeticHeader from './header'
import CosmeticFooter from './footer'
import CosmeticMobileActions from './mobile-actions'
import { cosmeticAccentInk } from '@/lib/site-templates/cosmetic/palette'
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
 * Cosmetic/Luxury homepage — the editorial register (DESIGN.md variant 2):
 * charcoal + cream, serif-italic display accents, magazine rhythm,
 * doctor-as-hero, "Book a Consultation" voice, and NO pricing anywhere on
 * this surface (dental-plans/shop remain reachable pages; luxury just never
 * leads with money). Pure presentation: everything renders from the
 * universal content canon via HomePageProps — no service imports.
 */

const DISPLAY = 'var(--font-display, Georgia, serif)'

/** The doctor the hero features: first credentialed staff member, else the
 *  first staff member at all. Cosmetic practices are doctor-brands — the
 *  person IS the product. */
export function pickHeroDoctor(staff: ClinicStaff[]): ClinicStaff | null {
  if (staff.length === 0) return null
  const credentialed = staff.find((s) =>
    /\b(DDS|DMD|Dr\.?)\b/i.test(`${s.name} ${s.title ?? ''}`),
  )
  return credentialed ?? staff[0]
}

export default function CosmeticHome(props: HomePageProps) {
  const { data, basePath, signInUrl, gates, bookHref, bookLabel } = props
  const p = data.profile
  const name = p.displayName ?? data.orgName
  const overrides = (p.copyOverrides as Record<string, string> | null) ?? {}
  const copy = (key: string, fallback: string) => copyOverride(overrides, key, fallback)

  const staff = (p.staff as ClinicStaff[] | null) ?? []
  const services = ((p.services as ClinicService[] | null) ?? []).filter((s) => s.name?.trim())
  const testimonials = [
    ...(((p.testimonials as ClinicTestimonial[] | null) ?? []).filter((t) => t.quote?.trim())),
    ...props.featuredGoogleReviews,
  ].slice(0, 4)
  const officePhotos = ((p.officePhotos as ClinicOfficePhoto[] | null) ?? []).filter((o) => o.url)
  const carriers = (p.acceptedInsuranceCarriers as string[] | null) ?? []
  const accent = cosmeticAccentInk(p.brandColor)

  const heroDoctor = pickHeroDoctor(staff)
  const heroPhoto = heroDoctor?.photoUrl ?? p.heroImageUrl ?? null
  const rating = props.googleRating
  const showRating = !!rating && rating.average != null && rating.count >= GOOGLE_RATING_MIN_COUNT
  const navLinks = propsNav(props)

  return (
    <div style={{ background: SITE_BG, color: SITE_INK }}>
      <CosmeticHeader
        data={data}
        basePath={basePath}
        navLinks={navLinks}
        bookHref={bookHref}
        bookLabel={bookLabel}
        signInUrl={signInUrl}
      />

      {/* ── Editorial hero — doctor as the subject ─────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-14 sm:pt-20 pb-16 sm:pb-24">
        <div className="grid lg:grid-cols-[7fr_5fr] gap-10 lg:gap-16 items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] mb-5" style={{ color: accent }}>
              {name}
              {p.city ? ` · ${p.city}` : ''}
            </p>
            <EditText
              field="tagline"
              as="h1"
              label="Hero headline"
              className="text-4xl sm:text-6xl leading-[1.05] mb-6"
              style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontWeight: 500 }}
            >
              {p.tagline ?? 'Dentistry, elevated to an art.'}
            </EditText>
            <EditText
              field="copy:cosmeticHome.heroStatement"
              as="p"
              label="Hero statement"
              className="text-lg leading-relaxed max-w-xl mb-8"
              style={{ color: SITE_INK_MUTED }}
            >
              {copy(
                'cosmeticHome.heroStatement',
                'Unhurried appointments, meticulous craft, and a plan built around your face — never a template. No judgment, ever.',
              )}
            </EditText>
            <div className="flex flex-wrap items-center gap-4">
              <a
                href={bookHref}
                className="inline-flex items-center rounded-full px-7 py-3.5 text-sm font-semibold transition-transform hover:scale-[1.02]"
                style={{ background: SITE_DEEP, color: SITE_DEEP_INK }}
              >
                {bookLabel}
              </a>
              {p.phone && (
                <a href={`tel:${p.phone}`} className="text-sm underline-offset-4 hover:underline" style={{ color: SITE_INK }}>
                  or call {p.phone}
                </a>
              )}
            </div>
            {showRating && (
              <div className="mt-7">
                <GoogleRatingBadge average={rating!.average!} count={rating!.count} headingInk={SITE_INK} variant="hero" />
              </div>
            )}
          </div>

          <EditImage field="heroImageUrl" label="Hero photo" className="relative">
            {heroPhoto ? (
              <figure className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={heroPhoto}
                  alt={heroDoctor ? heroDoctor.name : `${name} — the practice`}
                  className="w-full aspect-[4/5] object-cover rounded-t-[999px]"
                  style={{ border: `1px solid ${SITE_BORDER}` }}
                />
                {heroDoctor && (
                  <figcaption className="mt-4 text-center">
                    <span className="block text-base" style={{ fontFamily: DISPLAY, fontWeight: 600 }}>
                      {heroDoctor.name}
                    </span>
                    {heroDoctor.title && (
                      <span className="block text-sm mt-0.5" style={{ color: SITE_INK_MUTED }}>
                        {heroDoctor.title}
                      </span>
                    )}
                  </figcaption>
                )}
              </figure>
            ) : (
              // Typographic no-photo hero — the real-photo rule means no stock
              // fill-ins, so day-0 renders an intentional monogram plate.
              <div
                className="w-full aspect-[4/5] rounded-t-[999px] flex items-center justify-center"
                style={{ background: SITE_SURFACE, border: `1px solid ${SITE_BORDER}` }}
                aria-hidden="true"
              >
                <span className="text-8xl select-none" style={{ fontFamily: DISPLAY, fontStyle: 'italic', color: accent }}>
                  {name.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
          </EditImage>
        </div>
      </section>

      {/* ── Services — numbered editorial index (max 6, never priced) ─────── */}
      {services.length > 0 && (
        <EditModal field="services" label="Services" section="services" as="section">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24" style={{ borderTop: `1px solid ${SITE_BORDER}` }}>
            <div className="flex items-end justify-between gap-6 mb-10">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] mb-3" style={{ color: accent }}>
                  <EditText field="copy:cosmeticHome.servicesEyebrow" label="Services eyebrow">
                    {copy('cosmeticHome.servicesEyebrow', 'The work')}
                  </EditText>
                </p>
                <h2 className="text-3xl sm:text-5xl leading-tight" style={{ fontFamily: DISPLAY, fontWeight: 500 }}>
                  <EditText field="copy:cosmeticHome.servicesHeading" label="Services headline">
                    {copy('cosmeticHome.servicesHeading', 'A quiet mastery of the craft.')}
                  </EditText>
                </h2>
              </div>
              <a href={`${basePath}/services`} className="hidden sm:inline text-sm underline-offset-4 hover:underline whitespace-nowrap" style={{ color: SITE_INK }}>
                All services →
              </a>
            </div>
            <ol className="divide-y" style={{ borderColor: SITE_BORDER }}>
              {services.slice(0, 6).map((s, i) => {
                const slug = s.librarySlug || kebab(s.name) || s.id
                return (
                  <li key={s.id} style={{ borderColor: SITE_BORDER }}>
                    <a
                      href={`${basePath}/services/${slug}`}
                      className="group flex items-baseline gap-6 py-6 transition-colors"
                    >
                      <span className="text-sm tabular-nums shrink-0" style={{ color: accent }}>
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-xl sm:text-2xl group-hover:italic" style={{ fontFamily: DISPLAY, fontWeight: 500 }}>
                          {s.name}
                        </span>
                        {s.description && (
                          <span className="block text-sm mt-1 max-w-2xl" style={{ color: SITE_INK_MUTED }}>
                            {firstSentence(s.description)}
                          </span>
                        )}
                      </span>
                      <span aria-hidden="true" className="text-lg opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: accent }}>
                        →
                      </span>
                    </a>
                  </li>
                )
              })}
            </ol>
          </div>
        </EditModal>
      )}

      {/* ── Doctor feature — the charcoal editorial band ───────────────────── */}
      {heroDoctor?.bio && (
        <section style={{ background: SITE_DEEP, color: SITE_DEEP_INK }}>
          <ScrollReveal>
            <div className="max-w-4xl mx-auto px-4 sm:px-6 py-20 sm:py-28 text-center">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] mb-6" style={{ color: SITE_DEEP_MUTED }}>
                {heroDoctor.name}
                {heroDoctor.title ? ` · ${heroDoctor.title}` : ''}
              </p>
              <blockquote
                className="text-2xl sm:text-4xl leading-snug"
                style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontWeight: 500 }}
              >
                “{firstSentence(heroDoctor.bio)}”
              </blockquote>
              {gates.hasTeam && (
                <a href={`${basePath}/team`} className="inline-block mt-8 text-sm underline-offset-4 underline" style={{ color: SITE_DEEP_MUTED }}>
                  Meet the whole team →
                </a>
              )}
            </div>
          </ScrollReveal>
        </section>
      )}

      {/* ── The space — office gallery strip ──────────────────────────────── */}
      {officePhotos.length >= 2 && (
        <EditModal field="officePhotos" label="Office photos" section="officePhotos" as="section">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] mb-8" style={{ color: accent }}>
              <EditText field="copy:cosmeticHome.galleryHeading" label="Gallery eyebrow">
                {copy('cosmeticHome.galleryHeading', 'The space')}
              </EditText>
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              {officePhotos.slice(0, 3).map((photo, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={photo.id}
                  src={photo.url}
                  alt={photo.caption ?? `${name} — the office`}
                  loading="lazy"
                  className={`w-full object-cover ${i === 0 ? 'aspect-[3/4] rounded-t-[999px]' : 'aspect-[3/4] rounded-2xl'} ${i === 2 ? 'hidden lg:block' : ''}`}
                  style={{ border: `1px solid ${SITE_BORDER}` }}
                />
              ))}
            </div>
          </div>
        </EditModal>
      )}

      {/* ── Testimonials — serif pull quotes ──────────────────────────────── */}
      {testimonials.length > 0 && (
        <EditModal field="testimonials" label="Testimonials" section="testimonials" as="section">
          <div className="py-16 sm:py-24" style={{ background: SITE_SURFACE, borderTop: `1px solid ${SITE_BORDER}`, borderBottom: `1px solid ${SITE_BORDER}` }}>
            <div className="max-w-5xl mx-auto px-4 sm:px-6">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] mb-10 text-center" style={{ color: accent }}>
                <EditText field="copy:cosmeticHome.testimonialsHeading" label="Testimonials eyebrow">
                  {copy('cosmeticHome.testimonialsHeading', 'In their words')}
                </EditText>
              </p>
              <div className="grid sm:grid-cols-2 gap-x-12 gap-y-10">
                {testimonials.map((t, i) => (
                  <ScrollReveal key={t.id} delay={i * 80}>
                    <figure>
                      <blockquote
                        className="text-xl sm:text-2xl leading-snug mb-4"
                        style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontWeight: 500 }}
                      >
                        “{t.quote}”
                      </blockquote>
                      <figcaption className="text-sm" style={{ color: SITE_INK_MUTED }}>
                        — {t.authorName}
                        {t.authorLocation ? `, ${t.authorLocation}` : ''}
                      </figcaption>
                    </figure>
                  </ScrollReveal>
                ))}
              </div>
            </div>
          </div>
        </EditModal>
      )}

      {/* ── Insurance one-liner — luxury keeps logistics quiet ────────────── */}
      {carriers.length > 0 && (
        <section className="max-w-6xl mx-auto px-4 sm:px-6 py-10 text-center">
          <p className="text-sm" style={{ color: SITE_INK_MUTED }}>
            We work with {carriers.slice(0, 3).join(', ')}
            {carriers.length > 3 ? ` and ${carriers.length - 3} more` : ''} —{' '}
            <a href={`${basePath}/insurance`} className="underline underline-offset-4" style={{ color: SITE_INK }}>
              see insurance details
            </a>
            .
          </p>
        </section>
      )}

      {/* ── Closing consultation invitation ───────────────────────────────── */}
      <section style={{ background: SITE_DEEP, color: SITE_DEEP_INK }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-20 sm:py-28 text-center">
          <h2 className="text-3xl sm:text-5xl leading-tight mb-4" style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontWeight: 500 }}>
            <EditText field="copy:cosmeticHome.closerHeading" label="Closing headline">
              {copy('cosmeticHome.closerHeading', 'Begin with a conversation.')}
            </EditText>
          </h2>
          <p className="text-base mb-9 max-w-xl mx-auto" style={{ color: SITE_DEEP_MUTED }}>
            <EditText field="copy:cosmeticHome.closerSub" label="Closing subhead">
              {copy(
                'cosmeticHome.closerSub',
                'A consultation is simply that — your questions, honest answers, and a plan that is yours to keep.',
              )}
            </EditText>
          </p>
          <a
            href={bookHref}
            className="inline-flex items-center rounded-full px-8 py-4 text-sm font-semibold transition-transform hover:scale-[1.02]"
            style={{ background: SITE_DEEP_INK, color: SITE_DEEP }}
          >
            {bookLabel}
          </a>
        </div>
      </section>

      {/* ── Contact form — basic tier only (bookHref targets #contact) ────── */}
      {!gates.isPro && (
        <section id="contact" className="max-w-2xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
          <h2 className="text-3xl mb-2 text-center" style={{ fontFamily: DISPLAY, fontWeight: 500 }}>
            Request a consultation
          </h2>
          <p className="text-sm text-center mb-8" style={{ color: SITE_INK_MUTED }}>
            Tell us a little about what you have in mind — we reply within one business day.
          </p>
          <ContactForm
            slug={data.slug}
            brand={accent}
            isPro={gates.isPro}
            basePath={basePath}
            fields={resolveLeadForm(p.leadForms as LeadFormsConfig | null, 'contact')}
            services={services.length > 0 ? services.map((s) => s.name) : null}
            carriers={carriers.length > 0 ? carriers : null}
          />
        </section>
      )}

      <CosmeticFooter
        data={data}
        basePath={basePath}
        navLinks={navLinks}
        bookHref={bookHref}
        bookLabel={bookLabel}
        signInUrl={signInUrl}
      />
      <CosmeticMobileActions data={data} basePath={basePath} bookHref={bookHref} bookLabel={bookLabel} />
    </div>
  )
}

// The homepage builds its own nav (same helper + gates the shell uses for
// subpages) so the chrome matches sitewide without widening HomePageProps.
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
  })
}
