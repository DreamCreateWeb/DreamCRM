/**
 * /website/seo — the "Bing and the other search engines" card.
 *
 * The IndexNow notices (lib/services/indexnow.ts) run by themselves, so this
 * card is the only place the platform owner can see that they ran, when, and
 * whether the engines took them. Two things are held here that the pure
 * sentence test cannot see:
 *  - the card is the PLATFORM's (its own marketing site) — a clinic, and the
 *    owner in demo mode, never see it;
 *  - the time is rendered in the owner's timezone, not the server's UTC.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import React from 'react'
import type { IndexNowState } from '@/lib/indexnow'

const world = vi.hoisted(() => ({
  tenantType: 'platform' as 'platform' | 'clinic',
  state: { submitted: {}, lastRun: null, lastDelivered: null } as IndexNowState,
  timeZone: 'America/Chicago',
}))

vi.mock('@/lib/auth/context', () => ({
  requireTenant: vi.fn(async () => ({
    tenantType: world.tenantType,
    role: 'owner',
    organizationId: 'org_platform',
    organizationName: 'Dream Create',
    organizationSlug: 'dream-create',
  })),
}))
vi.mock('@/lib/services/seo', () => ({
  getSiteHealth: vi.fn(async () => ({ score: 88, checks: [] })),
  getOrganicAttribution: vi.fn(async () => ({ windowDays: 30, organicLeads: 0, totalLeads: 0, organicBookings: 0, totalBookings: 0 })),
}))
vi.mock('@/lib/services/reviews', () => ({
  getReviewStats: vi.fn(async () => ({ sent30d: 0, completed30d: 0, eligibleCount: 0, byPlatform: { google: 0, healthgrades: 0, facebook: 0, yelp: 0 } })),
}))
vi.mock('@/lib/services/site-analytics', () => ({
  getSiteTraffic: vi.fn(async () => ({ windowDays: 30, total: 0, totalPrev: 0, daily: [], topPages: [] })),
  getSeoMeta: vi.fn(async () => ({})),
}))
vi.mock('@/lib/services/clinic-site', () => ({ getClinicSiteBySlug: vi.fn(async () => null) }))
vi.mock('@/lib/services/blog', () => ({ listPublishedPosts: vi.fn(async () => []) }))
vi.mock('@/lib/services/membership', () => ({ listActivePlans: vi.fn(async () => []) }))
vi.mock('@/lib/services/careers', () => ({ getOpenJobs: vi.fn(async () => []) }))
vi.mock('@/lib/services/gsc', () => ({
  getClinicSeoPerformance: vi.fn(async () => ({ perf: null, platformConnected: false, customDomain: false, scopeLabel: null })),
  getGscConnectionView: vi.fn(async () => ({ connected: false, status: 'disconnected', siteUrl: null })),
  listGscSites: vi.fn(async () => []),
  getGscPerformance: vi.fn(async () => null),
  gscOAuthConfigured: vi.fn(() => true),
}))
vi.mock('@/lib/services/gbp-metrics', () => ({
  getGbpLocalMetrics: vi.fn(async () => ({
    connected: false, impressions: 0, calls: 0, directions: 0, websiteClicks: 0, bookings: 0, topKeywords: [], windowDays: 30,
  })),
}))
vi.mock('@/lib/services/indexnow', () => ({
  getIndexNowState: vi.fn(async () => world.state),
}))
vi.mock('@/lib/services/clinic-timezone', () => ({
  getClinicTimeZone: vi.fn(async () => world.timeZone),
}))
vi.mock('./actions', () => ({ setGscSiteAction: vi.fn(), disconnectGscAction: vi.fn() }))
vi.mock('@/components/onboarding/module-hint', () => ({ default: () => null }))

import SeoPage from '@/app/(default)/website/seo/page'

const HEADING = 'Bing and the other search engines'

async function renderPage() {
  render(await SeoPage({ searchParams: Promise.resolve({}) }))
}
const card = () => screen.getByText(HEADING).closest('section')!

beforeEach(() => {
  world.tenantType = 'platform'
  world.state = { submitted: {}, lastRun: null, lastDelivered: null }
  world.timeZone = 'America/Chicago'
})

describe('whose card it is', () => {
  it('the platform owner sees it, beside Search Console', async () => {
    await renderPage()
    expect(screen.getByText(HEADING)).toBeTruthy()
    expect(screen.getByText('Google Search Console')).toBeTruthy()
  })

  it('a clinic never does — the notices are about the platform’s own marketing site', async () => {
    world.tenantType = 'clinic'
    await renderPage()
    expect(screen.queryByText(HEADING)).toBeNull()
  })
})

describe('what it says', () => {
  it('before the first notice: says so, with no warning mark', async () => {
    await renderPage()
    expect(within(card()).getByText('No notice has gone out yet')).toBeTruthy()
    expect(within(card()).queryByLabelText('Needs attention')).toBeNull()
  })

  it('a delivered notice is dated in the OWNER’S timezone — 15:00 UTC is 9 AM Central, not 3 PM', async () => {
    const run = { at: '2026-11-24T15:00:00.000Z', outcome: 'ok' as const, status: 200, urls: 58 }
    world.state = { submitted: { '/': 'a', '/pricing': 'b' }, lastRun: run, lastDelivered: run }
    await renderPage()
    const headline = within(card()).getByText(/^Last told /)
    expect(headline.textContent).toMatch(/Nov 24/)
    expect(headline.textContent).toMatch(/9:00\sAM/)
    expect(headline.textContent).not.toMatch(/3:00\sPM/)
    // …and the zone is named, because the platform org's zone is a default,
    // not necessarily the reader's.
    expect(headline.textContent).toMatch(/9:00\sAM CST —/)
    expect(headline.textContent).toMatch(/58 pages$/)
    expect(within(card()).getByText(/^2 pages on record as announced\./)).toBeTruthy()
    expect(within(card()).queryByLabelText('Needs attention')).toBeNull()
  })

  it('a refused notice carries the warning MARK, not just a colour, and says it is retried', async () => {
    world.state = {
      submitted: {},
      lastRun: { at: '2026-11-24T15:00:00.000Z', outcome: 'key_refused', status: 403, urls: 58 },
      lastDelivered: null,
    }
    await renderPage()
    expect(within(card()).getByLabelText('Needs attention').textContent).toBe('~')
    expect(within(card()).getByText(/^The last notice did not land — /)).toBeTruthy()
    expect(within(card()).getByText(/tried again every hour/)).toBeTruthy()
  })
})
