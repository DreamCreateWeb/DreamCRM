import { brandFill } from '@/lib/clinic-site-theme'
import { staffInitials, staffSlug as resolveStaffSlug, copyOverride } from '@/lib/clinic-site-helpers'
import ScrollReveal from '@/components/clinic-site/scroll-reveal'
import ClosingCTA from '@/components/clinic-site/closing-cta'
import { SITE_INK as INK, SITE_INK_MUTED as INK_MUTED, SITE_SURFACE as SURFACE, SITE_BORDER as BORDER } from '@/components/clinic-site/tokens'
import SiteImage from '@/components/clinic-site/site-image'

import type { TeamPageBodyProps } from '@/lib/site-templates/subpage-props'

/**
 * Modern's team body — moved verbatim out of the page shell (ML-52). The
 * shell owns every read / SEO / gate and hands this the values it computed.
 */
export default function ModernTeam({
  copyOverrides,
  headingInk,
  name,
  heroLead,
  hasTeam,
  staff,
  basePath,
  brand,
  bookHref,
  bookLabel,
  profile
}: TeamPageBodyProps) {
  return (
    <>
        {/* ── Hero ───────────────────────────────────────────────────────── */}
        <section className="pt-10 pb-10 sm:pt-20 sm:pb-16">
          <div className="max-w-[800px] mx-auto px-5 sm:px-8 text-center">
            <p
              className="text-xs font-semibold uppercase tracking-[0.22em] mb-5"
              style={{ color: INK_MUTED }}
              data-edit-field="copy:team.heroEyebrow"
              data-edit-kind="text"
              data-edit-label="eyebrow"
            >
              {copyOverride(copyOverrides, 'team.heroEyebrow', 'About · Our team')}
            </p>
            <h1
              className="text-[32px] sm:text-[48px] lg:text-[64px] font-semibold leading-[1.05] tracking-[-0.015em] mb-6"
              style={{ color: headingInk, fontFamily: 'var(--font-display, Georgia, serif)' }}
              data-edit-field="copy:team.heroTitle"
              data-edit-kind="text"
              data-edit-label="headline"
            >
              {copyOverride(copyOverrides, 'team.heroTitle', `Meet the team at ${name}.`)}
            </h1>
            <p
              className="text-base sm:text-lg leading-[1.6]"
              style={{ color: INK }}
            >
              {heroLead}
            </p>
          </div>
        </section>

        {/* ── Team grid (or empty placeholder) ───────────────────────────── */}
        {hasTeam ? (
          <section
            className="pb-14 sm:pb-24"
            data-edit-field="staff"
            data-edit-kind="modal"
            data-edit-label="team"
          >
            <div className="max-w-[1240px] mx-auto px-5 sm:px-8">
              <div
                className={`grid gap-x-6 gap-y-12 ${
                  staff.length >= 3
                    ? 'sm:grid-cols-2 lg:grid-cols-3'
                    : staff.length === 2
                      ? 'sm:grid-cols-2 max-w-3xl mx-auto'
                      : 'max-w-sm mx-auto'
                }`}
              >
                {staff.map((s, i) => {
                  const personSlug = resolveStaffSlug(s)
                  const detailHref = personSlug
                    ? `${basePath}/team/${personSlug}`
                    : null
                  return (
                    <ScrollReveal as="div" key={s.id} delay={(i % 3) * 100}>
                      <div className="flex flex-col items-center text-center group">
                        {/* Oval portrait — matches the homepage clinical-team band */}
                        <div
                          className="relative w-[200px] h-[240px] sm:w-[220px] sm:h-[260px] mb-5 transition-transform duration-500 group-hover:scale-[1.04]"
                          style={{
                            borderRadius: '50%',
                            overflow: 'hidden',
                            backgroundColor: BORDER,
                          }}
                        >
                          {s.photoUrl ? (
                            <SiteImage
                              displayWidth={384}
                              src={s.photoUrl}
                              alt={s.name}
                              className="w-full h-full object-cover"
                              style={s.photoPosition ? { objectPosition: s.photoPosition } : undefined}
                              width={384}
                              height={448}
                              loading="lazy"
                              decoding="async"
                            />
                          ) : (
                            <div
                              className="w-full h-full flex items-center justify-center text-5xl font-bold"
                              style={{
                                background: `linear-gradient(135deg, ${brand}33 0%, ${brand}1A 100%)`,
                                color: headingInk,
                              }}
                              aria-label={s.name}
                            >
                              {staffInitials(s.name)}
                            </div>
                          )}
                        </div>
                        {s.title && (
                          <p
                            className="text-[13px] font-semibold uppercase tracking-[0.12em] mb-2"
                            style={{ color: INK_MUTED }}
                          >
                            {s.title}
                          </p>
                        )}
                        <h2
                          className="text-2xl sm:text-[28px] font-semibold leading-tight mb-3"
                          style={{ color: INK, fontFamily: 'var(--font-display, Georgia, serif)' }}
                        >
                          {s.name}
                        </h2>
                        {detailHref && (
                          <a
                            href={detailHref}
                            className="text-sm font-semibold inline-flex items-center gap-1 transition-all duration-300 hover:gap-2"
                            style={{ color: headingInk }}
                          >
                            More <span aria-hidden="true">→</span>
                          </a>
                        )}
                      </div>
                    </ScrollReveal>
                  )
                })}
              </div>
            </div>
          </section>
        ) : (
          /* Empty state — render gracefully rather than 404 so direct nav hits
             don't break. The nav gate hides /team from the dropdown until staff
             exist; this catches the rare direct-link case (an old link, a
             Google result). It is the public-site twin of a doored empty state:
             the real way to meet the team, with the doors — never "coming
             soon", which reads to a patient as a practice that has not finished
             its website (docs/ACTIVATION.md law 3). */
          <section className="pb-14 sm:pb-24">
            <div className="max-w-[640px] mx-auto px-5 sm:px-8">
              <div
                className="rounded-2xl border border-dashed px-6 py-12 text-center"
                style={{ borderColor: BORDER, color: INK_MUTED, backgroundColor: SURFACE }}
              >
                <p
                  className="text-xl sm:text-2xl font-semibold mb-2"
                  style={{ color: INK, fontFamily: 'var(--font-display, Georgia, serif)' }}
                >
                  Meet us in person.
                </p>
                <p className="text-base mb-6">
                  The best introduction is a visit — book a time, or give us a call and
                  we&apos;ll say hello.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <a
                    href={bookHref}
                    className="inline-flex items-center px-6 py-3 rounded-full text-[15px] font-semibold text-white shadow-md transition hover:shadow-lg"
                    style={{ backgroundColor: brandFill(brand) }}
                  >
                    {bookLabel}
                  </a>
                  {profile.phone && (
                    <a
                      href={`tel:${profile.phone}`}
                      className="inline-flex items-center px-6 py-3 rounded-full text-[15px] font-semibold border"
                      style={{ color: INK, borderColor: BORDER }}
                    >
                      Call {profile.phone}
                    </a>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        <ClosingCTA
          heading={copyOverride(copyOverrides, 'team.cta.heading', 'It’s a pleasure to meet you.')}
          subhead={copyOverride(copyOverrides, 'team.cta.subhead', 'Book with any member of the team — we’d love to meet you.')}
          editKeyPrefix="team.cta"
          primary={{ label: bookLabel, href: bookHref }}
          secondary={
            profile.phone
              ? { label: profile.phone, href: `tel:${profile.phone}` }
              : undefined
          }
          brand={brand}
        />
      </>
  )
}


