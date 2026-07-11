'use client'

import { useState } from 'react'
import type { SiteChromeProps } from '@/lib/site-templates/page-props'
import { SITE_BG, SITE_INK, SITE_INK_MUTED, SITE_SURFACE, SITE_BORDER } from '@/components/clinic-site/tokens'

/**
 * Pediatric header — round and friendly: logo bubble + Fredoka wordmark,
 * pill nav on a pastel ground, a big bouncy Book button. Dropdown children
 * render as a simple tap-to-open list on mobile; on desktop the top-level
 * pills link straight to their parent pages (kids' parents are on phones —
 * the mobile menu is the real nav).
 */
export default function PediatricHeader({
  data,
  basePath,
  navLinks,
  bookHref,
  bookLabel,
  signInUrl,
}: SiteChromeProps) {
  const [open, setOpen] = useState(false)
  const name = data.profile.displayName ?? data.orgName
  const logoUrl = data.profile.logoUrl ?? null
  const phone = data.profile.phone ?? null

  return (
    <header
      className="sticky top-0 z-40"
      style={{ background: SITE_BG, borderBottom: `2px solid ${SITE_BORDER}`, height: 'var(--site-header-h, 64px)' }}
    >
      <div className="max-w-6xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-4">
        <a href={`${basePath}/`} className="flex items-center gap-2.5 min-w-0" aria-label={`${name} home`}>
          <span
            className="w-9 h-9 rounded-full flex items-center justify-center overflow-hidden shrink-0 text-lg"
            style={{ background: 'var(--c-brand-soft, #EFEAE1)' }}
            aria-hidden="true"
          >
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              '🦷'
            )}
          </span>
          <span
            className="truncate text-lg font-bold"
            style={{ fontFamily: 'var(--font-display, sans-serif)', color: SITE_INK }}
          >
            {name}
          </span>
        </a>

        <nav className="hidden lg:flex items-center gap-1.5" aria-label="Site">
          {navLinks.map((l) => (
            <a
              key={l.label}
              href={l.href}
              className="rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors"
              style={{ color: SITE_INK }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--c-surface-alt, #F4EBDD)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <a href={signInUrl} className="hidden md:inline text-sm font-semibold" style={{ color: SITE_INK_MUTED }}>
            Login
          </a>
          <a
            href={bookHref}
            className="inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-bold shadow-sm transition-transform hover:scale-105"
            style={{ background: 'var(--c-brand-strong, #36514c)', color: 'var(--c-brand-ink, #FFFFFF)' }}
          >
            <span aria-hidden="true">🗓️</span> {bookLabel}
          </a>
          <button
            type="button"
            className="lg:hidden inline-flex items-center justify-center w-10 h-10 rounded-full"
            style={{ background: SITE_SURFACE, border: `2px solid ${SITE_BORDER}`, color: SITE_INK }}
            aria-expanded={open}
            aria-label="Menu"
            onClick={() => setOpen((v) => !v)}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
              {open ? <path d="M5 5l10 10M15 5L5 15" /> : <path d="M3 6h14M3 10h14M3 14h14" />}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <div
          className="lg:hidden absolute inset-x-0 top-full px-6 py-4 shadow-xl rounded-b-3xl"
          style={{ background: SITE_BG, borderBottom: `2px solid ${SITE_BORDER}` }}
        >
          <nav className="flex flex-col gap-1" aria-label="Site (mobile)">
            {navLinks.map((l) => (
              <div key={l.label}>
                <a href={l.href} className="block text-base font-semibold py-2" style={{ color: SITE_INK }} onClick={() => setOpen(false)}>
                  {l.label}
                </a>
                {l.children && l.children.length > 0 && (
                  <div className="pl-4 pb-1 flex flex-col gap-1">
                    {l.children.map((c) => (
                      <a key={c.label} href={c.href} className="text-sm py-1" style={{ color: SITE_INK_MUTED }} onClick={() => setOpen(false)}>
                        {c.label}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <a href={signInUrl} className="text-sm font-semibold mt-2" style={{ color: SITE_INK_MUTED }}>
              Patient login
            </a>
          </nav>
        </div>
      )}
    </header>
  )
}
