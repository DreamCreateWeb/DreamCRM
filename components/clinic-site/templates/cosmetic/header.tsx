'use client'

import { useState } from 'react'
import type { SiteChromeProps } from '@/lib/site-templates/page-props'
import { SITE_BG, SITE_INK, SITE_INK_MUTED, SITE_BORDER, SITE_DEEP, SITE_DEEP_INK } from '@/components/clinic-site/tokens'

/**
 * Cosmetic/Luxury header — a single sparse bar on the cream ground: serif
 * wordmark left, top-level nav center (no dropdowns; a luxury site keeps its
 * nav quiet — child pages are reachable from the pages themselves + footer),
 * charcoal "Book a Consultation" right. Mobile: a plain disclosure menu.
 */
export default function CosmeticHeader({
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
      style={{ background: SITE_BG, borderBottom: `1px solid ${SITE_BORDER}`, height: 'var(--site-header-h, 64px)' }}
    >
      <div className="max-w-6xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-6">
        <a href={`${basePath}/`} className="flex items-center gap-3 min-w-0" aria-label={`${name} home`}>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
          ) : null}
          <span
            className="truncate text-lg tracking-tight"
            style={{ fontFamily: 'var(--font-display, Georgia, serif)', color: SITE_INK, fontWeight: 600 }}
          >
            {name}
          </span>
        </a>

        <nav className="hidden lg:flex items-center gap-7" aria-label="Site">
          {navLinks.map((l) => (
            <a
              key={l.label}
              href={l.href.startsWith('#') ? l.href : l.href}
              className="text-sm tracking-wide transition-opacity hover:opacity-70"
              style={{ color: SITE_INK }}
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-4 shrink-0">
          {phone && (
            <a href={`tel:${phone}`} className="hidden md:inline text-sm" style={{ color: SITE_INK_MUTED }}>
              {phone}
            </a>
          )}
          <a href={signInUrl} className="hidden md:inline text-sm underline-offset-4 hover:underline" style={{ color: SITE_INK_MUTED }}>
            Login
          </a>
          <a
            href={bookHref}
            className="inline-flex items-center rounded-full px-5 py-2.5 text-sm font-semibold transition-transform hover:scale-[1.02]"
            style={{ background: SITE_DEEP, color: SITE_DEEP_INK }}
          >
            {bookLabel}
          </a>
          <button
            type="button"
            className="lg:hidden inline-flex items-center justify-center w-9 h-9"
            aria-expanded={open}
            aria-label="Menu"
            onClick={() => setOpen((v) => !v)}
            style={{ color: SITE_INK }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
              {open ? <path d="M5 5l10 10M15 5L5 15" /> : <path d="M3 6h14M3 10h14M3 14h14" />}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <div
          className="lg:hidden absolute inset-x-0 top-full px-6 py-4 shadow-xl"
          style={{ background: SITE_BG, borderBottom: `1px solid ${SITE_BORDER}` }}
        >
          <nav className="flex flex-col gap-3" aria-label="Site (mobile)">
            {navLinks.map((l) => (
              <a key={l.label} href={l.href} className="text-base py-1" style={{ color: SITE_INK }} onClick={() => setOpen(false)}>
                {l.label}
              </a>
            ))}
            <a href={signInUrl} className="text-sm mt-2" style={{ color: SITE_INK_MUTED }}>
              Patient login
            </a>
          </nav>
        </div>
      )}
    </header>
  )
}
