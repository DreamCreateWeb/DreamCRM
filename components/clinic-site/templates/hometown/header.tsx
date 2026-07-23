'use client'

import { useState } from 'react'
import type { SiteChromeProps } from '@/lib/site-templates/page-props'
import { SITE_INK, SITE_INK_MUTED, SITE_SURFACE, SITE_BORDER, SITE_DEEP, SITE_DEEP_INK } from '@/components/clinic-site/tokens'

/**
 * Hometown header — the classic three-tier small-practice anatomy:
 * a deep utility strip (contact link + "Call today"), a roomy main row
 * (serif wordmark, new-patient forms, the booking CTA), and a full-width
 * brand nav bar. Deliberately unfancy — this template earns trust by looking
 * like the practice answers its phone.
 */
export default function HometownHeader({
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
      {/* ── Utility strip ─────────────────────────────────────────────────── */}
      <div style={{ background: SITE_DEEP, color: SITE_DEEP_INK }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-9 flex items-center justify-between text-sm">
          <a href="#site-footer-contact" className="underline-offset-4 hover:underline">
            Contact us
          </a>
          <span className="flex items-center gap-4">
            <a href={signInUrl} className="hidden sm:inline underline-offset-4 hover:underline">
              Patient login
            </a>
            {phone && (
              <a href={`tel:${phone}`} className="font-semibold underline-offset-4 hover:underline">
                Call today · {phone}
              </a>
            )}
          </span>
        </div>
      </div>

      {/* ── Main row ──────────────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
        <a href={`${basePath}/`} className="flex items-center gap-3 min-w-0" aria-label={`${name} home`}>
          <span
            className="w-11 h-11 rounded-xl flex items-center justify-center overflow-hidden shrink-0"
            style={{ background: 'var(--c-brand-soft, #E4EAF2)', color: 'var(--c-brand-soft-ink, #1F4E79)' }}
            aria-hidden="true"
          >
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor" aria-hidden="true">
                <path d="M12 2C8 2 5 4.5 5 8c0 2.2.8 3.6 1.5 5 .8 1.6 1.2 3.4 1.4 6 .1 1.4.7 3 1.9 3 1.6 0 1-3.5 2.2-3.5S13.6 22 15.2 22c1.2 0 1.8-1.6 1.9-3 .2-2.6.6-4.4 1.4-6 .7-1.4 1.5-2.8 1.5-5 0-3.5-3-6-7-6z" />
              </svg>
            )}
          </span>
          <span className="min-w-0">
            <span
              className="block truncate text-xl sm:text-2xl font-bold leading-tight"
              style={{ fontFamily: 'var(--font-display, serif)', color: SITE_INK }}
            >
              {name}
            </span>
            {data.profile.city && (
              <span className="block text-xs" style={{ color: SITE_INK_MUTED }}>
                {data.profile.city}
                {data.profile.state ? `, ${data.profile.state}` : ''}
              </span>
            )}
          </span>
        </a>

        <div className="flex items-center gap-3 shrink-0">
          <a
            href={`${basePath}/intake-start`}
            className="hidden md:inline-flex items-center rounded-md px-4 py-2.5 text-sm font-semibold"
            style={{ background: 'var(--c-brand-soft, #E4EAF2)', color: 'var(--c-brand-soft-ink, #1F4E79)' }}
          >
            New patient forms
          </a>
          <a
            href={bookHref}
            className="inline-flex items-center rounded-md px-5 py-2.5 text-sm font-bold shadow-sm"
            style={{ background: 'var(--c-brand-strong, #1F4E79)', color: 'var(--c-brand-ink, #FFFFFF)' }}
          >
            {bookLabel}
          </a>
          <button
            type="button"
            className="lg:hidden inline-flex items-center justify-center w-10 h-10 rounded-md"
            style={{ background: SITE_SURFACE, border: `1px solid ${SITE_BORDER}`, color: SITE_INK }}
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

      {/* ── Nav bar ───────────────────────────────────────────────────────── */}
      <nav
        className="hidden lg:block"
        aria-label="Site"
        style={{ background: 'var(--c-brand-strong, #1F4E79)' }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center">
          {navLinks.map((l) => (
            <a
              key={l.label}
              href={l.href}
              className="px-4 py-3 text-sm font-semibold transition-opacity hover:opacity-80"
              style={{ color: 'var(--c-brand-ink, #FFFFFF)' }}
            >
              {l.label}
            </a>
          ))}
        </div>
      </nav>

      {open && (
        <div
          className="lg:hidden px-6 py-4 shadow-lg"
          style={{ background: SITE_SURFACE, borderTop: `1px solid ${SITE_BORDER}`, borderBottom: `1px solid ${SITE_BORDER}` }}
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
            <a href={`${basePath}/intake-start`} className="text-sm font-semibold mt-2" style={{ color: SITE_INK_MUTED }} onClick={() => setOpen(false)}>
              New patient forms
            </a>
            <a href={signInUrl} className="text-sm font-semibold mt-1" style={{ color: SITE_INK_MUTED }}>
              Patient login
            </a>
          </nav>
        </div>
      )}
    </header>
  )
}
