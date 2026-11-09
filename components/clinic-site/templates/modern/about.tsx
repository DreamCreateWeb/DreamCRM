import { officePhotoAlt } from '@/lib/types/clinic-content'
import { brandFill } from '@/lib/clinic-site-theme'
import { firstSentence, staffInitials, copyOverride } from '@/lib/clinic-site-helpers'
import TestimonialsCarousel from '@/components/clinic-site/testimonials-carousel'
import ScrollReveal from '@/components/clinic-site/scroll-reveal'
import ClosingCTA from '@/components/clinic-site/closing-cta'
import { SITE_INK as INK, SITE_INK_MUTED as INK_MUTED, SITE_SURFACE as SURFACE, SITE_BORDER as BORDER } from '@/components/clinic-site/tokens'
import SiteImage from '@/components/clinic-site/site-image'
import MapBlock from '@/components/clinic-site/map-block'
import SiteOpenNow from '@/components/clinic-site/open-now'
import LocationsList from '@/components/clinic-site/locations-list'
import { officeOneLine } from '@/lib/site-offices'

import type { AboutPageBodyProps } from '@/lib/site-templates/subpage-props'

/**
 * Modern's about body — moved verbatim out of the page shell (ML-52). The
 * shell owns every read / SEO / gate and hands this the values it computed.
 */
