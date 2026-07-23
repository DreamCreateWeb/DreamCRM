import type { SiteChromeProps } from '@/lib/site-templates/page-props'
import { EditText } from '@/components/clinic-site/editable'
import { SITE_DEEP, SITE_DEEP_INK, SITE_DEEP_MUTED } from '@/components/clinic-site/tokens'
import { DAYS, DAY_LABEL, fmt12, copyOverride, type HoursMap } from '@/lib/clinic-site-helpers'

/**
 * Hometown footer — the deep brand band, information-first: a plain-spoken
 * closer with the booking CTA, then the classic three-column block (practice
 * contact, the full hours grid, site links). Carries the sitewide
 * `#site-footer-contact` anchor like every template's footer.
 */
export default function HometownFooter({
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

  return (
    <footer id="site-footer-contact" className="mt-10" style={{ background: SITE_DEEP, color: SITE_DEEP_INK }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-16">
        <div
          className="text-center pb-10 mb-10"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.16)' }}
        >
          <h2
            className="text-3xl sm:text-4xl font-bold mb-3 max-w-2xl mx-auto"
            style={{ fontFamily: 'var(--font-display, serif)' }}
          >
            <EditText field="copy:hometownHome.closerHeading" label="Closing headline">
              {copyOverride(overrides, 'hometownHome.closerHeading', 'Ready to schedule your visit?')}
            </EditText>
          </h2>
          <p className="text-base mb-7 max-w-xl mx-auto" style={{ color: SITE_DEEP_MUTED }}>
            <EditText field="copy:hometownHome.closerSub" label="Closing subhead">
              {copyOverride(overrides, 'hometownHome.closerSub', 'New patients are always welcome — call us or request a time online.')}
            </EditText>
          </p>
          <div className="flex flex-wrap justify-center items-center gap-4">
            <a
              href={bookHref}
              className="inline-flex items-center rounded-md px-7 py-3.5 text-base font-bold"
              style={{ background: 'var(--c-strip, #E8A33D)', color: 'var(--c-strip-ink, #27303B)' }}
            >
              {bookLabel}
            </a>
            {phone && (
              <a href={`tel:${phone}`} className="text-base font-semibold underline-offset-4 hover:underline">
                or call {phone}
              </a>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-9">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wide mb-3" style={{ color: SITE_DEEP_MUTED }}>
              {name}
            </h3>
            {addressLine1 && (
              <p className="text-sm leading-relaxed mb-2">
                {addressLine1}
                {city ? <><br />{city}{state ? `, ${state}` : ''} {postal ?? ''}</> : null}
              </p>
            )}
            {phone && (
              <a href={`tel:${phone}`} className="block text-sm mb-1 underline-offset-4 hover:underline">
                {phone}
              </a>
            )}
            {email && (
              <a href={`mailto:${email}`} className="block text-sm underline-offset-4 hover:underline">
                {email}
              </a>
            )}
          </div>

          <div>
            <h3 className="text-sm font-bold uppercase tracking-wide mb-3" style={{ color: SITE_DEEP_MUTED }}>
              Office hours
            </h3>
            {hours ? (
              <ul className="space-y-1 text-sm">
                {DAYS.map((day) => {
                  const h = hours[day]
                  return (
                    <li key={day} className="flex justify-between gap-4">
                      <span style={{ color: SITE_DEEP_MUTED }}>{DAY_LABEL[day]}</span>
                      <span>
                        {h && !h.closed && h.open && h.close ? `${fmt12(h.open)} – ${fmt12(h.close)}` : 'Closed'}
                      </span>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="text-sm" style={{ color: SITE_DEEP_MUTED }}>Call us for current hours.</p>
            )}
          </div>

          <div>
            <h3 className="text-sm font-bold uppercase tracking-wide mb-3" style={{ color: SITE_DEEP_MUTED }}>
              Explore
            </h3>
            <ul className="space-y-1.5 text-sm">
              {navLinks
                .filter((l) => !l.href.startsWith('#'))
                .map((l) => (
                  <li key={l.label}>
                    <a href={l.href} className="underline-offset-4 hover:underline">
                      {l.label}
                    </a>
                  </li>
                ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-bold uppercase tracking-wide mb-3" style={{ color: SITE_DEEP_MUTED }}>
              For patients
            </h3>
            <ul className="space-y-1.5 text-sm">
              <li>
                <a href={`${basePath}/intake-start`} className="underline-offset-4 hover:underline">
                  New patient forms
                </a>
              </li>
              <li>
                <a href={signInUrl} className="underline-offset-4 hover:underline">
                  Patient login
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div
          className="mt-10 pt-5 flex flex-col sm:flex-row justify-between gap-2 text-xs"
          style={{ borderTop: '1px solid rgba(255,255,255,0.16)', color: SITE_DEEP_MUTED }}
        >
          <span>© {year} {name}. All rights reserved.</span>
          <span className="flex gap-4">
            <a href={`${basePath}/privacy`} className="hover:underline underline-offset-4">Privacy</a>
            <a href={`${basePath}/accessibility`} className="hover:underline underline-offset-4">Accessibility</a>
          </span>
        </div>
      </div>
    </footer>
  )
}
