import type { SiteChromeProps } from '@/lib/site-templates/page-props'
import { intakeDoorOpen } from '@/lib/feature-switches'
import { EditText } from '@/components/clinic-site/editable'
import { SITE_DEEP, SITE_DEEP_INK, SITE_DEEP_MUTED } from '@/components/clinic-site/tokens'
import { DAYS, DAY_LABEL, hoursEntryDisplay, copyOverride, type HoursMap } from '@/lib/clinic-site-helpers'

const DISPLAY = 'var(--font-display, serif)'

/**
 * Established footer — the navy band. A serif closer with the accent pill,
 * then three ruled columns (the practice, the hours, the pages) under gold
 * hairlines, and a one-line colophon. Carries the sitewide
 * `#site-footer-contact` anchor like every template's footer.
 */
export default function EstablishedFooter({
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
    <footer id="site-footer-contact" className="mt-10" style={{ background: SITE_DEEP, color: SITE_DEEP_INK }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-16 sm:pt-20 pb-10">
        <div className="grid lg:grid-cols-[7fr_5fr] gap-10 items-end pb-12 mb-12" style={{ borderBottom: '1px solid var(--c-strip, #C9A24A)' }}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] mb-4" style={{ color: 'var(--c-strip, #C9A24A)' }}>
              {name}
            </p>
            <h2 className="text-4xl sm:text-5xl font-semibold leading-[1.05] max-w-xl" style={{ fontFamily: DISPLAY }}>
              <EditText field="copy:establishedHome.closerHeading" label="Closing headline">
                {copyOverride(overrides, 'establishedHome.closerHeading', 'Ready when you are.')}
              </EditText>
            </h2>
            <p className="text-base sm:text-lg mt-4 max-w-lg leading-relaxed" style={{ color: SITE_DEEP_MUTED }}>
              <EditText field="copy:establishedHome.closerSub" label="Closing subhead">
                {copyOverride(overrides, 'establishedHome.closerSub', 'New patients are welcome. Book online, or call and a person will answer.')}
              </EditText>
            </p>
          </div>
          <div className="flex flex-wrap lg:justify-end items-center gap-4">
            <a
              href={bookHref}
              className="inline-flex items-center rounded-full px-7 py-3.5 text-base font-bold"
              style={{ background: 'var(--c-brand-strong, #B5121B)', color: 'var(--c-brand-ink, #FFFFFF)' }}
            >
              {bookLabel}
            </a>
            {phone && (
              <a href={`tel:${phone}`} className="text-base font-semibold underline-offset-4 hover:underline">
                {phone}
              </a>
            )}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-10">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.22em] mb-4" style={{ color: 'var(--c-strip, #C9A24A)' }}>
              The practice
            </h3>
            <address className="not-italic text-sm leading-relaxed" style={{ color: SITE_DEEP_INK }}>
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
                <a href={`tel:${phone}`} className="block mt-3 text-sm font-semibold">
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
            <h3 className="text-xs font-semibold uppercase tracking-[0.22em] mb-4" style={{ color: 'var(--c-strip, #C9A24A)' }}>
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
            <h3 className="text-xs font-semibold uppercase tracking-[0.22em] mb-4" style={{ color: 'var(--c-strip, #C9A24A)' }}>
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
              {intakeDoorOpen(data.profile) && (
                <li>
                  <a href={`${basePath}/intake-start`} className="underline-offset-4 hover:underline">
                    New patient forms
                  </a>
                </li>
              )}
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
