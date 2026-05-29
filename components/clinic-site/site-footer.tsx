import type { ClinicSiteData } from '@/lib/services/clinic-site'
import { CLINIC_THEME } from '@/lib/clinic-site-theme'
import { todaysHoursLabel } from '@/lib/clinic-site-helpers'

const { INK, INK_MUTED, BORDER } = CLINIC_THEME

interface NavLink {
  label: string
  href: string
}

interface Props {
  data: ClinicSiteData
  basePath: string
  navLinks: NavLink[]
  bookHref: string
  bookLabel: string
  signInUrl: string
}

/** 4-column footer shared across the homepage, /about, /services, /faq. */
export default function SiteFooter({
  data,
  basePath,
  navLinks,
  bookHref,
  bookLabel,
  signInUrl,
}: Props) {
  const { profile } = data
  const name = profile.displayName ?? data.orgName
  const brand = profile.brandColor ?? '#9CAF9F'
  const logoUrl = profile.logoUrl ?? null
  const hours = profile.hours as Record<string, { open?: string; close?: string; closed?: boolean }> | null
  const homeHref = basePath || '/'

  return (
    <footer className="border-t" style={{ borderColor: BORDER }}>
      <div className="max-w-[1240px] mx-auto px-5 sm:px-8 py-16 sm:py-20">
        <div className="grid gap-12 sm:gap-8 sm:grid-cols-2 lg:grid-cols-12">
          {/* Brand + contact */}
          <div className="lg:col-span-5 max-w-sm">
            <a href={homeHref} className="flex items-center gap-2.5 mb-5">
              {logoUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={logoUrl} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
              ) : (
                <span
                  aria-hidden="true"
                  className="flex items-center justify-center w-9 h-9 rounded-lg text-white text-sm font-bold shrink-0"
                  style={{ backgroundColor: brand }}
                >
                  {name.charAt(0).toUpperCase()}
                </span>
              )}
              <span className="font-semibold text-[16px]" style={{ color: INK }}>{name}</span>
            </a>
            {profile.tagline && (
              <p className="text-sm leading-[1.6] mb-6" style={{ color: INK_MUTED }}>{profile.tagline}</p>
            )}
            <div className="space-y-1.5 text-sm">
              {(profile.addressLine1 || profile.city) && (
                <p style={{ color: INK_MUTED }}>
                  {[profile.addressLine1, [profile.city, profile.state].filter(Boolean).join(', ')]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              )}
              {profile.phone && (
                <a href={`tel:${profile.phone}`} className="block hover:underline" style={{ color: INK }}>
                  {profile.phone}
                </a>
              )}
              {profile.email && (
                <a href={`mailto:${profile.email}`} className="block hover:underline" style={{ color: INK }}>
                  {profile.email}
                </a>
              )}
            </div>
          </div>

          {/* Explore */}
          <div className="lg:col-span-2 lg:col-start-7">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] mb-4" style={{ color: INK_MUTED }}>
              Explore
            </p>
            <ul className="space-y-2.5">
              {navLinks.map((l) => (
                <li key={l.label}>
                  <a href={l.href} className="text-sm hover:underline" style={{ color: INK }}>{l.label}</a>
                </li>
              ))}
            </ul>
          </div>

          {/* Patients */}
          <div className="lg:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] mb-4" style={{ color: INK_MUTED }}>
              Patients
            </p>
            <ul className="space-y-2.5">
              <li>
                <a href={bookHref} className="text-sm hover:underline" style={{ color: INK }}>{bookLabel}</a>
              </li>
              <li>
                <a href={signInUrl} className="text-sm hover:underline" style={{ color: INK }}>Patient Login</a>
              </li>
              {profile.phone && (
                <li>
                  <a href={`tel:${profile.phone}`} className="text-sm hover:underline" style={{ color: INK_MUTED }}>
                    Call to book
                  </a>
                </li>
              )}
            </ul>
          </div>

          {/* Today's hours — short, scannable */}
          {hours && Object.keys(hours).length > 0 && (
            <div className="lg:col-span-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] mb-4" style={{ color: INK_MUTED }}>
                Today
              </p>
              <p className="text-sm leading-[1.55]" style={{ color: INK }}>
                {todaysHoursLabel(hours)}
              </p>
              <a
                href={`${basePath || '/'}#hours`}
                className="inline-block mt-2 text-[13px] font-medium hover:underline"
                style={{ color: brand }}
              >
                See all hours →
              </a>
            </div>
          )}
        </div>

        {/* Bottom bar */}
        <div
          className="mt-14 pt-6 border-t flex flex-col sm:flex-row items-center justify-between gap-3 text-sm"
          style={{ borderColor: BORDER }}
        >
          <span style={{ color: INK_MUTED }}>
            © {new Date().getFullYear()} {name}. All rights reserved.
          </span>
          <div className="flex items-center gap-3" style={{ color: INK_MUTED }}>
            <a href={signInUrl} className="hover:underline" style={{ color: INK_MUTED }}>
              Staff login
            </a>
            <span aria-hidden="true">·</span>
            <span>
              Powered by{' '}
              <a
                href="https://dreamcreateweb.com"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium hover:underline"
                style={{ color: INK }}
              >
                DreamCreate
              </a>
            </span>
          </div>
        </div>
      </div>
    </footer>
  )
}
