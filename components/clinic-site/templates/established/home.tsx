import type {
  ClinicService,
  ClinicStaff,
  ClinicStat,
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
  type HoursMap,
  DAYS,
  DAY_LABEL,
  hoursEntryDisplay,
} from '@/lib/clinic-site-helpers'
import { resolveLeadForm, type LeadFormsConfig } from '@/lib/types/lead-forms'
import { EditText, EditImage, EditModal } from '@/components/clinic-site/editable'
import ContactForm from '@/app/site/[slug]/contact-form'
import GoogleRatingBadge, { GOOGLE_RATING_MIN_COUNT } from '@/components/clinic-site/google-rating-badge'
import ScrollReveal from '@/components/clinic-site/scroll-reveal'
import { formatReviewCount } from '../modern/home'
import EstablishedHeader from './header'
import EstablishedFooter from './footer'
import EstablishedMobileActions from './mobile-actions'
import Crest from './crest'
import { nameInitials } from '@/components/clinic-site/name-initials'
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
import SiteImage from '../../site-image'
import { HERO_IMAGE_DISPLAY_WIDTH } from '@/lib/site-image'

/**
 * Established homepage — the credentialed practice. The register of the
 * Arkansas State Dental Association site the owner is known for: a cream
 * ground, navy serif headlines with ONE italic word in the clinic's accent
 * under a gold hairline, tracked eyebrows, serif numerals in a box-score
 * stat row, a lettered crest where other templates put a lifestyle photo,
 * and ruled editorial sections. Serious and sharp; warm by discipline rather
 * than by decoration.
 *
 * Looks finished with a name and a phone number. Photography (the hero, the
 * doctor, the office) is decoration that improves the page, never a slot
 * that leaves a hole when empty. Pure presentation from HomePageProps.
 */

const DISPLAY = 'var(--font-display, serif)'
const GOLD = 'var(--c-strip, #C9A24A)'
const ACCENT = 'var(--c-brand-strong, #B5121B)'
const ACCENT_INK = 'var(--c-brand-ink, #FFFFFF)'
const ACCENT_SOFT = 'var(--c-brand-soft, #F6E3E4)'
const ACCENT_SOFT_INK = 'var(--c-brand-soft-ink, #8E0E15)'
const HEADING = 'var(--c-heading, #152238)'

/** The signature: the LAST word of a headline set in the accent italic with
 *  a gold underline. Pure text in → spans out; the wrapping EditText still
 *  owns the whole sentence, so the Studio edits the field, not the word. */
export function accentLastWord(text: string): React.ReactNode {
  const trimmed = text.trim()
  const m = /^([\s\S]*?)([^\s.!?]+)([.!?]*)$/.exec(trimmed)
  if (!m || !m[1]) return trimmed
  const [, head, word, punct] = m
  return (
    <>
      {head}
      <em
        style={{
          color: ACCENT,
          fontStyle: 'italic',
          textDecorationLine: 'underline',
          textDecorationColor: GOLD,
          textDecorationThickness: '0.06em',
          textUnderlineOffset: '0.14em',
        }}
      >
        {word}
      </em>
      {punct}
    </>
  )
}

/** Tracked eyebrow with the accent dot — the editorial section opener. */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2.5 text-xs font-semibold uppercase tracking-[0.22em] leading-relaxed mb-4" style={{ color: ACCENT }}>
      <span className="w-1.5 h-1.5 rounded-full shrink-0 mt-[0.45em]" style={{ background: ACCENT }} aria-hidden="true" />
      <span>{children}</span>
    </p>
  )
}

/** The doctor is the first staff member with a doctoral credential, else the
 *  first person on the roster. */
export function pickDoctor(staff: ClinicStaff[]): ClinicStaff | null {
  const cred = /\bD\.?D\.?S\b|\bD\.?M\.?D\b|^Dr\.?\s/i
  return staff.find((m) => cred.test(m.name) || cred.test(m.title ?? '')) ?? staff[0] ?? null
}

function Initials({ name, className }: { name: string; className?: string }) {
  const initials = nameInitials(name)
  return (
    <span
      className={`inline-flex items-center justify-center font-semibold italic ${className ?? ''}`}
      style={{ background: SITE_SURFACE, color: ACCENT, fontFamily: DISPLAY, border: `1px solid ${GOLD}` }}
      aria-hidden="true"
    >
      {initials}
    </span>
  )
}

