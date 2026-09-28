'use client'

import { useState } from 'react'
import type { SiteChromeProps } from '@/lib/site-templates/page-props'
import { SITE_INK, SITE_INK_MUTED, SITE_SURFACE, SITE_BORDER, SITE_BG, SITE_DEEP } from '@/components/clinic-site/tokens'
import SiteImage from '../../site-image'

const DISPLAY = 'var(--font-display, serif)'
const SCORE = 'var(--font-score, sans-serif)'

/**
 * Home Team header — home whites with the JERSEY TRIM under it: a team-color
 * stripe over a charcoal hairline, the two-tone piping every uniform has.
 * Logo and slab wordmark, the nav in condensed caps like a scoreboard's
 * labels, the phone, a quiet patient login, and the one team-color pill.
 */
export default function HometeamHeader({
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
    <header style={{ background: SITE_SURFACE }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-6">
        <a href={`${basePath}/`} className={`flex items-center gap-3 ${logoUrl ? 'shrink-0' : 'min-w-0'}`} aria-label={`${name} home`}>
          {logoUrl ? (
            <span className="h-12 w-auto max-w-[10rem] shrink-0 flex items-center" aria-hidden="true">
              <SiteImage displayWidth={160} src={logoUrl} alt="" className="h-12 w-auto object-contain" />
            </span>
          ) : (
            <span
              className="w-11 h-11 rounded-md flex items-center justify-center shrink-0 text-lg font-bold"
              style={{ background: SITE_DEEP, color: 'var(--c-strip, #40C0E0)', fontFamily: DISPLAY }}
              aria-hidden="true"
            >
              {name.slice(0, 1).toUpperCase()}
            </span>
          )}
          {/* With a logo there is no wordmark at all — a logo carries the
              name, and a condensed-caps nav needs the room; the name stays
              in the accessible label and the sr-only span below. */}
          <span className={`min-w-0 ${logoUrl ? 'hidden' : ''}`}>
            <span className="block truncate text-xl sm:text-[1.3rem] font-bold leading-tight" style={{ fontFamily: DISPLAY, color: SITE_INK }}>
              {name}
            </span>
            {data.profile.city && (
              <span className="block text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: SITE_INK_MUTED, fontFamily: SCORE }}>
                {data.profile.city}
                {data.profile.state ? `, ${data.profile.state}` : ''}
              </span>
            )}
          </span>
          {logoUrl && <span className="sr-only">{name}</span>}
        </a>

        <nav className="hidden lg:flex items-center gap-6 pl-8" aria-label="Site">
          {navLinks.map((l) => (
            <a
              key={l.label}
              href={l.href}
              className="whitespace-nowrap text-[0.95rem] font-bold uppercase tracking-[0.08em] underline-offset-[6px] hover:underline"
              style={{ color: SITE_INK, fontFamily: SCORE, textDecorationColor: 'var(--c-strip, #40C0E0)', textDecorationThickness: '2px' }}
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3 sm:gap-4 shrink-0">
          {phone && (
            <a href={`tel:${phone}`} className="hidden 2xl:inline text-sm font-bold" style={{ color: SITE_INK }}>
              {phone}
            </a>
          )}
          <a href={signInUrl} className="hidden md:inline text-sm font-medium underline-offset-4 hover:underline" style={{ color: SITE_INK_MUTED }}>
            Patient login
          </a>
          <a
            href={bookHref}
            className="inline-flex items-center rounded-md px-5 py-2.5 text-sm font-bold"
            style={{ background: 'var(--c-brand-strong, #157F9E)', color: 'var(--c-brand-ink, #FFFFFF)' }}
          >
            {bookLabel}
          </a>
          <button
            type="button"
            className="lg:hidden inline-flex items-center justify-center w-10 h-10 rounded-md"
            style={{ border: `1px solid ${SITE_BORDER}`, color: SITE_INK, background: SITE_SURFACE }}
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

      {/* The jersey trim */}
      <div aria-hidden="true">
        <div className="h-1" style={{ background: 'var(--c-strip, #40C0E0)' }} />
        <div className="h-px" style={{ background: SITE_DEEP }} />
      </div>

      {open && (
        <div className="lg:hidden px-6 py-5" style={{ background: SITE_BG, borderBottom: `1px solid ${SITE_BORDER}` }}>
          <nav className="flex flex-col" aria-label="Site (mobile)">
            {navLinks.map((l) => (
              <div key={l.label} style={{ borderBottom: `1px solid ${SITE_BORDER}` }}>
                <a
                  href={l.href}
                  className="block text-2xl font-bold uppercase tracking-[0.06em] py-3"
                  style={{ color: SITE_INK, fontFamily: SCORE }}
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
                className="inline-flex items-center rounded-md px-5 py-2.5 text-sm font-semibold"
                style={{ border: `1px solid ${SITE_BORDER}`, color: SITE_INK }}
              >
                Patient login
              </a>
              {phone && (
                <a href={`tel:${phone}`} className="text-sm font-bold" style={{ color: SITE_INK }}>
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
