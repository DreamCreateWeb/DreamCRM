'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Site-wide pageview beacon for clinic public pages. Mounted ONCE in
 * app/site/[slug]/layout.tsx so it fires on every page (and re-fires on
 * client-side navigation between pages in the warm Tend template).
 *
 * Generalizes the blog-only BlogViewBeacon pattern: fire-and-forget POST to
 * /api/site-view via navigator.sendBeacon (falls back to fetch keepalive). The
 * route upserts a daily (org, day, path) rollup — no PII, no per-visit row.
 *
 * - Runs client-side (useEffect) so SSR / prerender never count.
 * - Skips `?edit=1` Website Studio canvases (the clinic editing their own site).
 * - Dedupes per browser session per public path, so refreshing or bouncing
 *   between two pages doesn't inflate — one count per page per session.
 *
 * The PUBLIC path is what the visitor sees ('/', '/about', '/book', …). The
 * site is served under /site/<slug> internally, so we strip that prefix before
 * reporting (the rollup buckets the public shape patients actually visit).
 */
export default function SiteViewBeacon({ orgId, slug }: { orgId: string; slug: string }) {
  // usePathname changes on client navigation, so the effect re-runs per page
  // without a full reload — exactly what we want. (We read edit-mode from
  // window.location in the effect rather than useSearchParams, which would
  // force a Suspense boundary at build time.)
  const pathname = usePathname()

  useEffect(() => {
    if (!orgId) return
    // Don't count edit-mode canvases.
    try {
      if (new URLSearchParams(window.location.search).get('edit') === '1') return
    } catch {
      /* no window.location — bail safely */
    }

    // Derive the public path from the internal /site/<slug>/... pathname.
    let publicPath = pathname || '/'
    const prefix = `/site/${slug}`
    if (publicPath === prefix) publicPath = '/'
    else if (publicPath.startsWith(prefix + '/')) publicPath = publicPath.slice(prefix.length)
    if (!publicPath) publicPath = '/'

    // Dedupe per session + path.
    const key = `siteview_${orgId}_${publicPath}`
    try {
      if (sessionStorage.getItem(key)) return
      sessionStorage.setItem(key, '1')
    } catch {
      /* sessionStorage unavailable (private mode) — still count once per load */
    }

    const payload = JSON.stringify({ orgId, path: publicPath })
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        // sendBeacon survives the page unload + doesn't block navigation.
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
  }, [orgId, slug, pathname])

  return null
}
