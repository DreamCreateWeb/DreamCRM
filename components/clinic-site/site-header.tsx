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
 * Two-bar edge-to-edge site header — matches hellotend.com's verbatim
 * composition. The top strip rides flush against the viewport edges in
 * the clinic's brand color (left link + auto-rotating value-prop chips +
 * login link), with the white main nav below it carrying the logo,
 * page-path nav, phone CTA, and Book Now.
 *
 * Drop-in across the homepage, /about, /services, /faq, /book, /careers —
 * the announcement strip was previously inlined inside `modern-template`,
 * meaning only the homepage carried it. Folding it into the header means
 * every public surface now leads with the same trust signal row.
 *
 * The chip rotation is CSS-only (no client JS): each chip carries an
 * `animation: tend-chip-rotate {N}s infinite` with a per-chip delay so
 * exactly one is visible at a time. Stays server-renderable, zero hydration
 * cost. Honors prefers-reduced-motion by holding the first chip still.
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

  // The "Why us?" left link points at /about for clinics that have it; for
  // a basic clinic without a long-form about page, this is still a useful
  // soft entry into the brand story. Universal trust chips on the right
  // (cycling) carry the value-prop. Tagline rotates in when short enough.
  const trimmedTagline = profile.tagline?.trim() ?? null
  const taglineFitsAsChip =
    trimmedTagline && trimmedTagline.length > 0 && trimmedTagline.length <= 40
      ? trimmedTagline
      : null

  const chips = [
    ...(taglineFitsAsChip ? [taglineFitsAsChip] : []),
    'No judgment, ever',
    'Same-week visits',
    'Most insurance accepted',
  ]
  // Each chip gets 4 seconds of stage time. Total cycle = chips.length * 4s.
  const stagePerChip = 4
  const totalCycle = chips.length * stagePerChip
  // Visible window for each chip = 1 / chips.length of the cycle.
  const visibleFraction = 100 / chips.length

  return (
    <header className="sticky top-0 z-40">
      {/* ── Top strip — brand color, three cells ───────────────────────── */}
      <div
        className="text-[12px] sm:text-[13px] font-medium"
        style={{ backgroundColor: brand, color: '#FFFFFF' }}
      >
        <div className="max-w-[1400px] mx-auto px-5 sm:px-8 h-9 sm:h-10 flex items-center justify-between gap-4">
          {/* Left link */}
          <a
            href={`${basePath}/about`}
            className="hidden sm:inline-flex items-center gap-1 hover:underline shrink-0"
          >
            Why us?
          </a>
          {/* Center rotating chips — purely CSS rotation, one visible at a time */}
          <div
            className="flex-1 relative h-full flex items-center justify-center overflow-hidden"
            aria-live="polite"
          >
            <ul className="relative flex items-center justify-center h-full w-full">
              {chips.map((chip, i) => (
                <li
                  key={i}
                  className="absolute inset-0 flex items-center justify-center px-2 text-center whitespace-nowrap truncate tend-chip"
                  style={{
                    animation: `tend-chip-rotate ${totalCycle}s linear infinite`,
                    animationDelay: `${i * stagePerChip - stagePerChip}s`,
                    opacity: i === 0 ? 1 : 0,
                  }}
                >
                  {chip}
                </li>
              ))}
            </ul>
          </div>
          {/* Right link */}
          <a
            href={signInUrl}
            className="inline-flex items-center gap-1 hover:underline shrink-0"
          >
            Login
          </a>
        </div>
      </div>

      <style>{`
        @keyframes tend-chip-rotate {
          0%, ${visibleFraction * 0.85}% { opacity: 1; }
          ${visibleFraction}%, 100% { opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .tend-chip { animation: none !important; opacity: 0 !important; }
          .tend-chip:first-child { opacity: 1 !important; }
        }
      `}</style>

      {/* ── Main nav — edge-to-edge white ──────────────────────────────── */}
      <div
        className="bg-white border-b"
        style={{ borderColor: BORDER, boxShadow: '0 1px 0 rgba(28, 26, 23, 0.02)' }}
      >
        <div className="max-w-[1400px] mx-auto px-5 sm:px-8 h-16 sm:h-20 flex items-center justify-between gap-4 sm:gap-6">
          {/* Logo */}
          <a href={homeHref} className="flex items-center gap-2.5 min-w-0 shrink">
            {logoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={logoUrl}
                alt=""
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg object-cover shrink-0"
              />
            ) : (
              <span
                aria-hidden="true"
                className="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-lg text-white text-base font-bold shrink-0"
                style={{ backgroundColor: brand }}
              >
                {name.charAt(0).toUpperCase()}
              </span>
            )}
            <span
              className="font-semibold text-[16px] sm:text-[18px] leading-tight truncate"
              style={{ color: INK, fontFamily: 'var(--font-display, Georgia, serif)' }}
            >
              {name}
            </span>
          </a>

          {/* Centered nav */}
          <nav className="hidden lg:flex items-center gap-1 flex-1 justify-center">
            {navLinks.map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="text-[15px] font-medium px-4 py-2 rounded-md transition hover:bg-[#F6F2EA]"
                style={{ color: INK }}
              >
                {l.label}
              </a>
            ))}
          </nav>

          {/* Right CTAs */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {profile.phone && (
              <a
                href={`tel:${profile.phone}`}
                className="hidden md:inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-full transition hover:bg-[#F6F2EA]"
                style={{ color: INK }}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} style={{ color: brand }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                </svg>
                <span className="hidden lg:inline">{profile.phone}</span>
              </a>
            )}
            <a
              href={bookHref}
              className="inline-flex items-center px-5 sm:px-6 py-2.5 sm:py-3 rounded-full text-[13px] sm:text-sm font-semibold text-white shadow-sm transition hover:shadow-md hover:opacity-95"
              style={{ backgroundColor: brand }}
            >
              {bookLabel}
            </a>
          </div>
        </div>

        {/* Secondary nav row — visible on mobile only, scrolls horizontally */}
        <nav
          className="lg:hidden border-t flex items-center gap-1 overflow-x-auto px-5 py-2 text-[14px] font-medium"
          style={{ borderColor: BORDER, color: INK_MUTED }}
        >
          {navLinks.map((l) => (
            <a
              key={l.label}
              href={l.href}
              className="px-3 py-1.5 rounded-full transition hover:bg-[#F6F2EA] shrink-0"
              style={{ color: INK }}
            >
              {l.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  )
}
