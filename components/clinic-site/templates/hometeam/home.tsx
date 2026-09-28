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
import { CountUp, TodayReadout, TodayRow } from './live'
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
 * the structure and the voice, never the imagery: a home-plate crest on the
 * OUTFIELD WALL (a full-bleed charcoal panel with the town ghosted across it
 * in condensed caps) where other templates put a lifestyle photo, a real
 * SCOREBOARD whose digits count up and whose header reads today's hours in
 * the clinic's own zone, pennant eyebrows, jersey-numbered services ("the
 * lineup"), the doctor on a TRADING CARD ("the skipper") with the practice's
 * ground rules, reviews "from the stands", and the details "before your
 * visit" with today's row marked. Home whites wear a faint pinstripe. The
 * clinic's brand color is the team color; charcoal and white are the
 * uniform.
 *
 * Looks finished with a name and a phone number. Photography (the practice,
 * the doctor, the office) is decoration that improves the page, never a
 * slot that leaves a hole. Pure presentation from HomePageProps; the two
 * living pieces (`./live`) render their final value on the server.
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

/** The jersey pinstripe: one hairline of the team color every 18px, faint
 *  enough to be a texture and never a grid — a layer, so its alpha is its
 *  own and the ink above it grades against plain paper. */
function Pinstripe({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`absolute inset-0 pointer-events-none ${className ?? ''}`}
      style={{
        opacity: 0.07,
        backgroundImage: `repeating-linear-gradient(90deg, ${TEAM} 0 1px, transparent 1px 18px)`,
      }}
    />
  )
}

/** The pennant: a small team-color tag with a pointed tail, set in the
 *  condensed scoreboard face. The section opener everywhere. */
function Pennant({ children, aside, onDark }: { children: React.ReactNode; aside?: React.ReactNode; onDark?: boolean }) {
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
        <span className="text-sm font-bold uppercase tracking-[0.18em]" style={{ color: onDark ? SITE_DEEP_MUTED : SITE_INK_MUTED, fontFamily: SCORE }}>
          {aside}
        </span>
      )}
    </p>
  )
}

/** A jersey number — the condensed numeral in a charcoal square with the
 *  team color. The services index and the ground-rules index. */
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
    <div className="px-5 py-3 flex items-center justify-between gap-4" style={{ background: SITE_DEEP, color: SITE_DEEP_INK, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
      <span className={`min-w-0 truncate text-sm font-bold uppercase tracking-[0.2em] ${right ? 'hidden sm:inline' : ''}`} style={{ color: TEAM, fontFamily: SCORE }}>
        {children}
      </span>
      {right && (
        <span className="shrink-0 text-sm font-bold uppercase tracking-[0.2em]" style={{ color: SITE_DEEP_MUTED, fontFamily: SCORE }}>
          {right}
        </span>
      )}
    </div>
  )
}

/** Section opener: pennant + slab headline, revealed on scroll. */
function Opener({
  pennant,
  heading,
  intro,
  className,
}: {
  pennant: React.ReactNode
  heading: React.ReactNode
  intro?: React.ReactNode
  className?: string
}) {
  return (
    <ScrollReveal className={className}>
      <Pennant>{pennant}</Pennant>
      <h2 className="text-3xl sm:text-[2.75rem] font-bold leading-[1.08]" style={{ fontFamily: DISPLAY, color: HEADING }}>
        {heading}
      </h2>
      {intro}
    </ScrollReveal>
  )
}

/** The doctor is the first staff member with a doctoral credential, else the
 *  first person on the roster. */
export function pickSkipper(staff: ClinicStaff[]): ClinicStaff | null {
  const cred = /\bD\.?D\.?S\b|\bD\.?M\.?D\b|^Dr\.?\s/i
  return staff.find((m) => cred.test(m.name) || cred.test(m.title ?? '')) ?? staff[0] ?? null
}