export default function ModernAbout({
  copyOverrides,
  name,
  headingInk,
  profile,
  bookHref,
  brand,
  bookLabel,
  aboutRest,
  stats,
  staff,
  officePhotos,
  testimonials,
  mapOffice,
  data
}: AboutPageBodyProps) {
  return (
    <>
      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="pt-10 pb-12 sm:pt-20 sm:pb-20">
        <div className="max-w-[800px] mx-auto px-5 sm:px-8 text-center">
          <p
            className="text-xs font-semibold uppercase tracking-[0.22em] mb-5"
            style={{ color: INK_MUTED }}
            data-edit-field="copy:about.heroEyebrow"
            data-edit-kind="text"
            data-edit-label="eyebrow"
          >
            {copyOverride(copyOverrides, 'about.heroEyebrow', `About ${name}`)}
          </p>
          <h1
            className="text-[32px] sm:text-[48px] lg:text-[64px] font-semibold leading-[1.05] tracking-[-0.015em] mb-6"
            style={{ color: headingInk, fontFamily: 'var(--font-display, Georgia, serif)' }}
            data-edit-field="copy:about.heroTitle"
            data-edit-kind="text"
            data-edit-label="headline"
          >
            {copyOverride(copyOverrides, 'about.heroTitle', profile.tagline ?? `Get to know ${name}.`)}
          </h1>
          {profile.about && (
            <p
              className="text-base sm:text-lg leading-[1.6] mb-9"
              style={{ color: INK }}
            >
              {firstSentence(profile.about)}
            </p>
          )}
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

      {/* ── Story ──────────────────────────────────────────────────────── */}
      {/* Body shows everything AFTER the hero's first-sentence subhead, so the
          opening line isn't duplicated. Hidden entirely for a one-sentence
          about (the hero already carried it). */}
      {aboutRest && (
        <section
          className="py-14 sm:py-24"
          style={{ backgroundColor: SURFACE }}
          data-edit-field="about"
          data-edit-kind="modal"
          data-edit-label="about text"
        >
          <div className="max-w-[1240px] mx-auto px-5 sm:px-8">
            <div className="grid lg:grid-cols-12 gap-10 lg:gap-16 items-start">
              <ScrollReveal className="lg:col-span-4">
                <p
                  className="text-xs font-semibold uppercase tracking-[0.16em]"
                  style={{ color: headingInk }}
                >
                  Our story
                </p>
              </ScrollReveal>
              <ScrollReveal delay={100} className="lg:col-span-8">
                <p
                  className="text-xl sm:text-2xl leading-[1.55] whitespace-pre-wrap font-medium"
                  style={{ color: INK }}
                >
                  {aboutRest}
                </p>
              </ScrollReveal>
            </div>
          </div>
        </section>
      )}

      {/* ── Stats anchors ──────────────────────────────────────────────── */}
      {stats.length > 0 && (
        <section
          className="py-14 sm:py-20"
          data-edit-field="stats"
          data-edit-kind="modal"
          data-edit-label="trust stats"
        >
          <div className="max-w-[1100px] mx-auto px-5 sm:px-8">
            <ScrollReveal
              className="rounded-2xl overflow-hidden"
              style={{
                backgroundColor: SURFACE,
                border: `1px solid ${BORDER}`,
                boxShadow: '0 1px 2px rgba(28, 26, 23, 0.04)',
              }}
            >
              <ul
                className={`grid ${
                  stats.length === 4
                    ? 'grid-cols-2 lg:grid-cols-4'
                    : stats.length === 3
                      ? 'grid-cols-1 sm:grid-cols-3'
                      : stats.length === 2
                        ? 'grid-cols-2'
                        : 'grid-cols-1'
                }`}
                style={{ borderColor: BORDER }}
              >
                {stats.map((s) => (
                  <li key={s.id} className="text-center px-6 py-7 sm:py-9" style={{ borderColor: BORDER }}>
                    <div
                      className="text-[34px] sm:text-5xl font-bold leading-none mb-2 tracking-[-0.025em]"
                      style={{ color: headingInk, fontFamily: 'var(--font-display, Georgia, serif)' }}
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
            </ScrollReveal>
          </div>
        </section>
      )}

      {/* ── Team ───────────────────────────────────────────────────────── */}
      {staff.length > 0 && (
        <section
          className="py-14 sm:py-24"
          style={{ backgroundColor: SURFACE }}
          data-edit-field="staff"
          data-edit-kind="modal"
          data-edit-label="team"
        >
          <div className="max-w-[1240px] mx-auto px-5 sm:px-8">
            <ScrollReveal className="max-w-[640px] mb-10 sm:mb-14 text-center mx-auto">
              <p
                className="text-xs font-semibold uppercase tracking-[0.22em] mb-4"
                style={{ color: headingInk }}
              >
                Our team
              </p>
              <h2
                className="text-3xl sm:text-4xl lg:text-[48px] font-semibold leading-[1.08] tracking-[-0.015em]"
                style={{ color: headingInk, fontFamily: 'var(--font-display, Georgia, serif)' }}
                data-edit-field="copy:about.teamTitle"
                data-edit-kind="text"
                data-edit-label="headline"
              >
                {copyOverride(copyOverrides, 'about.teamTitle', 'The people who care for you.')}
              </h2>
            </ScrollReveal>
            <div
              className={`grid gap-x-6 gap-y-10 sm:gap-y-12 ${
                staff.length >= 4
                  ? 'grid-cols-2 lg:grid-cols-4'
                  : staff.length === 3
                    ? 'grid-cols-1 sm:grid-cols-3'
                    : staff.length === 2
                      ? 'grid-cols-1 sm:grid-cols-2 max-w-3xl mx-auto'
                      : 'max-w-sm mx-auto'
              }`}
            >
              {staff.map((s, i) => (
                <ScrollReveal as="div" key={s.id} delay={(i % 4) * 90}>
                  <div className="flex flex-col items-center text-center group h-full">
                    {/* Oval portrait — matches /team index + homepage clinical-team
                        band + /team/[staffSlug] hero so the team look is consistent
                        across every surface that renders a staff card. */}
                    <div
                      className="aspect-[4/5] w-full max-w-[220px] overflow-hidden mb-5 transition-transform duration-500 group-hover:scale-[1.04]"
                      style={{
                        borderRadius: '50%',
                        backgroundColor: BORDER,
                      }}
                    >
                      {s.photoUrl ? (
                        <SiteImage
                          displayWidth={220}
                          src={s.photoUrl}
                          alt={s.name}
                          className="w-full h-full object-cover"
                          style={s.photoPosition ? { objectPosition: s.photoPosition } : undefined}
                        />
                      ) : (
                        <div
                          className="w-full h-full flex items-center justify-center text-5xl font-semibold"
                          style={{
                            background: `linear-gradient(135deg, ${brand}33 0%, ${brand}1A 100%)`,
                            color: headingInk,
                            fontFamily: 'var(--font-display, Georgia, serif)',
                          }}
                          aria-label={s.name}
                        >
                          {staffInitials(s.name)}
                        </div>
                      )}
                    </div>
                    {s.title && (
                      <p
                        className="text-[12px] font-semibold uppercase tracking-[0.12em] mb-1.5"
                        style={{ color: INK_MUTED }}
                      >
                        {s.title}
                      </p>
                    )}
                    <h3
                      className="text-lg sm:text-xl font-semibold mb-2 leading-tight"
                      style={{ color: INK, fontFamily: 'var(--font-display, Georgia, serif)' }}
                    >
                      {s.name}
                    </h3>
                    {s.bio && (
                      <p className="text-[14px] leading-[1.6]" style={{ color: INK_MUTED }}>
                        {s.bio}
                      </p>
                    )}
                  </div>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Office tour ────────────────────────────────────────────────── */}
      {officePhotos.length > 0 && (
        <section
          className="py-14 sm:py-24"
          data-edit-field="officePhotos"
          data-edit-kind="modal"
          data-edit-label="office photos"
        >
          <div className="max-w-[1240px] mx-auto px-5 sm:px-8">
            <ScrollReveal className="max-w-[640px] mb-10 sm:mb-14">
              <p
                className="text-xs font-semibold uppercase tracking-[0.16em] mb-4"
                style={{ color: headingInk }}
              >
                Inside the office
              </p>
              <h2
                className="text-3xl sm:text-4xl lg:text-[48px] font-semibold leading-[1.08] tracking-[-0.015em]"
                style={{ color: headingInk, fontFamily: 'var(--font-display, Georgia, serif)' }}
                data-edit-field="copy:about.officeTitle"
                data-edit-kind="text"
                data-edit-label="headline"
              >
                {copyOverride(copyOverrides, 'about.officeTitle', 'A space designed to put you at ease.')}
              </h2>
            </ScrollReveal>
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
              {officePhotos.map((p, i) => (
                <ScrollReveal as="div" key={p.id} delay={(i % 4) * 80}>
                  <figure className="group">
                    <div
                      className="overflow-hidden rounded-2xl"
                      style={{ backgroundColor: BORDER }}
                    >
                      <SiteImage
                        displayWidth={384}
                        src={p.url}
                        alt={officePhotoAlt(p, name)}
                        className="w-full aspect-[4/5] object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
                        style={p.position ? { objectPosition: p.position } : undefined}
                        loading="lazy"
                      />
                    </div>
                    {(p.caption || p.alt) && (
                      <figcaption className="mt-3 text-sm" style={{ color: INK_MUTED }}>
                        {p.caption ?? p.alt}
                      </figcaption>
                    )}
                  </figure>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Testimonials ───────────────────────────────────────────────── */}
      {testimonials.length > 0 && (
        <section className="py-14 sm:py-24" style={{ backgroundColor: SURFACE }}>
          <div className="max-w-[1240px] mx-auto px-5 sm:px-8">
            <ScrollReveal className="max-w-[640px] mb-10 sm:mb-14">
              <p
                className="text-xs font-semibold uppercase tracking-[0.16em] mb-4"
                style={{ color: headingInk }}
              >
                In their words
              </p>
              <h2
                className="text-3xl sm:text-4xl lg:text-[48px] font-semibold leading-[1.08] tracking-[-0.015em]"
                style={{ color: headingInk, fontFamily: 'var(--font-display, Georgia, serif)' }}
                data-edit-field="copy:about.testimonialsTitle"
                data-edit-kind="text"
                data-edit-label="headline"
              >
                {copyOverride(copyOverrides, 'about.testimonialsTitle', 'Patients on the experience.')}
              </h2>
            </ScrollReveal>
            <TestimonialsCarousel testimonials={testimonials} brand={brand} />
          </div>
        </section>
      )}

      {/* ── Find us — the shared map block (every template) ─────────────── */}
      {mapOffice && (
        <section id="find-us" className="scroll-mt-20 py-14 sm:py-20">
          <div className="max-w-[1000px] mx-auto px-5 sm:px-8 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] mb-4" style={{ color: headingInk }}>
              Find us
            </p>
            <h2
              className="text-3xl sm:text-4xl font-semibold leading-[1.1] tracking-[-0.015em] mb-3"
              style={{ color: headingInk, fontFamily: 'var(--font-display, Georgia, serif)' }}
            >
              {mapOffice.line1 ?? name}
            </h2>
            <p className="text-base mb-8" style={{ color: INK_MUTED }}>
              {officeOneLine(mapOffice)}
            </p>
            <MapBlock
              office={mapOffice}
              clinicName={name}
              frameClassName="w-full h-[280px] sm:h-[360px]"
              frameStyle={{ borderRadius: '24px' }}
              linkClassName="inline-flex items-center px-7 py-3.5 rounded-full text-base font-semibold text-white"
              linkStyle={{ backgroundColor: brandFill(brand) }}
            />
            <SiteOpenNow data={data} className="text-base font-semibold mt-5" style={{ color: INK_MUTED }} />
            <LocationsList data={data} className="mt-10" headingClassName="text-xs font-semibold uppercase tracking-[0.16em] mb-4" />
          </div>
        </section>
      )}

      <ClosingCTA
        heading={copyOverride(copyOverrides, 'about.cta.heading', 'Ready to come see us?')}
        subhead={copyOverride(copyOverrides, 'about.cta.subhead', 'We’d love to meet you — book online or give us a call.')}
        editKeyPrefix="about.cta"
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


