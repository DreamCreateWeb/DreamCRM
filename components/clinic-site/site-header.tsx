'use client'

import { useEffect, useRef, useState } from 'react'
import type { ClinicSiteData } from '@/lib/services/clinic-site'
import type { SiteNavLink } from '@/lib/clinic-site-helpers'
import { SkipToContent } from '@/components/ui/skip-to-content'
import { useFocusTrap } from '@/components/ui/use-focus-trap'

// Nav text + hairlines read the brand-derived neutral vars (set on :root by the
// site layout). Literal fallbacks keep parity if rendered outside the layout.
const INK = 'var(--c-ink, #1C1A17)'
const INK_MUTED = 'var(--c-ink-muted, #6B635A)'
const BORDER = 'var(--c-border, #E8E2D9)'

interface Props {
  data: ClinicSiteData
  basePath: string
  navLinks: SiteNavLink[]
  bookHref: string
  bookLabel: string
  signInUrl: string
}

/**
 * Tend-style two-bar site header with hide-on-scroll-down behavior.
 *
 * (1) Top announcement strip — a bright brand-DERIVED band (var --c-strip,
 *     set on :root by the site layout). Marquee of value-prop chips on the
 *     left, Login pill on the right.
 *
 * (2) Main nav — sits inside a rounded-bottom drawer container (a
 *     temperature-matched near-white, var --c-bg, `border-radius: 0 0 32px
 *     32px`) at desktop widths; goes edge-to-edge below `lg` so it looks right
 *     on mobile. Carries the logo, page-path nav, phone CTA, and Book Now.
 *
 * Mobile layout: the desktop horizontal nav is replaced by a hamburger
 * button that opens a slide-in drawer with the full nav as an accordion
 * (top-level + nested children expandable per group). Replaces the prior
 * flat sub-nav row that exploded every dropdown's children inline and
 * consumed most of the viewport before the user could see content.
 *
 * Both header bars slide as a single unit on scroll. We watch
 * `window.scrollY` and:
 *   - always show within the first 50px of the page (no jitter at top)
 *   - hide on a >5px scroll-down delta (slide up off-viewport)
 *   - show on a >5px scroll-up delta (slide back in from the top)
 *
 * The drawer is rendered as a sibling of the <header> (in a fragment)
 * because a `transform` on the header would otherwise create a new
 * containing block for `position: fixed` descendants, breaking the
 * full-viewport overlay.
 */
