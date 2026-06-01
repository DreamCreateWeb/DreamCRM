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
 * Tend-style two-bar site header.
 *
 * (1) Top announcement strip — hardcoded chartreuse `#E7FB7E` (Tend's
 *     signature accent regardless of brand color). Three cells: "Why us?"
 *     link · horizontal continuous-scroll marquee of value-prop chips ·
 *     "Login" pill. The marquee is pure-CSS (`translate3d` 0 → -50% over
 *     45s, double the chips array for a seamless loop, pause-on-hover,
 *     `prefers-reduced-motion` fallback to a static row).
 *
 * (2) Main nav — sits inside a cream/peach rounded-bottom drawer container
 *     (`#FEF7F1`, `border-radius: 0 0 32px 32px`) at desktop widths; goes
 *     edge-to-edge below `lg` so it looks right on mobile. Carries the
 *     logo, page-path nav, phone CTA, and Book Now.
 *
 * Drop-in across the homepage, /about, /services, /faq, /book, /careers.
 * Server-renderable, zero hydration cost.
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

  // Universal value-prop chips for the marquee. Tagline rotates in when
  // short enough so it doesn't dwarf the strip. Order matches Tend.
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
    'Modern technology',
    'Convenient hours',
    'Caring team',
  ]
  // Double the track for a seamless loop — the `-50%` translateX endpoint
  // lands exactly where the duplicate's first chip sits, so the loop has
  // no visible seam.
  const marqueeChips = [...chips, ...chips]

  // Hardcoded chartreuse + ink — distinctive Tend accent that works on top
  // of every clinic palette. Strip is decorative chrome, not content.
  const STRIP_BG = '#E7FB7E'
  const STRIP_INK = '#1C1A17'
  const NAV_CONTAINER_BG = '#FEF7F1'

  return (
    <header className="sticky top-0 z-40">
      {/* ── Top strip — chartreuse marquee, three cells ─────────────────── */}
      <div
        className="text-[12px] sm:text-[13px] font-medium"
        style={{ backgroundColor: STRIP_BG, color: STRIP_INK }}
      >
        <div className="max-w-[1400px] mx-auto px-5 sm:px-8 h-9 sm:h-10 flex items-center gap-4">
          {/* Left link */}
          <a
            href={`${basePath}/about`}
            className="hidden sm:inline-flex items-center gap-1 hover:underline shrink-0"
            style={{ color: STRIP_INK }}
          >
            Why us?
          </a>
          {/* Marquee — multiple chips visible at once, continuous left-scroll */}
          <div
            className="flex-1 relative h-full flex items-center overflow-hidden tend-marquee"
            aria-hidden="true"
          >
            <ul
              className="tend-marquee-track flex items-center whitespace-nowrap shrink-0"
              style={{ gap: '2rem' }}
            >
              {marqueeChips.map((chip, i) => (
                <li
                  key={i}
                  className="inline-flex items-center gap-2 shrink-0"
                  style={{ color: STRIP_INK }}
                >
                  <span
                    aria-hidden="true"
                    className="inline-block w-1 h-1 rounded-full"
                    style={{ backgroundColor: STRIP_INK }}
                  />
                  {chip}
                </li>
              ))}
            </ul>
          </div>
          {/* Screen-reader-only chip text — keep accessibility for assistive tech */}
          <ul className="sr-only">
            {chips.map((chip, i) => (
              <li key={i}>{chip}</li>
            ))}
          </ul>
          {/* Right login pill — dark ink on chartreuse contrast */}
          <a
            href={signInUrl}
            className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[12px] sm:text-[13px] font-semibold shrink-0 transition hover:opacity-90"
            style={{ backgroundColor: STRIP_INK, color: STRIP_BG }}
          >
            Login
          </a>
        </div>
      </div>

      <style>{`
        .tend-marquee-track {
          animation: tend-marquee-scroll 45s linear infinite;
          will-change: transform;
        }
        .tend-marquee:hover .tend-marquee-track {
          animation-play-state: paused;
        }
        @keyframes tend-marquee-scroll {
          0%   { transform: translate3d(0, 0, 0); }
          100% { transform: translate3d(-50%, 0, 0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .tend-marquee-track {
            animation: none !important;
            transform: none !important;
          }
        }
      `}</style>

      {/* ── Main nav — cream rounded-bottom drawer at desktop ──────────── */}
      <div className="lg:max-w-[1320px] lg:mx-auto lg:px-5">
        <div
          className="lg:rounded-b-[32px]"
          style={{
            backgroundColor: NAV_CONTAINER_BG,
            borderBottom: `1px solid ${BORDER}`,
            boxShadow: '0 6px 18px -10px rgba(28, 26, 23, 0.10)',
          }}
        >
          <div className="max-w-[1280px] mx-auto px-5 sm:px-8 h-16 sm:h-20 flex items-center justify-between gap-4 sm:gap-6">
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
                  className="text-[15px] font-medium px-4 py-2 rounded-md transition hover:bg-[#F4EBDD]"
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
                  className="hidden md:inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-full transition hover:bg-[#F4EBDD]"
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
                className="px-3 py-1.5 rounded-full transition hover:bg-[#F4EBDD] shrink-0"
                style={{ color: INK }}
              >
                {l.label}
              </a>
            ))}
          </nav>
        </div>
      </div>
    </header>
  )
}
