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
 * Forest-teal 4-column footer — matches hellotend.com's verbatim footer
 * composition. Dark `#36514c` background (hard-coded, NOT theme-driven —
 * the forest-teal pairs cleanly with any clinic brand color, and Tend's
 * own design holds it constant across regions); white text throughout.
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

  // Forest-teal hard-coded. Not theme-driven because it's visually neutral
  // against essentially every brand color, mirrors Tend's verbatim, and
  // keeps the footer as a constant grounding point across all clinics.
  const FOOTER_BG = '#36514c'
  const FOOTER_INK = '#FFFFFF'
  const FOOTER_MUTED = '#C5CFCC'
  const FOOTER_BORDER = '#476461'

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
    <footer style={{ backgroundColor: FOOTER_BG, color: FOOTER_INK }}>
      <div className="max-w-[1400px] mx-auto px-5 sm:px-8 py-16 sm:py-20">
        {/* Logo + clinic name lockup, full-width above columns */}
        <div className="flex items-center gap-3 mb-12">
          {logoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={logoUrl} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
          ) : (
            <span
              aria-hidden="true"
              className="flex items-center justify-center w-10 h-10 rounded-lg text-white text-base font-bold shrink-0"
              style={{ backgroundColor: brand }}
            >
              {name.charAt(0).toUpperCase()}
            </span>
          )}
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
                <ul className="pt-1 space-y-1">
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
