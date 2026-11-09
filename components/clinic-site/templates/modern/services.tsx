import type { EnrichedService } from '@/lib/services/service-library'
import { brandFill } from '@/lib/clinic-site-theme'
import { EditIcon, EditText } from '@/components/clinic-site/editable'
import ServiceIcon from '@/components/clinic-site/service-icon'
import ScrollReveal from '@/components/clinic-site/scroll-reveal'
import ClosingCTA from '@/components/clinic-site/closing-cta'
import { SITE_BG as BG, SITE_INK as INK, SITE_INK_MUTED as INK_MUTED, SITE_SURFACE as SURFACE, SITE_BORDER as BORDER } from '@/components/clinic-site/tokens'

import type { ServicesPageBodyProps } from '@/lib/site-templates/subpage-props'

/**
 * Modern's services body — moved verbatim out of the page shell (ML-52). The
 * shell owns every read / SEO / gate and hands this the values it computed.
 */
export default function ModernServices({
  copy,
  headingInk,
  name,
  bookHref,
  brand,
  bookLabel,
  profile,
  resolved,
  core,
  basePath,
  special
}: ServicesPageBodyProps) {
  return (
    <>
      {/* ── Hero ───────────────────────────────────────────────────────── */}
      {/* Services pages aren't granularly editable — every edit affordance
          opens the services library picker (the single source of truth). */}
      <section
        className="pt-10 pb-12 sm:pt-20 sm:pb-20"
        data-edit-field="services"
        data-edit-kind="modal"
        data-edit-label="services"
      >
        <div className="max-w-[800px] mx-auto px-5 sm:px-8 text-center">
          {/* The page's own words are copy keys (services.*): a practice that
              wants "provided by" rather than "at" edits the headline on the
              canvas, like any template heading. */}
          <EditText
            as="p"
            field="copy:services.heroEyebrow"
            label="eyebrow"
            className="text-xs font-semibold uppercase tracking-[0.22em] mb-5"
            style={{ color: INK_MUTED }}
          >
            {copy('services.heroEyebrow', 'What we do')}
          </EditText>
          <EditText
            as="h1"
            field="copy:services.heading"
            label="headline"
            className="text-[32px] sm:text-[48px] lg:text-[64px] font-semibold leading-[1.05] tracking-[-0.015em] mb-6"
            style={{ color: headingInk, fontFamily: 'var(--font-display, Georgia, serif)' }}
          >
            {copy('services.heading', `Dental services at ${name}.`)}
          </EditText>
          <EditText
            as="p"
            field="copy:services.heroIntro"
            label="intro"
            className="text-base sm:text-lg leading-[1.6] mb-9"
            style={{ color: INK }}
          >
            {copy(
              'services.heroIntro',
              'Comprehensive care, gently delivered — from routine cleanings to cosmetic work and same-day fixes.',
            )}
          </EditText>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <a
              href={bookHref}
              className="inline-flex items-center px-7 py-3.5 rounded-full text-base font-semibold text-white shadow-md transition hover:shadow-lg hover:opacity-95"
              style={{ backgroundColor: brandFill(brand) }}
            >
              {bookLabel}
            </a>
            {profile.phone && (
              <a
                href={`tel:${profile.phone}`}
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full text-base font-medium border bg-[var(--c-surface,#FFFFFF)] transition hover:shadow-sm"
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

      {/* ── Core services ──────────────────────────────────────────────── */}
      <section
        className="pb-16 sm:pb-20"
        style={{ backgroundColor: SURFACE }}
        data-edit-field="services"
        data-edit-kind="modal"
        data-edit-label="services"
      >
        {resolved.length === 0 && (
          <div className="max-w-[760px] mx-auto px-5 sm:px-8 pt-20 sm:pt-24 pb-4 text-center">
            <p className="text-lg leading-[1.6]" style={{ color: INK }}>
              We&rsquo;re putting our full service menu together.
              {profile.phone
                ? ' In the meantime, give us a call — we\u2019ll help you book the right visit.'
                : ' In the meantime, book a visit and we\u2019ll take it from there.'}
            </p>
            {/* Studio-only: clicking anywhere in this section opens the
                services picker; this prompt just makes that obvious. */}
            <div
              className="dc-edit-only mt-10 rounded-2xl border-2 border-dashed py-8 px-6 text-sm font-medium"
              style={{ borderColor: BORDER, color: INK_MUTED }}
            >
              + Add your services — pick from the library and this page becomes
              your full menu, each with its own detail page.
            </div>
          </div>
        )}
        {core.length > 0 && (
          <div className="max-w-[1240px] mx-auto px-5 sm:px-8 pt-20 sm:pt-24">
            <ScrollReveal>
              <EditText
                as="h2"
                field="copy:services.coreHeading"
                label="headline"
                className="text-3xl sm:text-4xl lg:text-[48px] font-semibold leading-[1.08] tracking-[-0.015em] mb-10 sm:mb-14"
                style={{ color: headingInk, fontFamily: 'var(--font-display, Georgia, serif)' }}
              >
                {copy('services.coreHeading', 'Core services.')}
              </EditText>
            </ScrollReveal>
            <ServiceGrid
              services={core}
              basePath={basePath}
              brand={brand}
              headingInk={headingInk}
              bookHref={bookHref}
              bookLabel={bookLabel}
              startIndex={0}
            />
          </div>
        )}

        {/* ── Special services (only when any) ─────────────────────────── */}
        {special.length > 0 && (
          <div className="max-w-[1240px] mx-auto px-5 sm:px-8 pt-16 sm:pt-20">
            <ScrollReveal>
              <EditText
                as="h2"
                field="copy:services.specialHeading"
                label="headline"
                className="text-3xl sm:text-4xl lg:text-[48px] font-semibold leading-[1.08] tracking-[-0.015em] mb-10 sm:mb-14"
                style={{ color: headingInk, fontFamily: 'var(--font-display, Georgia, serif)' }}
              >
                {copy('services.specialHeading', 'Special services.')}
              </EditText>
            </ScrollReveal>
            <ServiceGrid
              services={special}
              basePath={basePath}
              brand={brand}
              headingInk={headingInk}
              bookHref={bookHref}
              bookLabel={bookLabel}
              startIndex={core.length}
            />
          </div>
        )}
      </section>

      <ClosingCTA
        heading="Not sure which one you need?"
        subhead="Book a visit and we’ll figure it out together — no judgment, no pressure."
        primary={{ label: bookLabel, href: bookHref }}
        secondary={
          profile.phone
            ? { label: profile.phone, href: `tel:${profile.phone}` }
            : undefined
        }
        brand={brand}
        variant="teal"
      />

      </>
  )
}

function ServiceGrid({
  services,
  basePath,
  brand,
  headingInk,
  bookHref,
  bookLabel,
  startIndex = 0,
}: {
  services: EnrichedService[]
  basePath: string
  brand: string
  headingInk: string
  bookHref: string
  bookLabel: string
  /** Numbering offset so Core + Special read as one continuous 01,02,03…
   *  sequence rather than each section restarting at 01. */
  startIndex?: number
}) {
  return (
    <div className="grid gap-5 sm:gap-6 lg:gap-7 sm:grid-cols-2 lg:grid-cols-3">
      {services.map((s, i) => {
        const detailHref = `${basePath}/services/${s.routingSlug}`
        const oneLiner = s.shortDescription ?? s.description ?? null
        return (
          <ScrollReveal as="div" key={s.id} delay={(i % 3) * 90}>
            <div
              className="flex flex-col group rounded-2xl p-7 sm:p-8 h-full transition-all duration-300 hover:-translate-y-1 hover:shadow-md"
              style={{ backgroundColor: BG, border: `1px solid ${BORDER}` }}
            >
              <div className="flex items-center gap-3 mb-4">
                {/* The icon slot is always here so the Studio can offer one
                    on a card that has none; to a visitor an empty slot is
                    nothing. */}
                <EditIcon
                  serviceId={s.id}
                  className="inline-flex items-center justify-center leading-none text-2xl"
                  style={{ color: headingInk }}
                >
                  <ServiceIcon
                    icon={s.icon}
                    size={28}
                    fallback={<span className="dc-edit-only text-sm font-medium" style={{ color: INK_MUTED }}>+ icon</span>}
                  />
                </EditIcon>
                <span
                  className="text-xs font-semibold tracking-[0.18em] uppercase"
                  style={{ color: INK_MUTED, fontFamily: 'var(--font-display, Georgia, serif)' }}
                  aria-hidden="true"
                >
                  {String(startIndex + i + 1).padStart(2, '0')}
                </span>
                {s.offer && (
                  <span
                    className="ml-auto inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold text-white"
                    style={{ backgroundColor: brandFill(brand) }}
                  >
                    {s.offer}
                  </span>
                )}
              </div>
              <h3
                className="text-xl font-semibold mb-3 leading-tight"
                style={{ color: INK, fontFamily: 'var(--font-display, Georgia, serif)' }}
              >
                <a href={detailHref} className="transition group-hover:opacity-80">
                  {s.name}
                </a>
              </h3>
              {oneLiner && (
                <p className="text-[15px] leading-[1.6] mb-6" style={{ color: INK_MUTED }}>
                  {oneLiner}
                </p>
              )}
              <div className="mt-auto flex flex-wrap items-center gap-3">
                <a
                  href={detailHref}
                  className="inline-flex items-center gap-1 text-sm font-semibold transition-all duration-300 group-hover:gap-2.5"
                  style={{ color: headingInk }}
                >
                  Learn more
                  <span aria-hidden="true">→</span>
                </a>
                <a
                  href={bookHref}
                  className="inline-flex items-center px-5 py-2.5 rounded-full text-sm font-semibold border transition hover:shadow-sm hover:scale-[1.02]"
                  style={{ color: headingInk, borderColor: brand }}
                >
                  {bookLabel}
                </a>
              </div>
            </div>
          </ScrollReveal>
        )
      })}
    </div>
  )
}
