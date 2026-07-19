/**
 * The /growth hub — doorway-card assertions, incl. the page's ONE heartbeat
 * (DESIGN-SYSTEM v3 law 7): the Reviews door carries a reviews-received-per-
 * week sparkline; no other door does. Proves:
 *  - Pro+ with real weekly data → the Reviews door draws the sparkline
 *    (decorative: aria-hidden, non-interactive), and it is the ONLY spark
 *    on the page;
 *  - an empty series (fetch hiccup — the hub's best-effort .catch(() => []))
 *    renders no spark and does not break the hub;
 *  - below Pro the Reviews door is the honest upsell card — no stats fetched,
 *    no spark rendered;
 *  - the review-count stat line still rides getGoogleReviewStats as before.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import React from 'react'

let ctx: Record<string, unknown>

vi.mock('@/lib/auth/context', () => ({
  requireTenant: vi.fn(async () => ctx),
}))

const bundlesMock = vi.fn(async () => new Set<string>(['google']))
vi.mock('@/lib/services/integration-bundles', () => ({
  getActiveBundlesForSidebar: (...a: unknown[]) => bundlesMock(...(a as [])),
}))

const statsMock = vi.fn(async () => ({ count: 12, averageRating: 4.8, needsReply: 2 }))
const perWeekMock = vi.fn(
  async (): Promise<Array<{ bucket: string; value: number }>> => [
    { bucket: 'Nov 16', value: 1 },
    { bucket: 'Nov 23', value: 0 },
    { bucket: 'Nov 30', value: 2 },
    { bucket: 'Dec 7', value: 1 },
    { bucket: 'Dec 14', value: 3 },
    { bucket: 'Dec 21', value: 0 },
    { bucket: 'Dec 28', value: 2 },
    { bucket: 'Jan 4', value: 1 },
  ],
)
vi.mock('@/lib/services/google-reviews', () => ({
  getGoogleReviewStats: (...a: unknown[]) => statsMock(...(a as [])),
  getReviewsReceivedPerWeek8: (...a: unknown[]) => perWeekMock(...(a as [])),
}))

import GrowthHubPage from '@/app/(default)/growth/page'

function door(container: HTMLElement, href: string): HTMLElement {
  const links = Array.from(container.querySelectorAll('a')).filter(
    (a) => a.getAttribute('href') === href,
  )
  if (links.length !== 1) throw new Error(`Expected exactly one door for ${href}`)
  return links[0] as HTMLElement
}

/** The Sparkline's polyline is unambiguous — NavIcon svgs draw paths only. */
function sparkCount(el: HTMLElement): number {
  return el.querySelectorAll('polyline').length
}

beforeEach(() => {
  ctx = {
    tenantType: 'clinic',
    role: 'owner',
    organizationId: 'org_1',
    organizationName: 'Acme Dental',
    planTier: 'premium',
  }
  bundlesMock.mockClear()
  statsMock.mockClear()
  perWeekMock.mockClear()
})

describe('Growth hub — the Reviews-door heartbeat', () => {
  it('draws the weekly sparkline on the Reviews door (and ONLY there), decorative', async () => {
    const { container } = render(await GrowthHubPage())
    const reviews = door(container, '/growth/reviews')
    expect(sparkCount(reviews)).toBe(1)
    // Law 7 budget: one heartbeat on this hub, total.
    expect(sparkCount(container)).toBe(1)
    // Decorative + non-interactive: aria-hidden wrapper, pointer-events off.
    const wrap = reviews.querySelector('[aria-hidden="true"]') as HTMLElement
    expect(wrap).toBeTruthy()
    expect(wrap.querySelector('polyline')).toBeTruthy()
    expect(wrap.className).toContain('pointer-events-none')
    // The stat line still tells the story in text.
    expect(screen.getByText(/4\.8★ · 12 Google reviews/)).toBeTruthy()
    expect(perWeekMock).toHaveBeenCalledWith('org_1')
    cleanup()
  })

  it('renders no spark when the series comes back empty (best-effort hiccup)', async () => {
    perWeekMock.mockResolvedValueOnce([])
    const { container } = render(await GrowthHubPage())
    const reviews = door(container, '/growth/reviews')
    expect(sparkCount(container)).toBe(0)
    // The door itself still stands.
    expect(reviews.textContent).toContain('Reviews')
    cleanup()
  })

  it('below Pro: upsell card, no stats fetch, no spark', async () => {
    ctx = { ...ctx, planTier: 'basic' }
    const { container } = render(await GrowthHubPage())
    expect(door(container, '/settings/billing?upgrade=reviews')).toBeTruthy()
    expect(container.querySelector('a[href="/growth/reviews"]')).toBeNull()
    expect(sparkCount(container)).toBe(0)
    expect(statsMock).not.toHaveBeenCalled()
    expect(perWeekMock).not.toHaveBeenCalled()
    cleanup()
  })
})
