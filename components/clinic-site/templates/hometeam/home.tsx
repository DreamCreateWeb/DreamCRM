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
import { nameInitials } from '@/components/clinic-site/name-initials'
import HometeamHeader from './header'
import HometeamFooter from './footer'
import HometeamMobileActions from './mobile-actions'
import HomePlate from './plate'
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
 * Home Team homepage — the practice everyone in town knows. Baseball carries
 * the structure and the voice, never the imagery: a home-plate crest where
 * other templates put a lifestyle photo, a SCOREBOARD for the numbers,
 * pennant eyebrows, jersey-numbered services ("the lineup"), the doctor as
 * "the skipper" with the practice's ground rules, reviews "from the stands",
 * and the practical details "before your visit". The clinic's brand color
 * is the team color; charcoal and home whites are the uniform.
 *
 * Looks finished with a name and a phone number. Photography (the practice,
 * the doctor, the office) is decoration that improves the page, never a
 * slot that leaves a hole. Pure presentation from HomePageProps.
 */

const DISPLAY = 'var(--font-display, serif)'
const SCORE = 'var(--font-score, sans-serif)'
const TEAM = 'var(--c-strip, #40C0E0)'
const TEAM_INK = 'var(--c-strip-ink, #2A2E33)'
const STRONG = 'var(--c-brand-strong, #157F9E)'
const STRONG_INK = 'var(--c-brand-ink, #FFFFFF)'
const SOFT = 'var(--c-brand-soft, #E1F4F9)'
const SOFT_INK = 'var(--c-brand-soft-ink, #157F9E)'
const HEADING = 'var(--c-heading, #2A2E33)'

/** The pennant: a small team-color tag with a pointed tail, set in the
 *  condensed scoreboard face. The section opener everywhere. */
function Pennant({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <p className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
      <span
        className="inline-block whitespace-nowrap pl-3 pr-6 py-1 text-sm font-bold uppercase tracking-[0.18em] leading-relaxed"
        style={{
          background: TEAM,
          color: TEAM_INK,
          fontFamily: SCORE,
          clipPath: 'polygon(0 0, 100% 0, calc(100% - 0.9rem) 50%, 100% 100%, 0 100%)',
        }}
      >
        {children}
      </span>
      {aside && (
        <span className="text-sm font-bold uppercase tracking-[0.18em]" style={{ color: SITE_INK_MUTED, fontFamily: SCORE }}>
          {aside}
        </span>
      )}
    </p>
  )
}

/** A jersey number — the condensed numeral in a charcoal square with the
 *  team color, used as the services index and the ground-rules index. */