export default function EstablishedHome(props: HomePageProps) {
  const { data, basePath, signInUrl, gates, bookHref, bookLabel, reviewCount } = props
  const p = data.profile
  const name = p.displayName ?? data.orgName
  const overrides = (p.copyOverrides as Record<string, string> | null) ?? {}
  const copy = (key: string, fallback: string) => copyOverride(overrides, key, fallback)

  const staff = (p.staff as ClinicStaff[] | null) ?? []
  const doctor = pickDoctor(staff)
  const services = ((p.services as ClinicService[] | null) ?? []).filter((s) => s.name?.trim())
  const chips = ((p.differenceChips as string[] | null) ?? []).filter((c) => c?.trim())
  const testimonials = [
    ...((p.testimonials as ClinicTestimonial[] | null) ?? []).filter((t) => t.quote?.trim()),
    ...props.featuredGoogleReviews,
  ].slice(0, 3)
  const officePhotos = ((p.officePhotos as ClinicOfficePhoto[] | null) ?? []).filter((o) => o.url)
  const carriers = (p.acceptedInsuranceCarriers as string[] | null) ?? []
  const hours = (p.hours as HoursMap | null) ?? null
  const rating = props.googleRating
  const showRating = !!rating && rating.average != null && rating.count >= GOOGLE_RATING_MIN_COUNT
  const place = p.city ? `${p.city}${p.state ? `, ${p.state}` : ''}` : null
  const loc = data.primaryLocation
  const addressLine1 = loc?.addressLine1 ?? p.addressLine1
  const mapsQuery = [addressLine1, loc?.city ?? p.city, loc?.state ?? p.state, loc?.postalCode ?? p.postalCode]
    .filter(Boolean)
    .join(', ')

  // The box score: the clinic's own stats, the review count resolved live and
  // dropped when it is zero (a "0 five-star reviews" line is not a trust
  // signal). Three at most — a box score has columns, not a list.
  const stats: ClinicStat[] = ((p.stats as ClinicStat[] | null) ?? [])
    .map((s) => (s.dynamic === 'review_count' ? { ...s, value: formatReviewCount(reviewCount) } : s))
    .filter((s) => !(s.dynamic === 'review_count' && reviewCount === 0))
    .slice(0, 3)

  const navLinks = propsNav(props)
  const tagline = p.tagline ?? `Dentistry, done properly.`

  return (
    <div style={{ background: SITE_BG, color: SITE_INK }}>
      <EstablishedHeader
        data={data}
        basePath={basePath}
        navLinks={navLinks}
        bookHref={bookHref}
        bookLabel={bookLabel}
        signInUrl={signInUrl}
      />

      {/* ── Hero — the statement and the crest ───────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-14 sm:pt-20 pb-14 sm:pb-20 grid lg:grid-cols-[7fr_5fr] gap-12 lg:gap-16 items-center">
          <div>
            <Eyebrow>
              <EditText field="copy:establishedHome.heroEyebrow" label="Hero eyebrow">
                {copy('establishedHome.heroEyebrow', 'Family & general dentistry')}
              </EditText>
              {place ? <span style={{ color: SITE_INK_MUTED }}> · {place}</span> : null}
            </Eyebrow>
            <EditText
              field="tagline"
              as="h1"
              label="Hero headline"
              className="text-[2.6rem] sm:text-6xl lg:text-[4.25rem] font-semibold leading-[1.02] tracking-[-0.01em] mb-6"
              style={{ fontFamily: DISPLAY, color: HEADING }}
            >
              {accentLastWord(tagline)}
            </EditText>
            <EditText
              field="copy:establishedHome.heroIntro"
              as="p"
              label="Hero introduction"
              className="text-lg sm:text-xl leading-relaxed max-w-xl mb-8"
              style={{ color: SITE_INK_MUTED }}
            >
              {copy(
                'establishedHome.heroIntro',
                'A practice built on plain answers, unhurried visits, and work that holds up. We tell you what we see, what can wait, and what it costs — before anything happens.',
              )}
            </EditText>
            <div className="flex flex-wrap items-center gap-5">
              <a
                href={bookHref}
                className="inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-base font-bold"
                style={{ background: ACCENT, color: ACCENT_INK }}
              >
                {bookLabel}
                <span aria-hidden="true">→</span>
              </a>
              {services.length > 0 && (
                <a
                  href={`${basePath}/services`}
                  className="text-base font-semibold underline underline-offset-[6px]"
                  style={{ color: SITE_INK, textDecorationColor: GOLD }}
                >
                  Explore our services
                </a>
              )}
            </div>

            {/* The box score */}
            {stats.length > 0 && (
              <EditModal
                field="stats"
                label="Trust stats"
                section="stats"
                as="dl"
                className="grid grid-cols-3 gap-6 mt-10 pt-8"
                style={{ borderTop: `1px solid ${SITE_BORDER}` }}
              >
                {stats.map((s) => (
                  <div key={s.id}>
                    <dt className="text-3xl sm:text-4xl font-semibold leading-none tabular-nums" style={{ fontFamily: DISPLAY, color: HEADING }}>
                      {s.value}
                    </dt>
                    <dd className="mt-2 text-sm" style={{ color: SITE_INK_MUTED }}>
                      {s.label}
                    </dd>
                  </div>
                ))}
              </EditModal>
            )}
            {stats.length === 0 && chips.length > 0 && (
              <EditModal
                field="differenceChips"
                label="Why-us highlights"
                as="ul"
                className="flex flex-wrap gap-x-6 gap-y-2 mt-10 pt-8 text-sm font-semibold"
                style={{ borderTop: `1px solid ${SITE_BORDER}` }}
              >
                {chips.slice(0, 4).map((c) => (
                  <li key={c} className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: GOLD }} aria-hidden="true" />
                    {c}
                  </li>
                ))}
              </EditModal>
            )}
            {showRating && (
              <div className="mt-6">
                <GoogleRatingBadge average={rating!.average!} count={rating!.count} headingInk={HEADING} variant="hero" />
              </div>
            )}
          </div>

          {/* The crest, alone — or over the practice photo when there is one. */}
          <div className="relative">
            {p.heroImageUrl ? (
              <EditImage field="heroImageUrl" label="Practice photo" className="relative block">
                <SiteImage
                  displayWidth={HERO_IMAGE_DISPLAY_WIDTH}
                  src={p.heroImageUrl}
                  alt={`Inside ${name}`}
                  className="w-full aspect-[4/5] object-cover rounded-[1.25rem]"
                  style={{ border: `1px solid ${SITE_BORDER}` }}
                />
                <span className="absolute -bottom-6 -left-4 sm:-left-8 w-[42%]">
                  <Crest name={name} place={place} logoUrl={p.logoUrl ?? null} size={220} />
                </span>
              </EditImage>
            ) : (
              <Crest name={name} place={place} logoUrl={p.logoUrl ?? null} size={380} />
            )}
          </div>
        </div>
      </section>

      {/* ── Services — the index ─────────────────────────────────────────── */}
      {services.length > 0 && (
        <EditModal field="services" label="Services" section="services" as="section" style={{ borderTop: `1px solid ${SITE_BORDER}` }}>
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
            <div className="grid lg:grid-cols-[5fr_7fr] gap-8 lg:gap-16 items-end mb-10">
              <div>
                <Eyebrow>
                  <EditText field="copy:establishedHome.servicesEyebrow" label="Services eyebrow">
                    {copy('establishedHome.servicesEyebrow', 'What we do')}
                  </EditText>
                </Eyebrow>
                <h2 className="text-3xl sm:text-[2.75rem] font-semibold leading-[1.08]" style={{ fontFamily: DISPLAY, color: HEADING }}>
                  <EditText field="copy:establishedHome.servicesHeading" label="Services headline">
                    {accentLastWord(copy('establishedHome.servicesHeading', 'Complete care, under one roof.'))}
                  </EditText>
                </h2>
              </div>
              <p className="lg:justify-self-end text-base sm:text-lg leading-relaxed lg:max-w-md" style={{ color: SITE_INK_MUTED }}>
                From the checkup that keeps you out of the chair to the work that gets you back to eating, in one office, by people you already know.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {services.slice(0, 6).map((s, i) => {
                const slug = s.librarySlug || kebab(s.name) || s.id
                return (
                  <ScrollReveal key={s.id} delay={i * 40}>
                    <a
                      href={`${basePath}/services/${slug}`}
                      className="group block rounded-2xl p-6 h-full transition-shadow hover:shadow-md"
                      style={{ background: SITE_SURFACE, border: `1px solid ${SITE_BORDER}`, color: SITE_INK }}
                    >
                      <span className="flex items-center justify-between mb-6">
                        <span
                          className="inline-flex items-center justify-center w-11 h-11 rounded-xl text-xl"
                          style={{ background: ACCENT_SOFT, color: ACCENT_SOFT_INK }}
                          aria-hidden="true"
                        >
                          {s.icon || (
                            <span className="text-base font-semibold" style={{ fontFamily: DISPLAY }}>
                              {String(i + 1).padStart(2, '0')}
                            </span>
                          )}
                        </span>
                        <span className="text-sm transition-transform group-hover:translate-x-0.5" style={{ color: GOLD }} aria-hidden="true">
                          →
                        </span>
                      </span>
                      <span className="block text-xl font-semibold mb-1.5" style={{ fontFamily: DISPLAY, color: HEADING }}>
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
            {services.length > 6 && (
              <div className="mt-8">
                <a
                  href={`${basePath}/services`}
                  className="text-sm font-semibold underline underline-offset-[6px]"
                  style={{ color: SITE_INK, textDecorationColor: GOLD }}
                >
                  All {services.length} services →
                </a>
              </div>
            )}
          </div>
        </EditModal>
      )}

      {/* ── The practice — the doctor and the standards ──────────────────── */}
      <section className="py-16 sm:py-20" style={{ background: 'var(--c-surface-alt, #F1ECE0)', borderTop: `1px solid ${SITE_BORDER}` }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 grid lg:grid-cols-[5fr_7fr] gap-10 lg:gap-16 items-center">
          <div className="relative max-w-sm lg:max-w-none mx-auto w-full">
            {doctor?.photoUrl ? (
              <EditModal field="staff" label="Team" section="staff" as="figure" className="relative">
                <SiteImage
                  displayWidth={520}
                  src={doctor.photoUrl}
                  alt={doctor.name}
                  className="w-full aspect-[4/5] object-cover rounded-[1.25rem]"
                  style={{ objectPosition: doctor.photoPosition ?? 'center', border: `1px solid ${SITE_BORDER}` }}
                />
                <span className="absolute inset-3 rounded-[1rem] pointer-events-none" style={{ border: `1px solid ${GOLD}` }} aria-hidden="true" />
                <figcaption
                  className="absolute left-6 bottom-6 rounded-xl px-4 py-3"
                  style={{ background: SITE_SURFACE, border: `1px solid ${SITE_BORDER}` }}
                >
                  <span className="block text-base font-semibold" style={{ fontFamily: DISPLAY, color: HEADING }}>
                    {doctor.name}
                  </span>
                  {doctor.title && (
                    <span className="block text-xs uppercase tracking-[0.16em]" style={{ color: SITE_INK_MUTED }}>
                      {doctor.title}
                    </span>
                  )}
                </figcaption>
              </EditModal>
            ) : (
              <EditModal
                field="staff"
                label="Team"
                section="staff"
                className="relative rounded-[1.25rem] p-8 sm:p-10"
                style={{ background: SITE_SURFACE, border: `1px solid ${SITE_BORDER}` }}
              >
                <span className="absolute inset-3 rounded-[1rem] pointer-events-none" style={{ border: `1px solid ${GOLD}` }} aria-hidden="true" />
                <Initials name={doctor?.name ?? name} className="w-24 h-24 rounded-full text-3xl mb-6" />
                <span className="block text-2xl font-semibold leading-tight" style={{ fontFamily: DISPLAY, color: HEADING }}>
                  {doctor?.name ?? name}
                </span>
                <span className="block text-xs uppercase tracking-[0.16em] mt-1.5" style={{ color: SITE_INK_MUTED }}>
                  {doctor?.title ?? (place ?? 'The practice')}
                </span>
                {doctor?.bio?.trim() && (
                  <span className="block text-base leading-relaxed mt-5 pt-5" style={{ color: SITE_INK_MUTED, borderTop: `1px solid ${SITE_BORDER}` }}>
                    {doctor.bio}
                  </span>
                )}
              </EditModal>
            )}
          </div>
          <div>
            <Eyebrow>
              <EditText field="copy:establishedHome.practiceEyebrow" label="Practice eyebrow">
                {copy('establishedHome.practiceEyebrow', 'The practice')}
              </EditText>
            </Eyebrow>
            <h2 className="text-3xl sm:text-[2.75rem] font-semibold leading-[1.08] mb-5" style={{ fontFamily: DISPLAY, color: HEADING }}>
              <EditText field="copy:establishedHome.practiceHeading" label="Practice headline">
                {accentLastWord(copy('establishedHome.practiceHeading', 'Standards you can see.'))}
              </EditText>
            </h2>
            <p className="text-base sm:text-lg leading-relaxed mb-7" style={{ color: SITE_INK_MUTED }}>
              {p.about?.trim() ? (
                <EditText field="about" label="About the practice">
                  {p.about}
                </EditText>
              ) : (
                <EditText field="copy:establishedHome.practiceBody" label="Practice paragraph">
                  {copy(
                    'establishedHome.practiceBody',
                    'The same doctor at every visit. Modern equipment, kept current. A schedule that runs on time because we book it honestly. Those are not slogans — they are how the office is run, and you will notice on your first visit.',
                  )}
                </EditText>
              )}
            </p>
            {chips.length > 0 && (
              <EditModal field="differenceChips" label="Why-us highlights" as="ol" className="grid sm:grid-cols-2 gap-x-8 gap-y-3 mb-8">
                {chips.slice(0, 6).map((c, i) => (
                  <li key={c} className="flex items-baseline gap-3 py-2" style={{ borderBottom: `1px solid ${SITE_BORDER}` }}>
                    <span className="text-sm font-semibold tabular-nums shrink-0" style={{ fontFamily: DISPLAY, color: GOLD }} aria-hidden="true">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="text-base font-medium">{c}</span>
                  </li>
                ))}
              </EditModal>
            )}
            <div className="flex flex-wrap gap-6">
              <a
                href={`${basePath}/about`}
                className="text-sm font-semibold underline underline-offset-[6px]"
                style={{ color: SITE_INK, textDecorationColor: GOLD }}
              >
                About the practice →
              </a>
              {gates.hasTeam && (
                <a
                  href={`${basePath}/team`}
                  className="text-sm font-semibold underline underline-offset-[6px]"
                  style={{ color: SITE_INK, textDecorationColor: GOLD }}
                >
                  Meet the team →
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Office — an editorial strip, only with real photos ───────────── */}
      {officePhotos.length >= 2 && (
        <EditModal field="officePhotos" label="Office photos" section="officePhotos" as="section">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {officePhotos.slice(0, 3).map((photo, i) => (
                <figure key={photo.id} className={`relative ${i === 0 ? 'col-span-2 md:col-span-1' : ''}`}>
                  <SiteImage
                    displayWidth={420}
                    src={photo.url}
                    alt={photo.alt ?? `${name} office`}
                    className="w-full aspect-[4/3] object-cover rounded-2xl"
                    style={{ objectPosition: photo.position ?? 'center', border: `1px solid ${SITE_BORDER}` }}
                  />
                  {photo.caption && (
                    <figcaption className="mt-2 text-xs uppercase tracking-[0.16em]" style={{ color: SITE_INK_MUTED }}>
                      {photo.caption}
                    </figcaption>
                  )}
                </figure>
              ))}
            </div>
          </div>
        </EditModal>
      )}

      {/* ── In their words ───────────────────────────────────────────────── */}
      {testimonials.length > 0 && (
        <EditModal field="testimonials" label="Testimonials" section="testimonials" as="section" style={{ borderTop: `1px solid ${SITE_BORDER}` }}>
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
            <div className="max-w-2xl mb-10">
              <Eyebrow>
                <EditText field="copy:establishedHome.testimonialsEyebrow" label="Testimonials eyebrow">
                  {copy('establishedHome.testimonialsEyebrow', 'In their words')}
                </EditText>
              </Eyebrow>
              <h2 className="text-3xl sm:text-[2.75rem] font-semibold leading-[1.08]" style={{ fontFamily: DISPLAY, color: HEADING }}>
                <EditText field="copy:establishedHome.testimonialsHeading" label="Testimonials headline">
                  {accentLastWord(copy('establishedHome.testimonialsHeading', 'What patients say when we are not in the room.'))}
                </EditText>
              </h2>
            </div>
            <div className="grid md:grid-cols-3 gap-6">
              {testimonials.map((t, i) => (
                <ScrollReveal key={t.id} delay={i * 60}>
                  <figure className="h-full rounded-2xl p-7 flex flex-col" style={{ background: SITE_SURFACE, border: `1px solid ${SITE_BORDER}` }}>
                    <span className="block text-5xl leading-none mb-4" style={{ color: GOLD, fontFamily: DISPLAY }} aria-hidden="true">
                      “
                    </span>
                    <blockquote className="text-lg leading-relaxed mb-6 flex-1" style={{ fontFamily: DISPLAY, color: HEADING }}>
                      {t.quote}
                    </blockquote>
                    <figcaption className="flex items-center justify-between gap-3 text-sm" style={{ color: SITE_INK_MUTED }}>
                      <span className="font-semibold" style={{ color: SITE_INK }}>
                        {t.authorName}
                      </span>
                      {t.source === 'google' && <span className="text-xs uppercase tracking-[0.16em]">via Google</span>}
                    </figcaption>
                  </figure>
                </ScrollReveal>
              ))}
            </div>
            {showRating && (
              <div className="mt-8">
                <GoogleRatingBadge average={rating!.average!} count={rating!.count} headingInk={HEADING} variant="section" />
              </div>
            )}
          </div>
        </EditModal>
      )}

      {/* ── The details — hours, insurance, where ────────────────────────── */}
      <section className="py-16 sm:py-20" style={{ borderTop: `1px solid ${SITE_BORDER}` }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="max-w-2xl mb-10">
            <Eyebrow>
              <EditText field="copy:establishedHome.detailsEyebrow" label="Details eyebrow">
                {copy('establishedHome.detailsEyebrow', 'The details')}
              </EditText>
            </Eyebrow>
            <h2 className="text-3xl sm:text-[2.75rem] font-semibold leading-[1.08]" style={{ fontFamily: DISPLAY, color: HEADING }}>
              <EditText field="copy:establishedHome.detailsHeading" label="Details headline">
                {accentLastWord(copy('establishedHome.detailsHeading', 'Hours, insurance, and where to find us.'))}
              </EditText>
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            <EditModal
              field="hours"
              label="Hours"
              section="hours"
              className="rounded-2xl overflow-hidden"
              style={{ background: SITE_SURFACE, border: `1px solid ${SITE_BORDER}` }}
            >
              <div className="px-6 py-4" style={{ background: SITE_DEEP, color: SITE_DEEP_INK }}>
                <h3 className="text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: GOLD }}>
                  Office hours
                </h3>
              </div>
              <div className="px-6 py-5">
                {hours ? (
                  <ul className="text-sm space-y-2">
                    {DAYS.map((day) => (
                      <li key={day} className="flex justify-between gap-4">
                        <span style={{ color: SITE_INK_MUTED }}>{DAY_LABEL[day]}</span>
                        <span className="tabular-nums font-medium">{hoursEntryDisplay(hours[day])}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm" style={{ color: SITE_INK_MUTED }}>
                    Call for current hours.
                  </p>
                )}
              </div>
            </EditModal>

            <div className="rounded-2xl overflow-hidden" style={{ background: SITE_SURFACE, border: `1px solid ${SITE_BORDER}` }}>
              <div className="px-6 py-4" style={{ background: SITE_DEEP, color: SITE_DEEP_INK }}>
                <h3 className="text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: GOLD }}>
                  Insurance & payment
                </h3>
              </div>
              <div className="px-6 py-5 text-sm leading-relaxed">
                {carriers.length > 0 ? (
                  <>
                    <p className="mb-3" style={{ color: SITE_INK_MUTED }}>
                      In network with
                    </p>
                    <ul className="flex flex-wrap gap-2 mb-4">
                      {carriers.slice(0, 6).map((c) => (
                        <li key={c} className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: ACCENT_SOFT, color: ACCENT_SOFT_INK }}>
                          {c}
                        </li>
                      ))}
                      {carriers.length > 6 && (
                        <li className="rounded-full px-3 py-1 text-xs font-semibold" style={{ border: `1px solid ${SITE_BORDER}`, color: SITE_INK_MUTED }}>
                          +{carriers.length - 6} more
                        </li>
                      )}
                    </ul>
                  </>
                ) : (
                  <p className="mb-4" style={{ color: SITE_INK_MUTED }}>
                    We work with most major dental plans and will check your benefits before your visit.
                  </p>
                )}
                <a
                  href={`${basePath}/insurance`}
                  className="text-sm font-semibold underline underline-offset-[6px]"
                  style={{ color: SITE_INK, textDecorationColor: GOLD }}
                >
                  Insurance & financing →
                </a>
              </div>
            </div>

            <div className="rounded-2xl overflow-hidden" style={{ background: SITE_SURFACE, border: `1px solid ${SITE_BORDER}` }}>
              <div className="px-6 py-4" style={{ background: SITE_DEEP, color: SITE_DEEP_INK }}>
                <h3 className="text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: GOLD }}>
                  Find us
                </h3>
              </div>
              <div className="px-6 py-5 text-sm leading-relaxed">
                {addressLine1 || place ? (
                  <address className="not-italic mb-4">
                    {addressLine1 && <span className="block font-medium">{addressLine1}</span>}
                    {place && <span className="block" style={{ color: SITE_INK_MUTED }}>{place}</span>}
                  </address>
                ) : (
                  <p className="mb-4" style={{ color: SITE_INK_MUTED }}>
                    Call us for directions.
                  </p>
                )}
                <div className="flex flex-wrap gap-5">
                  {mapsQuery && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-semibold underline underline-offset-[6px]"
                      style={{ color: SITE_INK, textDecorationColor: GOLD }}
                    >
                      Directions →
                    </a>
                  )}
                  {p.phone && (
                    <a href={`tel:${p.phone}`} className="text-sm font-semibold" style={{ color: SITE_INK }}>
                      {p.phone}
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Contact form — request-only tier (bookHref targets #contact) ──── */}
      {!gates.selfBooking && (
        <section id="contact" className="max-w-2xl mx-auto px-4 sm:px-6 pb-16 sm:pb-20">
          <div className="mb-8">
            <Eyebrow>Request a visit</Eyebrow>
            <h2 className="text-3xl sm:text-4xl font-semibold leading-[1.08]" style={{ fontFamily: DISPLAY, color: HEADING }}>
              {accentLastWord('Tell us a good time.')}
            </h2>
            <p className="text-sm mt-3" style={{ color: SITE_INK_MUTED }}>
              We will call you back to confirm.
            </p>
          </div>
          <ContactForm
            slug={data.slug}
            brand={p.brandColor ?? '#B5121B'}
            selfBooking={gates.selfBooking}
            basePath={basePath}
            fields={resolveLeadForm(p.leadForms as LeadFormsConfig | null, 'contact')}
            services={services.length > 0 ? services.map((s) => s.name) : null}
            carriers={carriers.length > 0 ? carriers : null}
          />
        </section>
      )}

      <EstablishedFooter
        data={data}
        basePath={basePath}
        navLinks={navLinks}
        bookHref={bookHref}
        bookLabel={bookLabel}
        signInUrl={signInUrl}
      />
      <EstablishedMobileActions data={data} basePath={basePath} bookHref={bookHref} bookLabel={bookLabel} />
    </div>
  )
}

// Same helper + gates the shells use, so Home's nav matches the subpages.
function propsNav(props: HomePageProps): SiteNavLink[] {
  const services = ((props.data.profile.services as ClinicService[] | null) ?? []).filter((s) => s.name?.trim())
  return buildClinicNavLinks({
    basePath: props.basePath,
    hasBlog: props.gates.hasBlog,
    hasDentalPlans: props.gates.hasDentalPlans,
    hasTeam: props.gates.hasTeam,
    hasCareers: props.gates.hasCareers,
    services: navServicesFromClinicServices(services),
    extraGates: {
      hasColoringPages: props.gates.hasColoringPages,
    },
  })
}
