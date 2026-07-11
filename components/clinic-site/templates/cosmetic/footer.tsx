import type { SiteChromeProps } from '@/lib/site-templates/page-props'
import { SITE_DEEP, SITE_DEEP_INK, SITE_DEEP_MUTED } from '@/components/clinic-site/tokens'
import { DAYS, DAY_LABEL, fmt12, firstSentence, type HoursMap } from '@/lib/clinic-site-helpers'

/**
 * Cosmetic/Luxury footer — the charcoal editorial band. Same content slots as
 * every footer (about line, visit block w/ hours, site links, contact) and
 * the `#site-footer-contact` anchor the sitewide "Contact" nav link targets,
 * restyled: generous serif headline, thin rules, cream-on-charcoal.
 */
export default function CosmeticFooter({
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
  const about = data.profile.about ? firstSentence(data.profile.about) : null
  const year = new Date().getFullYear()

  return (
    <footer id="site-footer-contact" style={{ background: SITE_DEEP, color: SITE_DEEP_INK }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6 pb-10 mb-10" style={{ borderBottom: '1px solid rgba(244,240,231,0.18)' }}>
          <h2
            className="text-3xl sm:text-4xl leading-tight max-w-xl"
            style={{ fontFamily: 'var(--font-display, Georgia, serif)', fontStyle: 'italic', fontWeight: 500 }}
          >
            Ready when you are.
          </h2>
          <a
            href={bookHref}
            className="inline-flex items-center self-start rounded-full px-6 py-3 text-sm font-semibold transition-transform hover:scale-[1.02]"
            style={{ background: SITE_DEEP_INK, color: SITE_DEEP }}
          >
            {bookLabel}
          </a>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] mb-3" style={{ color: SITE_DEEP_MUTED }}>
              {name}
            </h3>
            {about && <p className="text-sm leading-relaxed" style={{ color: SITE_DEEP_MUTED }}>{about}</p>}
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] mb-3" style={{ color: SITE_DEEP_MUTED }}>
              Visit
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
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] mb-3" style={{ color: SITE_DEEP_MUTED }}>
              Hours
            </h3>
            {hours ? (
              <ul className="space-y-1 text-sm" style={{ color: SITE_DEEP_INK }}>
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
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] mb-3" style={{ color: SITE_DEEP_MUTED }}>
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

        <div className="mt-12 pt-6 flex flex-col sm:flex-row justify-between gap-2 text-xs" style={{ borderTop: '1px solid rgba(244,240,231,0.18)', color: SITE_DEEP_MUTED }}>
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
