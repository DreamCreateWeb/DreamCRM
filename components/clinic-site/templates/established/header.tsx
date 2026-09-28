'use client'

import { useState } from 'react'
import type { SiteChromeProps } from '@/lib/site-templates/page-props'
import { SITE_INK, SITE_INK_MUTED, SITE_SURFACE, SITE_BORDER, SITE_BG } from '@/components/clinic-site/tokens'
import SiteImage from '../../site-image'

const DISPLAY = 'var(--font-display, serif)'

/**
 * Established header — one calm row on cream under a gold hairline: the
 * logo and serif wordmark, the top-level nav set in the display face, a
 * phone number, a quiet patient login, and the one accent pill. No utility
 * strip (the announcement bar above the header is the navy band already),
 * no nav bar in a color block: the register earns its authority by having
 * nothing to prove.
 */
export default function EstablishedHeader({
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
    <header style={{ background: SITE_SURFACE, borderBottom: '2px solid var(--c-strip, #C9A24A)' }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-6">
        <a href={`${basePath}/`} className="flex items-center gap-3 min-w-0" aria-label={`${name} home`}>
          {logoUrl ? (
            <span className="h-11 w-auto max-w-[9rem] shrink-0 flex items-center" aria-hidden="true">
              <SiteImage displayWidth={144} src={logoUrl} alt="" className="h-11 w-auto object-contain" />
            </span>
          ) : (
            <span
              className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 text-lg font-semibold italic"
              style={{ border: '1.5px solid var(--c-strip, #C9A24A)', color: 'var(--c-brand-strong, #B5121B)', fontFamily: DISPLAY, background: SITE_BG }}
              aria-hidden="true"
            >
              {name.slice(0, 1).toUpperCase()}
            </span>
          )}
          {/* With a logo, the wordmark steps back (most logos carry the name)
              and returns only where there is room; the name is always in the
              accessible label above and in this sr-only span. */}
          <span className={`min-w-0 ${logoUrl ? 'hidden xl:block' : ''}`}>
            <span className="block truncate text-xl sm:text-[1.35rem] font-semibold leading-tight" style={{ fontFamily: DISPLAY, color: SITE_INK }}>
              {name}
            </span>
            {data.profile.city && (
              <span className="block text-xs uppercase tracking-[0.16em]" style={{ color: SITE_INK_MUTED }}>
                {data.profile.city}
                {data.profile.state ? `, ${data.profile.state}` : ''}
              </span>
            )}
          </span>
          {logoUrl && <span className="sr-only xl:hidden">{name}</span>}
        </a>

        <nav className="hidden lg:flex items-center gap-6" aria-label="Site">
          {navLinks.map((l) => (
            <a
              key={l.label}
              href={l.href}
              className="whitespace-nowrap text-[0.95rem] font-medium underline-offset-[6px] hover:underline"
              style={{ color: SITE_INK, textDecorationColor: 'var(--c-strip, #C9A24A)' }}
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3 sm:gap-4 shrink-0">
          {phone && (
            <a href={`tel:${phone}`} className="hidden xl:inline text-sm font-semibold" style={{ color: SITE_INK }}>
              {phone}
            </a>
          )}
          <a href={signInUrl} className="hidden md:inline text-sm font-medium underline-offset-4 hover:underline" style={{ color: SITE_INK_MUTED }}>
            Patient login
          </a>
          <a
            href={bookHref}
            className="inline-flex items-center rounded-full px-5 py-2.5 text-sm font-bold"
            style={{ background: 'var(--c-brand-strong, #B5121B)', color: 'var(--c-brand-ink, #FFFFFF)' }}
          >
            {bookLabel}
          </a>
          <button
            type="button"
            className="lg:hidden inline-flex items-center justify-center w-10 h-10 rounded-full"
            style={{ border: `1px solid ${SITE_BORDER}`, color: SITE_INK, background: SITE_SURFACE }}
            aria-expanded={open}
            aria-label="Menu"
            onClick={() => setOpen((v) => !v)}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
              {open ? <path d="M5 5l10 10M15 5L5 15" /> : <path d="M3 6h14M3 10h14M3 14h14" />}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <div className="lg:hidden px-6 py-5" style={{ background: SITE_BG, borderTop: `1px solid ${SITE_BORDER}` }}>
          <nav className="flex flex-col" aria-label="Site (mobile)">
            {navLinks.map((l) => (
              <div key={l.label} style={{ borderBottom: `1px solid ${SITE_BORDER}` }}>
                <a
                  href={l.href}
                  className="block text-2xl font-semibold py-3"
                  style={{ color: SITE_INK, fontFamily: DISPLAY }}
                  onClick={() => setOpen(false)}
                >
                  {l.label}
                </a>
                {l.children && l.children.length > 0 && (
                  <div className="pb-3 flex flex-col gap-1.5">
                    {l.children.map((c) => (
                      <a key={c.label} href={c.href} className="text-sm" style={{ color: SITE_INK_MUTED }} onClick={() => setOpen(false)}>
                        {c.label}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-3 pt-5">
              <a
                href={signInUrl}
                className="inline-flex items-center rounded-full px-5 py-2.5 text-sm font-semibold"
                style={{ border: `1px solid ${SITE_BORDER}`, color: SITE_INK }}
              >
                Patient login
              </a>
              {phone && (
                <a href={`tel:${phone}`} className="text-sm font-semibold" style={{ color: SITE_INK }}>
                  {phone}
                </a>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  )
}