export default function SiteHeader({
  data,
  basePath,
  navLinks,
  bookHref,
  bookLabel,
  signInUrl,
}: Props) {
  const [hidden, setHidden] = useState(false)
  // Desktop dropdown state (by label). Mirrored close-delay below.
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  // Mobile slide-in drawer open/closed.
  const [mobileOpen, setMobileOpen] = useState(false)
  const mobileNavRef = useRef<HTMLDivElement>(null)
  // Trap focus + close on Esc while the mobile drawer is open.
  useFocusTrap(mobileOpen, mobileNavRef, { onEscape: () => setMobileOpen(false) })

  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelClose = () => {
    if (leaveTimer.current) {
      clearTimeout(leaveTimer.current)
      leaveTimer.current = null
    }
  }
  const openDropdown = (label: string) => {
    cancelClose()
    setOpenMenu(label)
  }
  const scheduleClose = (label: string) => {
    cancelClose()
    leaveTimer.current = setTimeout(() => {
      setOpenMenu((m) => (m === label ? null : m))
      leaveTimer.current = null
    }, 150)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cancelClose()
        setOpenMenu(null)
        setMobileOpen(false)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      cancelClose()
    }
  }, [])

  // Lock body scroll while the mobile drawer is open so the page doesn't
  // scroll under the overlay when the user touches it.
  useEffect(() => {
    if (!mobileOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [mobileOpen])

  useEffect(() => {
    let lastY = typeof window !== 'undefined' ? window.scrollY : 0
    const onScroll = () => {
      const y = window.scrollY
      if (y < 50) {
        setHidden(false)
      } else if (y > lastY + 5) {
        setHidden(true)
      } else if (y < lastY - 5) {
        setHidden(false)
      }
      lastY = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const { profile } = data
  const name = profile.displayName ?? data.orgName
  const brand = profile.brandColor ?? '#9CAF9F'
  const homeHref = basePath || '/'

  const trimmedTagline = profile.tagline?.trim() ?? null
  const taglineFitsAsChip =
    trimmedTagline && trimmedTagline.length > 0 && trimmedTagline.length <= 40
      ? trimmedTagline
      : null

  // Universal value-prop chips — deliberately voice/quality claims every clinic
  // can honestly make, NOT operational promises. We dropped "Same-week visits"
  // (an availability guarantee a given office may not keep) and "Most insurance
  // accepted" (a coverage promise) so the marquee never overstates on a real
  // clinic. The clinic's own tagline leads when it fits.
  const chips = [
    ...(taglineFitsAsChip ? [taglineFitsAsChip] : []),
    'No judgment, ever',
    'Gentle, modern care',
    'Insurance welcome',
    'A caring team',
    'Comfortable visits',
  ]
  const marqueeChips = [...chips, ...chips]

  // Strip + floating-nav surface now derive from the brand (layout palette
  // vars): a bright brand-tinted announcement band + a temperature-matched
  // near-white nav pill. Literal fallbacks keep parity outside the layout.
  const STRIP_BG = 'var(--c-strip, #E7FB7E)'
  const STRIP_INK = 'var(--c-strip-ink, #1C1A17)'
  const NAV_CONTAINER_BG = 'var(--c-bg, #FEF7F1)'

  return (
    <>
      <SkipToContent />
      <header
        className="sticky top-0 z-40 site-header-slide"
        data-hidden={hidden ? 'true' : 'false'}
        style={{
          transform: hidden ? 'translateY(-100%)' : 'translateY(0)',
        }}
      >
        {/* ── Top strip — chartreuse marquee + Login ─────────────────────── */}
        <div
          className="text-[12px] sm:text-[13px] font-medium"
          style={{ backgroundColor: STRIP_BG, color: STRIP_INK }}
        >
          <div className="max-w-[1400px] mx-auto px-4 sm:px-8 h-9 sm:h-10 flex items-center gap-3 sm:gap-4">
            <a
              href={`${basePath}/about`}
              className="hidden sm:inline-flex items-center gap-1 hover:underline shrink-0"
              style={{ color: STRIP_INK }}
            >
              Why us?
            </a>
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
            <ul className="sr-only">
              {chips.map((chip, i) => (
                <li key={i}>{chip}</li>
              ))}
            </ul>
            <a
              href={signInUrl}
              className="inline-flex items-center gap-1 px-3 sm:px-3.5 py-1.5 rounded-full text-[12px] sm:text-[13px] font-semibold shrink-0 transition hover:opacity-90"
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
          @media (prefers-reduced-motion: no-preference) {
            .site-header-slide {
              transition: transform 200ms ease-out;
            }
          }
          @media (prefers-reduced-motion: reduce) {
            .tend-marquee-track {
              animation: none !important;
              transform: none !important;
            }
          }
          @keyframes drawer-overlay-in {
            from { opacity: 0; }
            to   { opacity: 1; }
          }
          @keyframes drawer-slide-in {
            from { transform: translateX(100%); }
            to   { transform: translateX(0); }
          }
          .drawer-overlay { animation: drawer-overlay-in 200ms ease-out; }
          .drawer-panel   { animation: drawer-slide-in 280ms cubic-bezier(0.22, 1, 0.36, 1); }
          @media (prefers-reduced-motion: reduce) {
            .drawer-overlay, .drawer-panel { animation: none; }
          }
        `}</style>

        {/* ── Main nav — cream rounded-bottom drawer at desktop ────────── */}
        <div className="lg:max-w-[1320px] lg:mx-auto lg:px-5">
          <div
            className="lg:rounded-b-[32px]"
            style={{
              backgroundColor: NAV_CONTAINER_BG,
              borderBottom: `1px solid ${BORDER}`,
              boxShadow: '0 6px 18px -10px rgba(28, 26, 23, 0.10)',
            }}
          >
            <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 h-14 sm:h-16 lg:h-20 flex items-center justify-between gap-3 sm:gap-6">
              {/* Logo — just the clinic name in Fraunces serif. The image
                  slot (when `profile.logoUrl` is set) used to render here too
                  but reads cleaner as text-only across every clinic palette. */}
              <a href={homeHref} className="flex items-center min-w-0 shrink">
                <span
                  className="font-semibold text-[17px] sm:text-[19px] lg:text-[22px] leading-tight truncate tracking-[-0.005em]"
                  style={{ color: INK, fontFamily: 'var(--font-display, Georgia, serif)' }}
                  data-edit-field="displayName"
                  data-edit-kind="text"
                >
                  {name}
                </span>
              </a>

              {/* Desktop centered nav */}
              <nav className="hidden lg:flex items-center gap-1 flex-1 justify-center">
                {navLinks.map((l) =>
                  l.children && l.children.length > 0 ? (
                    <div
                      key={l.label}
                      className="relative"
                      onMouseEnter={() => openDropdown(l.label)}
                      onMouseLeave={() => scheduleClose(l.label)}
                    >
                      <span className="inline-flex items-center rounded-md transition hover:bg-[var(--c-surface-alt,#F4EBDD)]">
                        <a
                          href={l.href}
                          className="text-[15px] font-medium pl-4 pr-1 py-2"
                          style={{ color: INK }}
                        >
                          {l.label}
                        </a>
                        <button
                          type="button"
                          aria-haspopup="menu"
                          aria-expanded={openMenu === l.label}
                          aria-label={`${l.label} menu`}
                          onClick={() =>
                            setOpenMenu((m) => (m === l.label ? null : l.label))
                          }
                          className="pr-3 pl-1 py-2"
                          style={{ color: INK }}
                        >
                          <svg
                            className={`w-3.5 h-3.5 transition-transform ${
                              openMenu === l.label ? 'rotate-180' : ''
                            }`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                            aria-hidden="true"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                          </svg>
                        </button>
                      </span>
                      {openMenu === l.label && (
                        <div
                          className="absolute left-1/2 -translate-x-1/2 top-full pt-1.5 z-50"
                          onMouseEnter={cancelClose}
                        >
                          <ul
                            role="menu"
                            aria-label={l.label}
                            className="min-w-[240px] max-h-[70vh] overflow-y-auto rounded-2xl py-2"
                            style={{
                              backgroundColor: 'var(--c-surface, #FFFFFF)',
                              border: `1px solid ${BORDER}`,
                              boxShadow: '0 12px 32px -8px rgba(28, 26, 23, 0.18)',
                            }}
                          >
                            {l.children.map((c) => (
                              <li key={c.label} role="none">
                                <a
                                  role="menuitem"
                                  href={c.href}
                                  className="block px-5 py-2.5 text-[14px] font-medium transition hover:bg-[var(--c-surface-alt,#F4EBDD)]"
                                  style={{ color: INK }}
                                >
                                  {c.label}
                                </a>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ) : (
                    <a
                      key={l.label}
                      href={l.href}
                      className="text-[15px] font-medium px-4 py-2 rounded-md transition hover:bg-[var(--c-surface-alt,#F4EBDD)]"
                      style={{ color: INK }}
                    >
                      {l.label}
                    </a>
                  ),
                )}
              </nav>

              {/* Right CTAs */}
              <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                {profile.phone && (
                  <a
                    href={`tel:${profile.phone}`}
                    className="hidden md:inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-full transition hover:bg-[var(--c-surface-alt,#F4EBDD)]"
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
                  className="inline-flex items-center px-4 sm:px-5 lg:px-6 py-2 sm:py-2.5 lg:py-3 rounded-full text-[13px] sm:text-sm font-semibold text-white shadow-sm transition hover:shadow-md hover:opacity-95"
                  style={{ backgroundColor: `var(--c-brand-strong, ${brand})` }}
                >
                  {bookLabel}
                </a>
                {/* Mobile hamburger — only visible below lg. Tap opens the
                    full-height drawer rendered as a sibling of <header> below. */}
                <button
                  type="button"
                  onClick={() => setMobileOpen(true)}
                  aria-label="Open menu"
                  aria-expanded={mobileOpen}
                  aria-controls="mobile-nav-drawer"
                  className="lg:hidden inline-flex items-center justify-center w-10 h-10 rounded-full transition hover:bg-[var(--c-surface-alt,#F4EBDD)]"
                  style={{ color: INK }}
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ── Mobile slide-in drawer ───────────────────────────────────────── */}
      {/* Rendered OUTSIDE the <header> so the header's hide-on-scroll
          transform doesn't create a containing block for our fixed overlay. */}
      {mobileOpen && (
        <div
          ref={mobileNavRef}
          id="mobile-nav-drawer"
          className="lg:hidden fixed inset-0 z-50"
          role="dialog"
          aria-modal="true"
          aria-label="Site menu"
        >
          {/* Tap-anywhere-outside backdrop */}
          <div
            onClick={() => setMobileOpen(false)}
            className="drawer-overlay absolute inset-0"
            style={{ backgroundColor: 'rgba(28, 26, 23, 0.42)' }}
            aria-hidden="true"
          />
          {/* Drawer panel — right-aligned, ~85vw with a max */}
          <div
            className="drawer-panel absolute right-0 top-0 h-full w-[min(86vw,360px)] flex flex-col shadow-2xl"
            style={{ backgroundColor: 'var(--c-surface, #FFFFFF)' }}
          >
            {/* Drawer header */}
            <div
              className="flex items-center justify-between px-5 py-4 border-b shrink-0"
              style={{ borderColor: BORDER }}
            >
              <span
                className="text-[11px] font-semibold uppercase tracking-[0.18em]"
                style={{ color: INK_MUTED }}
              >
                Menu
              </span>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="inline-flex items-center justify-center w-10 h-10 rounded-full transition hover:bg-[var(--c-surface-alt,#F4EBDD)]"
                style={{ color: INK }}
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Nav links — flat hierarchical list. Top-level parents render
                as bold serif rows; their children render directly beneath
                indented. The drawer is scrollable so a long list doesn't
                spill; no accordion needed (it adds a tap step on phones
                where space is cheap once the drawer is open). */}
            <nav
              className="flex-1 overflow-y-auto px-2 py-3"
              aria-label="Site navigation"
            >
              <ul className="space-y-1">
                {navLinks.map((l) => {
                  const hasChildren = l.children && l.children.length > 0
                  return (
                    <li key={l.label}>
                      <a
                        href={l.href}
                        onClick={() => setMobileOpen(false)}
                        className="block px-4 py-3 text-[16px] font-semibold rounded-xl transition hover:bg-[var(--c-surface-alt,#F8F3EA)]"
                        style={{ color: INK, fontFamily: 'var(--font-display, Georgia, serif)' }}
                      >
                        {l.label}
                      </a>
                      {hasChildren && (
                        <ul
                          className="pl-3 pr-1 pb-1 mt-0.5 space-y-0.5"
                          aria-label={`${l.label} pages`}
                        >
                          {l.children!.map((c) => (
                            <li key={c.label}>
                              <a
                                href={c.href}
                                onClick={() => setMobileOpen(false)}
                                className="block px-4 py-2.5 text-[14.5px] rounded-xl transition hover:bg-[var(--c-surface-alt,#F4EBDD)]"
                                style={{ color: INK_MUTED }}
                              >
                                {c.label}
                              </a>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  )
                })}
              </ul>
            </nav>

            {/* Drawer footer — Book CTA + phone + login */}
            <div
              className="px-5 py-4 border-t shrink-0 space-y-2.5"
              style={{ borderColor: BORDER }}
            >
              <a
                href={bookHref}
                onClick={() => setMobileOpen(false)}
                className="block w-full text-center px-5 py-3 rounded-full text-base font-semibold text-white shadow-sm transition hover:shadow-md"
                style={{ backgroundColor: `var(--c-brand-strong, ${brand})` }}
              >
                {bookLabel}
              </a>
              {profile.phone && (
                <a
                  href={`tel:${profile.phone}`}
                  className="flex items-center justify-center gap-2 w-full px-5 py-3 rounded-full text-base font-medium border transition hover:shadow-sm"
                  style={{ borderColor: BORDER, color: INK }}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} style={{ color: brand }} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                  </svg>
                  {profile.phone}
                </a>
              )}
              <a
                href={signInUrl}
                className="block text-center text-[13px] font-medium pt-1 transition hover:underline"
                style={{ color: INK_MUTED }}
              >
                Patient Login
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