/** Initials on a small home plate — the roster mark when there is no photo. */
function PlateMark({ name, className }: { name: string; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className ?? 'w-24 h-24'} aria-hidden="true">
      <path d="M10 12 H90 V60 L50 94 L10 60 Z" fill="var(--c-surface, #FDFDFB)" stroke="var(--c-deep, #1F2327)" strokeWidth="3" strokeLinejoin="round" />
      <path d="M18 20 H82 V56 L50 84 L18 56 Z" fill="none" stroke="var(--c-strip, #40C0E0)" strokeWidth="1.5" strokeLinejoin="round" />
      <text x="50" y="58" textAnchor="middle" fill="var(--c-heading, #2A2E33)" fontSize="30" fontWeight={700} style={{ fontFamily: 'var(--font-display, serif)' }}>
        {nameInitials(name) || '·'}
      </text>
    </svg>
  )
}

/** Ghosted condensed caps across a dark band — outfield-wall lettering. */
function WallLettering({ text, className }: { text: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`absolute select-none pointer-events-none whitespace-nowrap font-bold uppercase leading-none ${className ?? ''}`}
      style={{ fontFamily: SCORE, color: 'rgba(255,255,255,0.05)', letterSpacing: '-0.01em' }}
    >
      {text}
    </span>
  )
}

