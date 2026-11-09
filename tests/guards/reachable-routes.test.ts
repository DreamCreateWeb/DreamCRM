import { describe, it, expect } from 'vitest'
import { unreferencedRoutes } from '../../scripts/find-dead-bones.mjs'

/**
 * ML-60 — every app page route is referenced somewhere (a sidebar registry,
 * lib/known-routes.ts, a Link/href/redirect, middleware, a test, an email) or
 * is on this DATED ALLOWLIST, which may only SHRINK.
 *
 * Today's entries are all deliberate permanent redirects for OLD LINKS
 * (bookmarks, emailed links, patient-timeline and notification links carrying
 * ids) — the external reader is the reason they stay (2026-11-09, ML-60).
 */
const ALLOWLIST: Record<string, string> = {
  '/google-posts': '2026-11-09',
  '/marketing/audiences': '2026-11-09',
  '/marketing/campaigns': '2026-11-09',
  '/marketing/campaigns/[id]': '2026-11-09',
  '/marketing/outreach': '2026-11-09',
  '/shop/collections': '2026-11-09',
  '/shop/memberships': '2026-11-09',
  '/shop/payments': '2026-11-09',
  '/onboarding-03': '2026-11-09',
  '/onboarding-04': '2026-11-09',
}

describe('reachable routes', () => {
  const urls: string[] = unreferencedRoutes().map((d: { url: string }) => d.url)

  it('every page route is referenced or on the dated allowlist', () => {
    expect(urls.filter((u) => !(u in ALLOWLIST))).toEqual([])
  })

  it('the allowlist only shrinks: no stale entries', () => {
    expect(Object.keys(ALLOWLIST).filter((u) => !urls.includes(u))).toEqual([])
  })
})