function Number({ n, small }: { n: number; small?: boolean }) {
  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 rounded-sm font-bold tabular-nums ${small ? 'w-7 h-7 text-sm' : 'w-12 h-12 text-2xl'}`}
      style={{ background: SITE_DEEP, color: TEAM, fontFamily: SCORE }}
      aria-hidden="true"
    >
      {String(n).padStart(2, '0')}
    </span>
  )
}

/** A charcoal card cap with a condensed team-color label — the scoreboard
 *  header, reused on the detail cards. */
function BoardCap({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="px-5 py-3 flex items-center justify-between gap-4" style={{ background: SITE_DEEP, color: SITE_DEEP_INK }}>
      <span className="text-sm font-bold uppercase tracking-[0.2em]" style={{ color: TEAM, fontFamily: SCORE }}>
        {children}
      </span>
      {right && (
        <span className="text-sm font-bold uppercase tracking-[0.2em] truncate" style={{ color: SITE_DEEP_MUTED, fontFamily: SCORE }}>
          {right}
        </span>
      )}
    </div>
  )
}

/** The doctor is the first staff member with a doctoral credential, else the
 *  first person on the roster. */
export function pickSkipper(staff: ClinicStaff[]): ClinicStaff | null {
  const cred = /\bD\.?D\.?S\b|\bD\.?M\.?D\b|^Dr\.?\s/i
  return staff.find((m) => cred.test(m.name) || cred.test(m.title ?? '')) ?? staff[0] ?? null
}

/** Initials on a small home plate — the roster mark when there is no photo. */
function PlateMark({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 100 100" className="w-24 h-24" aria-hidden="true">
      <path d="M10 12 H90 V60 L50 94 L10 60 Z" fill="var(--c-surface, #FDFDFB)" stroke="var(--c-deep, #1F2327)" strokeWidth="3" strokeLinejoin="round" />
      <path d="M18 20 H82 V56 L50 84 L18 56 Z" fill="none" stroke="var(--c-strip, #40C0E0)" strokeWidth="1.5" strokeLinejoin="round" />
      <text x="50" y="58" textAnchor="middle" fill="var(--c-heading, #2A2E33)" fontSize="30" fontWeight={700} style={{ fontFamily: 'var(--font-display, serif)' }}>
        {nameInitials(name) || '·'}
      </text>
    </svg>
  )
}

export default function HometeamHome(props: HomePageProps) {
  const { data, basePath, signInUrl, gates, bookHref, bookLabel, reviewCount } = props
  const p = data.profile
  const name = p.displayName ?? data.orgName
  const overrides = (p.copyOverrides as Record<string, string> | null) ?? {}
  const copy = (key: string, fallback: string) => copyOverride(overrides, key, fallback)

  const staff = (p.staff as ClinicStaff[] | null) ?? []
  const skipper = pickSkipper(staff)
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

  // The scoreboard: the clinic's own stats, the review count resolved live
  // and dropped when it is zero. Three columns at most.
  const stats: ClinicStat[] = ((p.stats as ClinicStat[] | null) ?? [])
    .map((s) => (s.dynamic === 'review_count' ? { ...s, value: formatReviewCount(reviewCount) } : s))
    .filter((s) => !(s.dynamic === 'review_count' && reviewCount === 0))
    .slice(0, 3)

  const navLinks = propsNav(props)

  return (
    <div style={{ background: SITE_BG, color: SITE_INK }}>
      <HometeamHeader
        data={data}
        basePath={basePath}
        navLinks={navLinks}
        bookHref={bookHref}
        bookLabel={bookLabel}
        signInUrl={signInUrl}
      />

      {/* ── Hero — the statement and the plate ───────────────────────────── */}
      <section>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-12 sm:pt-16 pb-10 sm:pb-14 grid lg:grid-cols-[7fr_5fr] gap-10 lg:gap-16 items-center">
          <div>
            <Pennant aside={place ?? undefined}>
              <EditText field="copy:hometeamHome.heroEyebrow" label="Hero pennant">
                {copy('hometeamHome.heroEyebrow', 'The home team')}
              </EditText>
            </Pennant>
            <EditText
              field="tagline"
              as="h1"
              label="Hero headline"
              className="text-[2.6rem] sm:text-6xl lg:text-[4.25rem] font-bold leading-[1.02] tracking-[-0.01em] mb-6"
              style={{ fontFamily: DISPLAY, color: HEADING }}
            >
              {p.tagline ?? `Welcome to ${name}`}
            </EditText>
            <EditText
              field="copy:hometeamHome.heroIntro"
              as="p"
              label="Hero introduction"
              className="text-lg sm:text-xl leading-relaxed max-w-xl mb-8"
              style={{ color: SITE_INK_MUTED }}
            >
              {copy(
                'hometeamHome.heroIntro',
                'Straight answers, steady hands, and a schedule we keep. The office the whole family goes to, and keeps going to.',
              )}
            </EditText>
            <div className="flex flex-wrap items-center gap-5">
              <a
                href={bookHref}
                className="inline-flex items-center gap-2 rounded-md px-7 py-3.5 text-base font-bold"
                style={{ background: STRONG, color: STRONG_INK }}
              >
                {bookLabel}
                <span aria-hidden="true">→</span>
              </a>
              {services.length > 0 && (
                <a
                  href={`${basePath}/services`}
                  className="text-base font-bold uppercase tracking-[0.08em] underline underline-offset-[6px]"
                  style={{ color: SITE_INK, fontFamily: SCORE, textDecorationColor: TEAM, textDecorationThickness: '2px' }}
                >
                  See the lineup
                </a>
              )}
            </div>
            {showRating && (
              <div className="mt-6">
                <GoogleRatingBadge average={rating!.average!} count={rating!.count} headingInk={HEADING} variant="hero" />
              </div>
            )}
          </div>

          <div className="relative">
            {p.heroImageUrl ? (
              <EditImage field="heroImageUrl" label="Practice photo" className="relative block">
                <SiteImage
                  displayWidth={HERO_IMAGE_DISPLAY_WIDTH}
                  src={p.heroImageUrl}
                  alt={`Inside ${name}`}
                  className="w-full aspect-[4/5] object-cover rounded-lg"
                  style={{ border: `1px solid ${SITE_BORDER}` }}
                />
                <span className="absolute -bottom-6 -left-4 sm:-left-8 w-[42%]">
                  <HomePlate name={name} place={place} logoUrl={p.logoUrl ?? null} size={220} />
                </span>
              </EditImage>
            ) : (
              <HomePlate name={name} place={place} logoUrl={p.logoUrl ?? null} size={360} />
            )}
          </div>
        </div>

        {/* The scoreboard — full width under the hero, or the ground rules
            when the clinic has written no numbers yet. */}
        {stats.length > 0 && (
          <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-14 sm:pb-20">
            <EditModal field="stats" label="Trust stats" section="stats" className="rounded-lg overflow-hidden shadow-lg">
              <BoardCap right={place ?? undefined}>{name}</BoardCap>
              <dl className="grid grid-cols-3" style={{ background: SITE_DEEP, color: SITE_DEEP_INK }}>
                {stats.map((s, i) => (
                  <div key={s.id} className="px-5 sm:px-8 py-6 sm:py-8" style={{ borderLeft: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.12)', borderTop: '1px solid rgba(255,255,255,0.12)' }}>
                    <dt className="text-4xl sm:text-6xl font-bold leading-none tabular-nums" style={{ fontFamily: SCORE, color: TEAM }}>
                      {s.value}
                    </dt>
                    <dd className="mt-2 text-sm sm:text-base font-semibold uppercase tracking-[0.12em]" style={{ color: SITE_DEEP_MUTED, fontFamily: SCORE }}>
                      {s.label}
                    </dd>
                  </div>
                ))}
              </dl>
            </EditModal>
          </div>
        )}
        {stats.length === 0 && chips.length > 0 && (
          <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-14 sm:pb-20">
            <EditModal field="differenceChips" label="Why-us highlights" as="ul" className="flex flex-wrap gap-x-8 gap-y-3 pt-6 text-base font-bold" style={{ borderTop: `1px solid ${SITE_BORDER}` }}>
              {chips.slice(0, 4).map((c, i) => (
                <li key={c} className="flex items-center gap-3">
                  <Number n={i + 1} small />
                  {c}
                </li>
              ))}
            </EditModal>
          </div>
        )}
      </section>

      {/* ── The lineup ───────────────────────────────────────────────────── */}
      {services.length > 0 && (
        <EditModal field="services" label="Services" section="services" as="section" style={{ borderTop: `1px solid ${SITE_BORDER}` }}>
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
            <div className="grid lg:grid-cols-[5fr_7fr] gap-8 lg:gap-16 items-end mb-10">
              <div>
                <Pennant>
                  <EditText field="copy:hometeamHome.servicesEyebrow" label="Services pennant">
                    {copy('hometeamHome.servicesEyebrow', 'The lineup')}
                  </EditText>
                </Pennant>
                <h2 className="text-3xl sm:text-[2.75rem] font-bold leading-[1.08]" style={{ fontFamily: DISPLAY, color: HEADING }}>
                  <EditText field="copy:hometeamHome.servicesHeading" label="Services headline">
                    {copy('hometeamHome.servicesHeading', 'Everything a family needs, in one place.')}
                  </EditText>
                </h2>
              </div>
              <p className="lg:justify-self-end text-base sm:text-lg leading-relaxed lg:max-w-md" style={{ color: SITE_INK_MUTED }}>
                <EditText field="copy:hometeamHome.servicesIntro" label="Services intro">
                  {copy(
                    'hometeamHome.servicesIntro',
                    'From the cleaning that keeps you out of trouble to the crown that gets you back to dinner, done here, by people you already know.',
                  )}
                </EditText>
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {services.slice(0, 6).map((s, i) => {
                const slug = s.librarySlug || kebab(s.name) || s.id
                return (
                  <ScrollReveal key={s.id} delay={i * 40}>
                    <a
                      href={`${basePath}/services/${slug}`}
                      className="group flex gap-4 rounded-lg p-5 h-full transition-shadow hover:shadow-md"
                      style={{ background: SITE_SURFACE, border: `1px solid ${SITE_BORDER}`, color: SITE_INK }}
                    >
                      <Number n={i + 1} />
                      <span className="min-w-0">
                        <span className="block text-xl font-bold leading-snug mb-1" style={{ fontFamily: DISPLAY, color: HEADING }}>
                          {s.name}
                        </span>
                        {s.description && (
                          <span className="block text-sm leading-relaxed" style={{ color: SITE_INK_MUTED }}>
                            {firstSentence(s.description)}
                          </span>
                        )}
                      </span>
                    </a>
                  </ScrollReveal>
                )
              })}
            </div>
            {services.length > 6 && (
              <div className="mt-8">
                <a
                  href={`${basePath}/services`}
                  className="text-base font-bold uppercase tracking-[0.08em] underline underline-offset-[6px]"
                  style={{ color: SITE_INK, fontFamily: SCORE, textDecorationColor: TEAM, textDecorationThickness: '2px' }}
                >
                  The full lineup · {services.length} services →
                </a>
              </div>
            )}
          </div>
        </EditModal>
      )}

      {/* ── The skipper — the doctor and the ground rules ────────────────── */}
      <section className="py-16 sm:py-20" style={{ background: 'var(--c-surface-alt, #EAF6F9)', borderTop: `1px solid ${SITE_BORDER}` }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 grid lg:grid-cols-[5fr_7fr] gap-10 lg:gap-16 items-center">
          <div className="relative max-w-sm lg:max-w-none mx-auto w-full">
            {skipper?.photoUrl ? (
              <EditModal field="staff" label="Team" section="staff" as="figure" className="relative">
                <SiteImage
                  displayWidth={520}
                  src={skipper.photoUrl}
                  alt={skipper.name}
                  className="w-full aspect-[4/5] object-cover rounded-lg"
                  style={{ objectPosition: skipper.photoPosition ?? 'center', border: `1px solid ${SITE_BORDER}` }}
                />
                <figcaption
                  className="absolute left-5 bottom-5 rounded-md overflow-hidden"
                  style={{ background: SITE_SURFACE, border: `1px solid ${SITE_BORDER}` }}
                >
                  <span className="block h-1" style={{ background: TEAM }} aria-hidden="true" />
                  <span className="block px-4 py-3">
                    <span className="block text-base font-bold" style={{ fontFamily: DISPLAY, color: HEADING }}>
                      {skipper.name}
                    </span>
                    {skipper.title && (
                      <span className="block text-xs font-bold uppercase tracking-[0.16em]" style={{ color: SITE_INK_MUTED, fontFamily: SCORE }}>
                        {skipper.title}
                      </span>
                    )}
                  </span>
                </figcaption>
              </EditModal>
            ) : (
              <EditModal
                field="staff"
                label="Team"
                section="staff"
                className="rounded-lg overflow-hidden"
                style={{ background: SITE_SURFACE, border: `1px solid ${SITE_BORDER}` }}
              >
                <span className="block h-1.5" style={{ background: TEAM }} aria-hidden="true" />
                <span className="block p-8 sm:p-10">
                  <PlateMark name={skipper?.name ?? name} />
                  <span className="block text-2xl font-bold leading-tight mt-5" style={{ fontFamily: DISPLAY, color: HEADING }}>
                    {skipper?.name ?? name}
                  </span>
                  <span className="block text-xs font-bold uppercase tracking-[0.16em] mt-1.5" style={{ color: SITE_INK_MUTED, fontFamily: SCORE }}>
                    {skipper?.title ?? (place ?? 'The practice')}
                  </span>
                  {skipper?.bio?.trim() && (
                    <span className="block text-base leading-relaxed mt-5 pt-5" style={{ color: SITE_INK_MUTED, borderTop: `1px solid ${SITE_BORDER}` }}>
                      {skipper.bio}
                    </span>
                  )}
                </span>
              </EditModal>
            )}
          </div>
          <div>
            <Pennant>
              <EditText field="copy:hometeamHome.skipperEyebrow" label="Doctor pennant">
                {copy('hometeamHome.skipperEyebrow', 'The skipper')}
              </EditText>
            </Pennant>
            <h2 className="text-3xl sm:text-[2.75rem] font-bold leading-[1.08] mb-5" style={{ fontFamily: DISPLAY, color: HEADING }}>
              <EditText field="copy:hometeamHome.practiceHeading" label="Practice headline">
                {copy('hometeamHome.practiceHeading', 'Standards we keep.')}
              </EditText>
            </h2>
            <p className="text-base sm:text-lg leading-relaxed mb-8" style={{ color: SITE_INK_MUTED }}>
              {p.about?.trim() ? (
                <EditText field="about" label="About the practice">
                  {p.about}
                </EditText>
              ) : (
                <EditText field="copy:hometeamHome.practiceBody" label="Practice paragraph">
                  {copy(
                    'hometeamHome.practiceBody',
                    'The same doctor at every visit. Modern equipment, kept current. A schedule that runs on time because we book it honestly. You will notice on your first visit, and you will keep noticing.',
                  )}
                </EditText>
              )}
            </p>
            {chips.length > 0 && (
              <>
                <p className="text-sm font-bold uppercase tracking-[0.2em] mb-3" style={{ color: STRONG, fontFamily: SCORE }}>
                  <EditText field="copy:hometeamHome.rulesEyebrow" label="Ground-rules label">
                    {copy('hometeamHome.rulesEyebrow', 'Ground rules')}
                  </EditText>
                </p>
                <EditModal field="differenceChips" label="Why-us highlights" as="ol" className="grid sm:grid-cols-2 gap-3 mb-8">
                  {chips.slice(0, 6).map((c, i) => (
                    <li key={c} className="flex items-center gap-3 rounded-md px-3 py-2.5" style={{ background: SITE_SURFACE, border: `1px solid ${SITE_BORDER}` }}>
                      <Number n={i + 1} small />
                      <span className="text-base font-semibold">{c}</span>
                    </li>
                  ))}
                </EditModal>
              </>
            )}
            <div className="flex flex-wrap gap-6">
              <a
                href={`${basePath}/about`}
                className="text-base font-bold uppercase tracking-[0.08em] underline underline-offset-[6px]"
                style={{ color: SITE_INK, fontFamily: SCORE, textDecorationColor: TEAM, textDecorationThickness: '2px' }}
              >
                About the practice →
              </a>
              {gates.hasTeam && (
                <a
                  href={`${basePath}/team`}
                  className="text-base font-bold uppercase tracking-[0.08em] underline underline-offset-[6px]"
                  style={{ color: SITE_INK, fontFamily: SCORE, textDecorationColor: TEAM, textDecorationThickness: '2px' }}
                >
                  The whole roster →
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── The office — only with real photos ───────────────────────────── */}
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
                    className="w-full aspect-[4/3] object-cover rounded-lg"
                    style={{ objectPosition: photo.position ?? 'center', border: `1px solid ${SITE_BORDER}` }}
                  />
                  {photo.caption && (
                    <figcaption className="mt-2 text-xs font-bold uppercase tracking-[0.16em]" style={{ color: SITE_INK_MUTED, fontFamily: SCORE }}>
                      {photo.caption}
                    </figcaption>
                  )}
                </figure>
              ))}
            </div>
          </div>
        </EditModal>
      )}

      {/* ── From the stands ──────────────────────────────────────────────── */}
      {testimonials.length > 0 && (
        <EditModal field="testimonials" label="Testimonials" section="testimonials" as="section" style={{ borderTop: `1px solid ${SITE_BORDER}` }}>
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
            <div className="max-w-2xl mb-10">
              <Pennant>
                <EditText field="copy:hometeamHome.testimonialsEyebrow" label="Testimonials pennant">
                  {copy('hometeamHome.testimonialsEyebrow', 'From the stands')}
                </EditText>
              </Pennant>
              <h2 className="text-3xl sm:text-[2.75rem] font-bold leading-[1.08]" style={{ fontFamily: DISPLAY, color: HEADING }}>
                <EditText field="copy:hometeamHome.testimonialsHeading" label="Testimonials headline">
                  {copy('hometeamHome.testimonialsHeading', 'What patients say.')}
                </EditText>
              </h2>
            </div>
            <div className="grid md:grid-cols-3 gap-6">
              {testimonials.map((t, i) => (
                <ScrollReveal key={t.id} delay={i * 60}>
                  <figure className="h-full rounded-lg overflow-hidden flex flex-col" style={{ background: SITE_SURFACE, border: `1px solid ${SITE_BORDER}` }}>
                    <span className="block h-1.5" style={{ background: TEAM }} aria-hidden="true" />
                    <span className="flex flex-col flex-1 p-6">
                      <blockquote className="text-lg leading-relaxed mb-6 flex-1" style={{ fontFamily: DISPLAY, color: HEADING }}>
                        “{t.quote}”
                      </blockquote>
                      <figcaption className="flex items-center justify-between gap-3 text-sm" style={{ color: SITE_INK_MUTED }}>
                        <span className="font-bold uppercase tracking-[0.12em]" style={{ color: SITE_INK, fontFamily: SCORE }}>
                          {t.authorName}
                        </span>
                        {t.source === 'google' && <span className="text-xs uppercase tracking-[0.16em]">via Google</span>}
                      </figcaption>
                    </span>
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

      {/* ── Before your visit — hours, insurance, where ──────────────────── */}
      <section className="py-16 sm:py-20" style={{ borderTop: `1px solid ${SITE_BORDER}` }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="max-w-2xl mb-10">
            <Pennant>
              <EditText field="copy:hometeamHome.detailsEyebrow" label="Details pennant">
                {copy('hometeamHome.detailsEyebrow', 'Before your visit')}
              </EditText>
            </Pennant>
            <h2 className="text-3xl sm:text-[2.75rem] font-bold leading-[1.08]" style={{ fontFamily: DISPLAY, color: HEADING }}>
              <EditText field="copy:hometeamHome.detailsHeading" label="Details headline">
                {copy('hometeamHome.detailsHeading', 'Hours, insurance, and where to park.')}
              </EditText>
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            <EditModal
              field="hours"
              label="Hours"
              section="hours"
              className="rounded-lg overflow-hidden"
              style={{ background: SITE_SURFACE, border: `1px solid ${SITE_BORDER}` }}
            >
              <BoardCap>Office hours</BoardCap>
              <div className="px-5 py-5">
                {hours ? (
                  <ul className="text-sm space-y-2">
                    {DAYS.map((day) => (
                      <li key={day} className="flex justify-between gap-4">
                        <span style={{ color: SITE_INK_MUTED }}>{DAY_LABEL[day]}</span>
                        <span className="tabular-nums font-semibold">{hoursEntryDisplay(hours[day])}</span>
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

            <div className="rounded-lg overflow-hidden" style={{ background: SITE_SURFACE, border: `1px solid ${SITE_BORDER}` }}>
              <BoardCap>Insurance & payment</BoardCap>
              <div className="px-5 py-5 text-sm leading-relaxed">
                {carriers.length > 0 ? (
                  <>
                    <p className="mb-3" style={{ color: SITE_INK_MUTED }}>
                      In network with
                    </p>
                    <ul className="flex flex-wrap gap-2 mb-4">
                      {carriers.slice(0, 6).map((c) => (
                        <li key={c} className="rounded-sm px-2.5 py-1 text-xs font-bold uppercase tracking-[0.08em]" style={{ background: SOFT, color: SOFT_INK, fontFamily: SCORE }}>
                          {c}
                        </li>
                      ))}
                      {carriers.length > 6 && (
                        <li className="rounded-sm px-2.5 py-1 text-xs font-bold uppercase tracking-[0.08em]" style={{ border: `1px solid ${SITE_BORDER}`, color: SITE_INK_MUTED, fontFamily: SCORE }}>
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
                  className="text-sm font-bold uppercase tracking-[0.08em] underline underline-offset-[6px]"
                  style={{ color: SITE_INK, fontFamily: SCORE, textDecorationColor: TEAM, textDecorationThickness: '2px' }}
                >
                  Insurance & financing →
                </a>
              </div>
            </div>

            <div className="rounded-lg overflow-hidden" style={{ background: SITE_SURFACE, border: `1px solid ${SITE_BORDER}` }}>
              <BoardCap>Find us</BoardCap>
              <div className="px-5 py-5 text-sm leading-relaxed">
                {addressLine1 || place ? (
                  <address className="not-italic mb-4">
                    {addressLine1 && <span className="block font-semibold">{addressLine1}</span>}
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
                      className="text-sm font-bold uppercase tracking-[0.08em] underline underline-offset-[6px]"
                      style={{ color: SITE_INK, fontFamily: SCORE, textDecorationColor: TEAM, textDecorationThickness: '2px' }}
                    >
                      Directions →
                    </a>
                  )}
                  {p.phone && (
                    <a href={`tel:${p.phone}`} className="text-sm font-bold" style={{ color: SITE_INK }}>
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
            <Pennant>Request a visit</Pennant>
            <h2 className="text-3xl sm:text-4xl font-bold leading-[1.08]" style={{ fontFamily: DISPLAY, color: HEADING }}>
              Tell us a good time.
            </h2>
            <p className="text-sm mt-3" style={{ color: SITE_INK_MUTED }}>
              We will call you back to confirm.
            </p>
          </div>
          <ContactForm
            slug={data.slug}
            brand={p.brandColor ?? '#40C0E0'}
            selfBooking={gates.selfBooking}
            basePath={basePath}
            fields={resolveLeadForm(p.leadForms as LeadFormsConfig | null, 'contact')}
            services={services.length > 0 ? services.map((s) => s.name) : null}
            carriers={carriers.length > 0 ? carriers : null}
          />
        </section>
      )}

      <HometeamFooter
        data={data}
        basePath={basePath}
        navLinks={navLinks}
        bookHref={bookHref}
        bookLabel={bookLabel}
        signInUrl={signInUrl}
      />
      <HometeamMobileActions data={data} basePath={basePath} bookHref={bookHref} bookLabel={bookLabel} />
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
