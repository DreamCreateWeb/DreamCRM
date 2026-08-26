'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Pageview beacon for the PUBLIC MARKETING SITE (www) — the www twin of
 * components/clinic-site/site-view-beacon.tsx, feeding Dream Create's own
 * acquisition sensor (docs/marketing-engine.md, slice 1). Mounted ONCE in
 * app/(marketing)/layout.tsx.
 *
 * Reports raw facts only — path, query string, document.referrer — and the
 * server classifies the channel (a client can't invent one). Same rollup
 * ethos as the clinic beacon: fire-and-forget, daily aggregate, no PII, one
 * count per page per browser session.
 */
export default function MarketingViewBeacon() {
  const pathname = usePathname()

  useEffect(() => {
    const path = pathname || '/'

    // Dedupe per session + path (a refresh or back-and-forth doesn't inflate).
    const key = `mktview_${path}`
    try {
      if (sessionStorage.getItem(key)) return
      sessionStorage.setItem(key, '1')
    } catch {
      /* sessionStorage unavailable (private mode) — still count once per load */
    }

    let search = ''
    let referrer = ''
    try {
      search = window.location.search || ''
      referrer = document.referrer || ''
    } catch {
      /* non-browser environment — send what we have */
    }

    const payload = JSON.stringify({ marketing: true, path, search, referrer })
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        const blob = new Blob([payload], { type: 'application/json' })
        navigator.sendBeacon('/api/site-view', blob)
        return
      }
    } catch {
      /* fall through to fetch */
    }
    fetch('/api/site-view', {
      method: 'POST',
      keepalive: true,
      headers: { 'content-type': 'application/json' },
      body: payload,
    }).catch(() => {})
  }, [pathname])

  return null
}
