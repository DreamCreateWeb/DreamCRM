import type { ClinicSiteData } from '@/lib/services/clinic-site'
import type { ClinicService } from '@/lib/types/clinic-content'
import {
  DAYS,
  DAY_LABEL,
  fmt12,
  type HoursMap,
  type SiteNavLink,
} from '@/lib/clinic-site-helpers'

interface Props {
  data: ClinicSiteData
  basePath: string
  navLinks: SiteNavLink[]
  bookHref: string
  bookLabel: string
  signInUrl: string
}

/**
 * Deep-band 4-column footer — matches hellotend.com's verbatim footer
 * composition. The dark background is the brand-DERIVED deep band
 * (`var(--c-deep)`, set on :root by the site layout from the clinic's one
 * brand color); white text throughout.
 *
 * Columns (per Tend): About · Visit (was "Locations") · Services · Questions.
 * "Visit" replaces Tend's metro-list with single-location address + hours
 * (we don't support multi-location displayed in the footer; primary
 * location only). Brand color is used for hover accents + the "back to
 * top" link only.
 */
export default function SiteFooter({
  data,
  basePath,
  navLinks,
  bookHref,
  bookLabel,
  signInUrl,
}: Props) {
  const { profile, primaryLocation } = data
  const name = profile.displayName ?? data.orgName
  const brand = profile.brandColor ?? '#9CAF9F'
  const logoUrl = profile.logoUrl ?? null
  const hours = profile.hours as Record<string, { open?: string; close?: string; closed?: boolean }> | null
  const homeHref = basePath || '/'

  // The deep "rhythm-break" band — now DERIVED from the clinic's brand (a rich,
  // dark, contrast-checked version of their hue) via the site-layout palette
  // vars, so the footer grounds the page in the clinic's OWN color instead of a
  // fixed forest-teal. Literal fallbacks keep it painting if rendered outside
  // the site layout. The border is a translucent white so it reads on any deep.
  const FOOTER_BG = 'var(--c-deep, #36514c)'
  const FOOTER_INK = 'var(--c-deep-ink, #FFFFFF)'
  const FOOTER_MUTED = 'var(--c-deep-muted, #C5CFCC)'
  const FOOTER_BORDER = 'rgba(255,255,255,0.16)'

  // About column links — page paths first, blog/careers appended only if
  // we know they exist (deduplicated against the nav). The nav links
  // already cover the main pages so we lift those + add the universal
  // ones that always live in the footer (Privacy, Accessibility) further
  // down in the legal row, not here.
  const aboutLinks = navLinks.filter((l) => l.label !== 'Contact')

  const services: ClinicService[] =
    ((profile.services as ClinicService[] | null) ?? []).slice(0, 8)

  const locationCity = primaryLocation?.city ?? profile.city ?? null
  const locationState = primaryLocation?.state ?? profile.state ?? null
  const locationLine = primaryLocation?.addressLine1 ?? profile.addressLine1 ?? null
  const cityState = [locationCity, locationState].filter(Boolean).join(', ')

  return (
    <footer
      id="site-footer-contact"
      className="scroll-mt-20"
      style={{ backgroundColor: FOOTER_BG, color: FOOTER_INK }}
    >
      <div className="max-w-[1400px] mx-auto px-5 sm:px-8 py-16 sm:py-20">
        {/* Logo + clinic name lockup, full-width above columns. The logo region
            is the Website Studio's edit handle for `logoUrl` — instrumented in
            BOTH states so a clinic can replace an existing logo OR add one when
            it's still showing the letter-mark fallback (hover → "📷 Replace
            logo" in edit mode; inert for public visitors). */}
        <div className="flex items-center gap-3 mb-12">
          <span
            className="relative inline-flex shrink-0"
            data-edit-field="logoUrl"
            data-edit-kind="image"
            data-edit-label="logo"
          >
            {logoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={logoUrl} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
            ) : (
              <>
                <span
                  aria-hidden="true"
                  className="flex items-center justify-center w-10 h-10 rounded-lg text-white text-base font-bold shrink-0"
                  style={{ backgroundColor: brand }}
                >
                  {name.charAt(0).toUpperCase()}
                </span>
                {/* Editor-only nudge so an empty logo is obviously addable. */}
                <span className="dc-edit-only absolute -bottom-5 left-0 whitespace-nowrap text-[10px] font-semibold text-violet-600">
                  + Add logo
                </span>
              </>
            )}
          </span>
          <a
            href={homeHref}
            className="font-semibold text-xl"
            style={{ color: FOOTER_INK, fontFamily: 'var(--font-display, Georgia, serif)' }}
          >
            {name}
          </a>
        </div>

        <div className="grid gap-12 sm:gap-8 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {/* About */}
          <div>
            <h2
              className="text-[18px] sm:text-[20px] font-semibold mb-5"
              style={{ color: FOOTER_INK, fontFamily: 'var(--font-display, Georgia, serif)' }}
            >
              About {name}
            </h2>
            <ul className="space-y-3">
              {aboutLinks.map((l) => (
                <li key={l.label}>
                  <a
                    href={l.href}
                    className="text-[15px] hover:underline transition"
                    style={{ color: FOOTER_INK }}
                  >
                    {l.label}
                  </a>
                </li>
              ))}
              <li>
                <a
                  href={signInUrl}
                  className="text-[15px] hover:underline transition"
                  style={{ color: FOOTER_INK }}
                >
                  Patient Login
                </a>
              </li>
            </ul>
          </div>

          {/* Visit */}
          <div>
            <h2
              className="text-[18px] sm:text-[20px] font-semibold mb-5"
              style={{ color: FOOTER_INK, fontFamily: 'var(--font-display, Georgia, serif)' }}
            >
              Visit
            </h2>
            <div className="space-y-3 text-[15px]">
              {locationLine && (
                <p style={{ color: FOOTER_INK }}>{locationLine}</p>
              )}
              {cityState && (
                <p style={{ color: FOOTER_MUTED }}>{cityState}</p>
              )}
              {/* Full weekly hours live here now — the standalone homepage
                  Hours section was removed to match Tend's flow (hours sit
                  in the footer, not as a dedicated band). */}
              {hours && Object.keys(hours).length > 0 && (
                <ul
                  className="pt-1 space-y-1"
                  data-edit-field="hours"
                  data-edit-kind="modal"
                  data-edit-label="hours"
                >
                  {DAYS.map((day) => {
                    const entry = (hours as HoursMap)[day]
                    if (!entry) return null
                    return (
                      <li
                        key={day}
                        className="flex items-baseline justify-between gap-4 text-[13px]"
                      >
                        <span style={{ color: FOOTER_MUTED }}>{DAY_LABEL[day]}</span>
                        <span className="text-right" style={{ color: FOOTER_INK }}>
                          {entry.closed
                            ? 'Closed'
                            : entry.open && entry.close
                              ? `${fmt12(entry.open)} – ${fmt12(entry.close)}`
                              : '—'}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* Services */}
          {services.length > 0 && (
            <div>
              <h2
                className="text-[18px] sm:text-[20px] font-semibold mb-5"
                style={{ color: FOOTER_INK, fontFamily: 'var(--font-display, Georgia, serif)' }}
              >
                Services
              </h2>
              <ul className="space-y-3">
                {services.map((s) => (
                  <li key={s.id}>
                    <a
                      href={`${basePath}/services`}
                      className="text-[15px] hover:underline transition"
                      style={{ color: FOOTER_INK }}
                    >
                      {s.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Questions */}
          <div>
            <h2
              className="text-[18px] sm:text-[20px] font-semibold mb-5"
              style={{ color: FOOTER_INK, fontFamily: 'var(--font-display, Georgia, serif)' }}
            >
              Questions?
            </h2>
            <div className="space-y-5 text-[15px]">
              {profile.phone && (
                <div>
                  <p
                    className="text-[13px] uppercase tracking-[0.14em] mb-1 font-medium"
                    style={{ color: FOOTER_MUTED }}
                  >
                    Call
                  </p>
                  <a
                    href={`tel:${profile.phone}`}
                    className="hover:underline"
                    style={{ color: FOOTER_INK }}
                  >
                    {profile.phone}
                  </a>
                </div>
              )}
              {profile.email && (
                <div>
                  <p
                    className="text-[13px] uppercase tracking-[0.14em] mb-1 font-medium"
                    style={{ color: FOOTER_MUTED }}
                  >
                    Email
                  </p>
                  <a
                    href={`mailto:${profile.email}`}
                    className="hover:underline break-all"
                    style={{ color: FOOTER_INK }}
                  >
                    {profile.email}
                  </a>
                </div>
              )}
              <div>
                <p
                  className="text-[13px] uppercase tracking-[0.14em] mb-1 font-medium"
                  style={{ color: FOOTER_MUTED }}
                >
                  Book
                </p>
                <a
                  href={bookHref}
                  className="hover:underline"
                  style={{ color: FOOTER_INK }}
                >
                  {bookLabel}
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom legal bar */}
        <div
          className="mt-16 pt-6 border-t flex flex-col sm:flex-row items-center justify-between gap-3 text-[13px]"
          style={{ borderColor: FOOTER_BORDER }}
        >
          <ul
            className="flex flex-wrap items-center gap-x-5 gap-y-2"
            style={{ color: FOOTER_MUTED }}
          >
            <li>
              <a href={signInUrl} className="hover:underline" style={{ color: FOOTER_MUTED }}>
                Staff login
              </a>
            </li>
            <li>
              <a href={homeHref + '#top'} className="hover:underline" style={{ color: FOOTER_MUTED }}>
                Back to top
              </a>
            </li>
          </ul>
          <div style={{ color: FOOTER_MUTED }}>
            © {new Date().getFullYear()} {name}.{' '}
            <span className="hidden sm:inline">Powered by </span>
            <a
              href="https://dreamcreateweb.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium hover:underline"
              style={{ color: FOOTER_INK }}
            >
              DreamCreate
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
