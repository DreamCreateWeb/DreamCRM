import type { SiteChromeProps } from '@/lib/site-templates/page-props'
import { EditText } from '@/components/clinic-site/editable'
import { SITE_DEEP, SITE_DEEP_INK, SITE_DEEP_MUTED } from '@/components/clinic-site/tokens'
import { DAYS, DAY_LABEL, hoursEntryDisplay, copyOverride, type HoursMap } from '@/lib/clinic-site-helpers'

const DISPLAY = 'var(--font-display, serif)'
const SCORE = 'var(--font-score, sans-serif)'
const TEAM = 'var(--c-strip, #40C0E0)'

/**
 * Home Team footer — the charcoal band under a team-color trim stripe. A
 * slab closer with the booking button, then three columns with condensed
 * scoreboard-style labels (the practice, the hours, the pages), and a
 * one-line colophon. Carries the sitewide `#site-footer-contact` anchor.
 */
export default function HometeamFooter({
  data,
  basePath,
  navLinks,
  bookHref,
  bookLabel,
  signInUrl,
}: SiteChromeProps) {
  const name = data.profile.displayName ?? data.orgName
  const phone = data.profile.phone ?? null
  const email = data.profile.email ?? null
  const loc = data.primaryLocation
  const addressLine1 = loc?.addressLine1 ?? data.profile.addressLine1
  const city = loc?.city ?? data.profile.city
  const state = loc?.state ?? data.profile.state
  const postal = loc?.postalCode ?? data.profile.postalCode
  const hours = (data.profile.hours as HoursMap | null) ?? null
  const overrides = (data.profile.copyOverrides as Record<string, string> | null) ?? {}
  const year = new Date().getFullYear()
  const mapsQuery = [addressLine1, city, state, postal].filter(Boolean).join(', ')

  return (
    <footer id="site-footer-contact" className="relative mt-10 overflow-hidden" style={{ background: SITE_DEEP, color: SITE_DEEP_INK }}>
      <div className="h-1.5" style={{ background: TEAM }} aria-hidden="true" />
      {/* Outfield-wall lettering behind the closer. */}
      <span
        aria-hidden="true"
        className="absolute -top-[0.1em] -right-4 select-none pointer-events-none whitespace-nowrap font-bold uppercase leading-none text-[10rem] sm:text-[14rem]"
        style={{ fontFamily: SCORE, color: 'rgba(255,255,255,0.04)' }}
      >
        {(data.profile.city ?? name).toUpperCase()}
      </span>
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-14 sm:pt-18 pb-10">
        <div className="grid lg:grid-cols-[7fr_5fr] gap-10 items-end pb-12 mb-12" style={{ borderBottom: '1px solid rgba(255,255,255,0.14)' }}>
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] mb-4" style={{ color: TEAM, fontFamily: SCORE }}>
              {name}
            </p>
            <h2 className="text-4xl sm:text-5xl font-bold leading-[1.05] max-w-xl" style={{ fontFamily: DISPLAY }}>
              <EditText field="copy:hometeamHome.closerHeading" label="Closing headline">
                {copyOverride(overrides, 'hometeamHome.closerHeading', 'Ready for your next visit?')}
              </EditText>
            </h2>
            <p className="text-base sm:text-lg mt-4 max-w-lg leading-relaxed" style={{ color: SITE_DEEP_MUTED }}>
              <EditText field="copy:hometeamHome.closerSub" label="Closing subhead">
                {copyOverride(overrides, 'hometeamHome.closerSub', 'New patients are always welcome. Book online, or call and a person will answer.')}
              </EditText>
            </p>
          </div>
          <div className="flex flex-wrap lg:justify-end items-center gap-4">
            <a
              href={bookHref}
              className="inline-flex items-center rounded-md px-7 py-3.5 text-base font-bold"
              style={{ background: TEAM, color: 'var(--c-strip-ink, #2A2E33)' }}
            >
              {bookLabel}
            </a>
            {phone && (
              <a href={`tel:${phone}`} className="text-base font-bold underline-offset-4 hover:underline">
                {phone}
              </a>
            )}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-10">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-[0.2em] mb-4" style={{ color: TEAM, fontFamily: SCORE }}>
              The practice
            </h3>
            <address className="not-italic text-sm leading-relaxed">
              {addressLine1 && <span className="block">{addressLine1}</span>}
              {(city || state || postal) && (
                <span className="block">
                  {[city, state].filter(Boolean).join(', ')}
                  {postal ? ` ${postal}` : ''}
                </span>
              )}
              {mapsQuery && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-2 text-sm underline underline-offset-4"
                  style={{ color: SITE_DEEP_MUTED }}
                >
                  Directions
                </a>
              )}
              {phone && (
                <a href={`tel:${phone}`} className="block mt-3 text-sm font-bold">
                  {phone}
                </a>
              )}
              {email && (
                <a href={`mailto:${email}`} className="block text-sm underline underline-offset-4" style={{ color: SITE_DEEP_MUTED }}>
                  {email}
                </a>
              )}
            </address>
          </div>

          <div>
            <h3 className="text-sm font-bold uppercase tracking-[0.2em] mb-4" style={{ color: TEAM, fontFamily: SCORE }}>
              Hours
            </h3>
            {hours ? (
              <ul className="text-sm space-y-1.5">
                {DAYS.map((day) => (
                  <li key={day} className="flex justify-between gap-4 max-w-[16rem]">
                    <span style={{ color: SITE_DEEP_MUTED }}>{DAY_LABEL[day]}</span>
                    <span className="text-right tabular-nums">{hoursEntryDisplay(hours[day])}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm" style={{ color: SITE_DEEP_MUTED }}>
                Call for current hours.
              </p>
            )}
          </div>

          <div>
            <h3 className="text-sm font-bold uppercase tracking-[0.2em] mb-4" style={{ color: TEAM, fontFamily: SCORE }}>
              Pages
            </h3>
            <ul className="text-sm space-y-1.5">
              {navLinks.map((l) => (
                <li key={l.label}>
                  <a href={l.href} className="underline-offset-4 hover:underline">
                    {l.label}
                  </a>
                </li>
              ))}
              <li>
                <a href={signInUrl} className="underline-offset-4 hover:underline">
                  Patient login
                </a>
              </li>
              <li>
                <a href={`${basePath}/intake-start`} className="underline-offset-4 hover:underline">
                  New patient forms
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div
          className="mt-12 pt-6 flex flex-wrap items-center justify-between gap-3 text-xs"
          style={{ borderTop: '1px solid rgba(255,255,255,0.14)', color: SITE_DEEP_MUTED }}
        >
          <span>
            © {year} {name}. All rights reserved.
          </span>
          <span className="flex gap-4">
            <a href={`${basePath}/privacy`} className="underline-offset-4 hover:underline">
              Privacy
            </a>
            <a href={`${basePath}/accessibility`} className="underline-offset-4 hover:underline">
              Accessibility
            </a>
          </span>
        </div>
      </div>
    </footer>
  )
}
