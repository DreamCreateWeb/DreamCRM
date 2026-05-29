import type { ClinicSiteData } from '@/lib/services/clinic-site'
import { CLINIC_THEME } from '@/lib/clinic-site-theme'

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

/**
 * Floating-pill site header — shared across the homepage, /about, /services,
 * /faq. A white rounded-full container with backdrop blur, max-w-[1240px], so
 * the warm page color shows at the viewport edges.
 */
export default function SiteHeader({
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
  const homeHref = basePath || '/'

  return (
    <header className="sticky top-0 z-40 px-3 sm:px-5 pt-3 sm:pt-4">
      <div className="max-w-[1240px] mx-auto">
        <div
          className="rounded-full backdrop-blur-md flex items-center justify-between gap-3 sm:gap-4 px-3 sm:px-4 py-2 sm:py-2.5"
          style={{
            backgroundColor: '#FFFFFFE6',
            border: `1px solid ${BORDER}`,
            boxShadow: '0 2px 12px rgba(28, 26, 23, 0.06)',
          }}
        >
          <a href={homeHref} className="flex items-center gap-2 min-w-0 shrink pl-1.5 sm:pl-2">
            {logoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={logoUrl}
                alt={name}
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg object-cover shrink-0"
              />
            ) : (
              <span
                className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg text-white text-sm font-bold shrink-0"
                style={{ backgroundColor: brand }}
              >
                {name.charAt(0).toUpperCase()}
              </span>
            )}
            <span
              className="font-semibold text-[15px] sm:text-[17px] leading-tight truncate"
              style={{ color: INK, fontFamily: 'var(--font-display, Georgia, serif)' }}
            >
              {name}
            </span>
          </a>

          <nav className="hidden lg:flex items-center gap-0.5">
            {navLinks.map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="text-sm font-medium px-3 py-1.5 rounded-full transition hover:bg-[#F1ECE3]"
                style={{ color: INK_MUTED }}
              >
                {l.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <a
              href={signInUrl}
              className="inline-flex items-center gap-1.5 text-[13px] sm:text-sm font-medium px-2.5 sm:px-3 py-1.5 rounded-full transition hover:bg-[#F1ECE3]"
              style={{ color: INK_MUTED }}
            >
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
              <span className="hidden sm:inline">Patient Login</span>
              <span className="sm:hidden">Login</span>
            </a>
            <a
              href={bookHref}
              className="inline-flex items-center px-4 sm:px-5 py-2 sm:py-2.5 rounded-full text-[13px] sm:text-sm font-semibold text-white shadow-sm transition hover:shadow-md hover:opacity-95"
              style={{ backgroundColor: brand }}
            >
              {bookLabel}
            </a>
          </div>
        </div>
      </div>
    </header>
  )
}