export default function HometeamHome(props: HomePageProps) {
  const { data, basePath, signInUrl, gates, bookHref, bookLabel, reviewCount } = props
  const p = data.profile
  const name = p.displayName ?? data.orgName
  const overrides = (p.copyOverrides as Record<string, string> | null) ?? {}
  const copy = (key: string, fallback: string) => copyOverride(overrides, key, fallback)
  const timeZone = (p as { timezone?: string | null }).timezone ?? null

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
  const hoursByDay: Record<string, string> = {}
  if (hours) for (const d of DAYS) hoursByDay[d] = hoursEntryDisplay(hours[d])
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
  const linkCaps = {
    className: 'text-base font-bold uppercase tracking-[0.08em] underline underline-offset-[6px]',
    style: { color: SITE_INK, fontFamily: SCORE, textDecorationColor: TEAM, textDecorationThickness: '2px' } as React.CSSProperties,
  }

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

      {/* ── Hero — the statement on home whites, the plate on the wall ───── */}
      <section className="relative overflow-hidden">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,44%)]">
          <div className="relative">
            <Pinstripe />
            <div className="relative max-w-6xl lg:max-w-none mx-auto px-4 sm:px-6 lg:pl-[max(1.5rem,calc((100vw-72rem)/2+1.5rem))] lg:pr-14 pt-14 sm:pt-20 pb-12 sm:pb-16 lg:pb-24">
              <Pennant aside={place ?? undefined}>
                <EditText field="copy:hometeamHome.heroEyebrow" label="Hero pennant">
                  {copy('hometeamHome.heroEyebrow', 'The home team')}
                </EditText>
              </Pennant>
              <EditText
                field="tagline"
                as="h1"
                label="Hero headline"
                className="text-[2.6rem] sm:text-6xl lg:text-[4.5rem] font-bold leading-[1.02] tracking-[-0.015em] mb-6 max-w-2xl"
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
                  className="inline-flex items-center gap-2 rounded-md px-7 py-3.5 text-base font-bold shadow-[0_6px_0_0_var(--c-deep,#1F2327)] active:translate-y-[3px] active:shadow-[0_3px_0_0_var(--c-deep,#1F2327)] transition-transform"
                  style={{ background: STRONG, color: STRONG_INK }}
                >
                  {bookLabel}
                  <span aria-hidden="true">→</span>
                </a>
                {services.length > 0 && (
                  <a href={`${basePath}/services`} {...linkCaps}>
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
          </div>

          {/* The outfield wall: charcoal, the town ghosted across it, the plate
              in front. A photo, when there is one, hangs on the wall with the
              plate at its corner. */}
          <div className="relative overflow-hidden min-h-[22rem] lg:min-h-0" style={{ background: SITE_DEEP }}>
            <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: TEAM }} aria-hidden="true" />
            <WallLettering text={(p.city ?? name).toUpperCase()} className="-bottom-[0.14em] -left-2 text-[9rem] sm:text-[12rem] lg:text-[13rem]" />
            <div className="relative h-full flex items-center justify-center px-8 py-12 lg:py-16">
              {p.heroImageUrl ? (
                <EditImage field="heroImageUrl" label="Practice photo" className="relative block w-full max-w-sm">
                  <SiteImage
                    displayWidth={HERO_IMAGE_DISPLAY_WIDTH}
                    src={p.heroImageUrl}
                    alt={`Inside ${name}`}
                    className="w-full aspect-[4/5] object-cover rounded-md"
                    style={{ border: `4px solid ${SITE_SURFACE}` }}
                  />
                  <span className="absolute -bottom-8 -left-6 w-[44%]">
                    <HomePlate name={name} place={place} logoUrl={p.logoUrl ?? null} size={220} />
                  </span>
                </EditImage>
              ) : (
                <div className="w-full max-w-[24rem] drop-shadow-[0_18px_28px_rgba(0,0,0,0.35)]">
                  <HomePlate name={name} place={place} logoUrl={p.logoUrl ?? null} size={384} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* The scoreboard — hung over the seam under the hero. */}
        {stats.length > 0 && (
          <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:-mt-14 pb-14 sm:pb-20 pt-10 lg:pt-0">
            <EditModal
              field="stats"
              label="Trust stats"
              section="stats"
              className="rounded-md overflow-hidden shadow-[0_24px_48px_-16px_rgba(0,0,0,0.45)]"
              style={{ border: `3px solid ${SITE_DEEP}` }}
            >
              <span className="block h-1.5" style={{ background: TEAM }} aria-hidden="true" />
              <BoardCap right={hours ? <TodayReadout timeZone={timeZone} hoursByDay={hoursByDay} /> : place ?? undefined}>{name}</BoardCap>
              <dl className="grid sm:grid-cols-3" style={{ background: SITE_DEEP, color: SITE_DEEP_INK }}>
                {stats.map((s, i) => (
                  <div
                    key={s.id}
                    className={`flex sm:block items-center gap-4 px-5 sm:px-8 py-4 sm:py-8 ${i > 0 ? 'border-t sm:border-t-0 sm:border-l' : ''}`}
                    style={{ borderColor: 'rgba(255,255,255,0.1)' }}
                  >
                    <dt
                      className="inline-block shrink-0 min-w-[4.6ch] whitespace-nowrap text-center rounded-sm px-3 py-1.5 text-4xl sm:text-5xl lg:text-6xl font-bold leading-none tabular-nums"
                      style={{ fontFamily: SCORE, color: TEAM, background: 'rgba(0,0,0,0.35)', boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(255,255,255,0.06)' }}
                    >
                      <CountUp value={s.value} />
                    </dt>
                    <dd className="sm:mt-3 text-sm sm:text-base font-semibold uppercase tracking-[0.12em] leading-snug" style={{ color: SITE_DEEP_MUTED, fontFamily: SCORE }}>
                      {s.label}
                    </dd>
                  </div>
                ))}
              </dl>
            </EditModal>
          </div>
        )}
        {stats.length === 0 && chips.length > 0 && (
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
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
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
            <div className="grid lg:grid-cols-[5fr_7fr] gap-8 lg:gap-16 items-end mb-12">
              <Opener
                pennant={
                  <EditText field="copy:hometeamHome.servicesEyebrow" label="Services pennant">
                    {copy('hometeamHome.servicesEyebrow', 'The lineup')}
                  </EditText>
                }
                heading={
                  <EditText field="copy:hometeamHome.servicesHeading" label="Services headline">
                    {copy('hometeamHome.servicesHeading', 'Everything a family needs, in one place.')}
                  </EditText>
                }
              />
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
                  <ScrollReveal key={s.id} delay={i * 50}>
                    <a
                      href={`${basePath}/services/${slug}`}
                      className="group relative flex flex-col rounded-md p-6 h-full overflow-hidden transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-lg"
                      style={{ background: SITE_SURFACE, border: `1px solid ${SITE_BORDER}`, color: SITE_INK }}
                    >
                      <span className="flex items-start justify-between mb-8">
                        <Number n={i + 1} />
                        <span className="text-xs font-bold uppercase tracking-[0.2em] pt-1" style={{ color: SITE_INK_MUTED, fontFamily: SCORE }}>
                          {s.category === 'special' ? 'Specialty' : 'Core'}
                        </span>
                      </span>
                      <span className="block text-2xl font-bold leading-tight mb-2" style={{ fontFamily: DISPLAY, color: HEADING }}>
                        {s.name}
                      </span>
                      {s.description && (
                        <span className="block text-sm leading-relaxed mb-5" style={{ color: SITE_INK_MUTED }}>
                          {firstSentence(s.description)}
                        </span>
                      )}
                      <span className="mt-auto text-sm font-bold uppercase tracking-[0.12em]" style={{ color: STRONG, fontFamily: SCORE }}>
                        Details →
                      </span>
                      {/* The team-color base line that grows in on hover. */}
                      <span
                        aria-hidden="true"
                        className="absolute inset-x-0 bottom-0 h-1 origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100"
                        style={{ background: TEAM }}
                      />
                    </a>
                  </ScrollReveal>
                )
              })}
            </div>
            {services.length > 6 && (
              <div className="mt-8">
                <a href={`${basePath}/services`} {...linkCaps}>
                  The full lineup · {services.length} services →
                </a>
              </div>
            )}
          </div>
        </EditModal>
      )}

      {/* ── The skipper — the trading card and the ground rules ──────────── */}
      <section className="relative py-16 sm:py-24 overflow-hidden" style={{ background: 'var(--c-surface-alt, #EAF6F9)', borderTop: `1px solid ${SITE_BORDER}` }}>
        <Pinstripe />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 grid lg:grid-cols-[5fr_7fr] gap-12 lg:gap-16 items-center">
          {/* The trading card */}
          <ScrollReveal className="max-w-sm mx-auto w-full">
            <EditModal
              field="staff"
              label="Team"
              section="staff"
              as="figure"
              className="relative rounded-lg overflow-hidden"
              style={{ background: SITE_SURFACE, border: `4px solid ${SITE_DEEP}`, boxShadow: '0 24px 40px -20px rgba(0,0,0,0.45)' }}
            >
              <span className="absolute inset-1.5 rounded-md pointer-events-none z-10" style={{ border: `1px solid ${TEAM}` }} aria-hidden="true" />
              <span className="flex items-center justify-between px-5 py-2.5" style={{ background: TEAM, color: TEAM_INK }}>
                <span className="text-xs font-bold uppercase tracking-[0.2em]" style={{ fontFamily: SCORE }}>
                  <EditText field="copy:hometeamHome.skipperEyebrow" label="Doctor pennant">
                    {copy('hometeamHome.skipperEyebrow', 'The skipper')}
                  </EditText>
                </span>
                <span className="text-xs font-bold uppercase tracking-[0.2em]" style={{ fontFamily: SCORE }}>
                  {place ?? name}
                </span>
              </span>
              {skipper?.photoUrl ? (
                <SiteImage
                  displayWidth={520}
                  src={skipper.photoUrl}
                  alt={skipper.name}
                  className="w-full aspect-[4/5] object-cover"
                  style={{ objectPosition: skipper.photoPosition ?? 'center' }}
                />
              ) : (
                <span className="relative flex items-center justify-center aspect-[4/5]" style={{ background: SITE_DEEP }}>
                  <WallLettering text={nameInitials(skipper?.name ?? name)} className="text-[16rem] -bottom-[0.1em] -right-[0.05em]" />
                  <PlateMark name={skipper?.name ?? name} className="relative w-40 h-40 drop-shadow-[0_14px_20px_rgba(0,0,0,0.4)]" />
                </span>
              )}
              <figcaption className="px-5 py-4" style={{ background: SITE_DEEP, color: SITE_DEEP_INK, borderTop: `3px solid ${TEAM}` }}>
                <span className="block text-2xl font-bold leading-tight" style={{ fontFamily: DISPLAY }}>
                  {skipper?.name ?? name}
                </span>
                <span className="block text-xs font-bold uppercase tracking-[0.2em] mt-1" style={{ color: TEAM, fontFamily: SCORE }}>
                  {skipper?.title ?? (place ?? 'The practice')}
                </span>
                {skipper?.bio?.trim() && (
                  <span className="block text-sm leading-relaxed mt-3 pt-3" style={{ color: SITE_DEEP_MUTED, borderTop: '1px solid rgba(255,255,255,0.12)' }}>
                    {skipper.bio}
                  </span>
                )}
              </figcaption>
            </EditModal>
          </ScrollReveal>

          <div>
            <Opener
              pennant={<>{copy('hometeamHome.rulesEyebrow', 'Ground rules')}</>}
              heading={
                <EditText field="copy:hometeamHome.practiceHeading" label="Practice headline">
                  {copy('hometeamHome.practiceHeading', 'Standards we keep.')}
                </EditText>
              }
              intro={
                <p className="text-base sm:text-lg leading-relaxed mt-5 mb-8" style={{ color: SITE_INK_MUTED }}>
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
              }
            />
            {chips.length > 0 && (
              <EditModal field="differenceChips" label="Why-us highlights" as="ol" className="grid sm:grid-cols-2 gap-3 mb-8">
                {chips.slice(0, 6).map((c, i) => (
                  <ScrollReveal key={c} as="li" delay={i * 60}>
                    <span className="flex items-center gap-3 rounded-md px-3 py-3 h-full" style={{ background: SITE_SURFACE, border: `1px solid ${SITE_BORDER}`, borderLeft: `4px solid ${TEAM}` }}>
                      <Number n={i + 1} small />
                      <span className="text-base font-semibold leading-snug">{c}</span>
                    </span>
                  </ScrollReveal>
                ))}
              </EditModal>
            )}
            <div className="flex flex-wrap gap-6">
              <a href={`${basePath}/about`} {...linkCaps}>
                About the practice →
              </a>
              {gates.hasTeam && (
                <a href={`${basePath}/team`} {...linkCaps}>
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
                <ScrollReveal key={photo.id} delay={i * 60} as="div" className={i === 0 ? 'col-span-2 md:col-span-1' : ''}>
                  <figure className="relative">
                    <SiteImage
                      displayWidth={420}
                      src={photo.url}
                      alt={photo.alt ?? `${name} office`}
                      className="w-full aspect-[4/3] object-cover rounded-md"
                      style={{ objectPosition: photo.position ?? 'center', border: `3px solid ${SITE_DEEP}` }}
                    />
                    {photo.caption && (
                      <figcaption className="mt-2 text-xs font-bold uppercase tracking-[0.16em]" style={{ color: SITE_INK_MUTED, fontFamily: SCORE }}>
                        {photo.caption}
                      </figcaption>
                    )}
                  </figure>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </EditModal>
      )}

      {/* ── From the stands ──────────────────────────────────────────────── */}
      {testimonials.length > 0 && (
        <EditModal field="testimonials" label="Testimonials" section="testimonials" as="section" style={{ borderTop: `1px solid ${SITE_BORDER}` }}>
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
            <div className="flex flex-wrap items-end justify-between gap-6 mb-10">
              <Opener
                className="max-w-2xl"
                pennant={
                  <EditText field="copy:hometeamHome.testimonialsEyebrow" label="Testimonials pennant">
                    {copy('hometeamHome.testimonialsEyebrow', 'From the stands')}
                  </EditText>
                }
                heading={
                  <EditText field="copy:hometeamHome.testimonialsHeading" label="Testimonials headline">
                    {copy('hometeamHome.testimonialsHeading', 'What patients say.')}
                  </EditText>
                }
              />
              {showRating && <GoogleRatingBadge average={rating!.average!} count={rating!.count} headingInk={HEADING} variant="section" />}
            </div>
            <div className="grid md:grid-cols-3 gap-6">
              {testimonials.map((t, i) => (
                <ScrollReveal key={t.id} delay={i * 70}>
                  <figure className="relative h-full rounded-md overflow-hidden flex flex-col" style={{ background: SITE_SURFACE, border: `1px solid ${SITE_BORDER}` }}>
                    <span className="block h-1.5" style={{ background: TEAM }} aria-hidden="true" />
                    <span
                      aria-hidden="true"
                      className="absolute right-4 top-2 text-[7rem] leading-none font-bold select-none"
                      style={{ fontFamily: DISPLAY, color: SOFT }}
                    >
                      ”
                    </span>
                    <span className="relative flex flex-col flex-1 p-6 pt-8">
                      <blockquote className="text-lg leading-relaxed mb-6 flex-1" style={{ fontFamily: DISPLAY, color: HEADING }}>
                        {t.quote}
                      </blockquote>
                      <figcaption className="flex items-center justify-between gap-3">
                        <span className="inline-block rounded-sm px-2.5 py-1 text-xs font-bold uppercase tracking-[0.16em]" style={{ background: SITE_DEEP, color: SITE_DEEP_INK, fontFamily: SCORE }}>
                          {t.authorName}
                        </span>
                        {t.source === 'google' && (
                          <span className="text-xs uppercase tracking-[0.16em]" style={{ color: SITE_INK_MUTED }}>
                            via Google
                          </span>
                        )}
                      </figcaption>
                    </span>
                  </figure>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </EditModal>
      )}

      {/* ── Before your visit — hours, insurance, where ──────────────────── */}
      <section className="py-16 sm:py-24" style={{ borderTop: `1px solid ${SITE_BORDER}` }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <Opener
            className="max-w-2xl mb-10"
            pennant={
              <EditText field="copy:hometeamHome.detailsEyebrow" label="Details pennant">
                {copy('hometeamHome.detailsEyebrow', 'Before your visit')}
              </EditText>
            }
            heading={
              <EditText field="copy:hometeamHome.detailsHeading" label="Details headline">
                {copy('hometeamHome.detailsHeading', 'Hours, insurance, and where to park.')}
              </EditText>
            }
          />
          <div className="grid md:grid-cols-3 gap-5">
            <ScrollReveal>
              <EditModal
                field="hours"
                label="Hours"
                section="hours"
                className="rounded-md overflow-hidden h-full"
                style={{ background: SITE_SURFACE, border: `1px solid ${SITE_BORDER}` }}
              >
                <BoardCap>Office hours</BoardCap>
                <div className="px-5 py-5">
                  {hours ? (
                    <ul className="text-sm space-y-1">
                      {DAYS.map((day) => (
                        <TodayRow
                          key={day}
                          day={day}
                          timeZone={timeZone}
                          className="flex justify-between gap-4 -mx-2 px-2 py-1 rounded-sm"
                          todayStyle={{ background: SOFT, color: SOFT_INK, fontWeight: 700 }}
                        >
                          <span style={{ color: 'inherit' }}>{DAY_LABEL[day]}</span>
                          <span className="tabular-nums font-semibold">{hoursByDay[day]}</span>
                        </TodayRow>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm" style={{ color: SITE_INK_MUTED }}>
                      Call for current hours.
                    </p>
                  )}
                </div>
              </EditModal>
            </ScrollReveal>

            <ScrollReveal delay={60}>
              <div className="rounded-md overflow-hidden h-full" style={{ background: SITE_SURFACE, border: `1px solid ${SITE_BORDER}` }}>
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
                  <a href={`${basePath}/insurance`} {...linkCaps} className={`${linkCaps.className} !text-sm`}>
                    Insurance & financing →
                  </a>
                </div>
              </div>
            </ScrollReveal>

            <ScrollReveal delay={120}>
              <div className="rounded-md overflow-hidden h-full" style={{ background: SITE_SURFACE, border: `1px solid ${SITE_BORDER}` }}>
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
                        {...linkCaps}
                        className={`${linkCaps.className} !text-sm`}
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
            </ScrollReveal>
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
