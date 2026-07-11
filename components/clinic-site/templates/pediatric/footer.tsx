import type { SiteChromeProps } from '@/lib/site-templates/page-props'
import { SITE_DEEP, SITE_DEEP_INK, SITE_DEEP_MUTED } from '@/components/clinic-site/tokens'
import { DAYS, DAY_LABEL, fmt12, type HoursMap } from '@/lib/clinic-site-helpers'

/** A sprinkle of stars for the night-sky footer band. Pure decor. */
function Stars() {
  const pts = [
    [8, 18, 1.6], [22, 8, 1], [38, 22, 1.3], [55, 10, 1.8], [70, 20, 1],
    [83, 7, 1.4], [93, 16, 1], [15, 30, 1], [63, 30, 1.2], [88, 28, 1.5],
  ]
  return (
    <svg className="absolute inset-x-0 top-0 w-full h-24 pointer-events-none" viewBox="0 0 100 36" preserveAspectRatio="none" aria-hidden="true">
      {pts.map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r * 0.4} fill="currentColor" opacity={0.5} />
      ))}
    </svg>
  )
}

/**
 * Pediatric footer — the "night sky" band: the brand-hued deep color with a
 * scatter of stars, rounded top corners, and the same content slots +
 * `#site-footer-contact` anchor every template's footer carries.
 */
export default function PediatricFooter({
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
  const year = new Date().getFullYear()

  return (
    <footer
      id="site-footer-contact"
      className="relative rounded-t-[2.5rem] mt-8 overflow-hidden"
      style={{ background: SITE_DEEP, color: SITE_DEEP_INK }}
    >
      <Stars />
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-16">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5 pb-8 mb-8" style={{ borderBottom: '2px dashed rgba(255,255,255,0.18)' }}>
          <h2 className="text-2xl sm:text-3xl font-bold" style={{ fontFamily: 'var(--font-display, sans-serif)' }}>
            See you soon! 👋
          </h2>
          <a
            href={bookHref}
            className="inline-flex items-center self-start rounded-full px-6 py-3 text-sm font-bold transition-transform hover:scale-105"
            style={{ background: SITE_DEEP_INK, color: SITE_DEEP }}
          >
            {bookLabel}
          </a>
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
              Hours
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
              For families
            </h3>
            <ul className="space-y-1.5 text-sm">
              <li>
                <a href={`${basePath}/intake-start`} className="underline-offset-4 hover:underline">
                  New patient forms
                </a>
              </li>
              <li>
                <a href={signInUrl} className="underline-offset-4 hover:underline">
                  Parent login
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-5 flex flex-col sm:flex-row justify-between gap-2 text-xs" style={{ borderTop: '2px dashed rgba(255,255,255,0.18)', color: SITE_DEEP_MUTED }}>
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
