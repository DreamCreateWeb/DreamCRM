/**
 * /seo page — the Google Business local-metrics card (replaces the old static
 * "claim your GBP" checklist). Proves (UI-level):
 *  - CONNECTED → impressions / calls / directions / website clicks / bookings
 *    KPIs + a top-keywords list, honoring the window;
 *  - NOT CONNECTED → a calm connect-prompt linking to /integrations (honest —
 *    no fabricated numbers);
 *  - the existing GSC Search Console surface stays intact.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import React from 'react'
import type { GbpLocalMetrics } from '@/lib/services/gbp-metrics'

const getGbpLocalMetricsMock = vi.fn<(org: string, opts?: { days?: number }) => Promise<GbpLocalMetrics>>()

vi.mock('@/lib/auth/context', () => ({
  requireTenant: vi.fn(async () => ({
    tenantType: 'clinic',
    role: 'owner',
    organizationId: 'org_1',
    organizationName: 'Acme Dental',
    organizationSlug: 'acme',
    planTier: 'pro',
  })),
  requirePlan: vi.fn(async () => undefined),
}))

vi.mock('@/lib/services/seo', () => ({
  getSiteHealth: vi.fn(async () => ({ score: 88, checks: [] })),
  getOrganicAttribution: vi.fn(async () => ({
    windowDays: 30,
    organicLeads: 2,
    totalLeads: 5,
    organicBookings: 1,
    totalBookings: 3,
  })),
}))
vi.mock('@/lib/services/reviews', () => ({
  getReviewStats: vi.fn(async () => ({ sent30d: 10, completed30d: 4, eligibleCount: 5, byPlatform: { google: 3, healthgrades: 0, facebook: 0, yelp: 0 } })),
}))
vi.mock('@/lib/services/site-analytics', () => ({
  getSiteTraffic: vi.fn(async () => ({ windowDays: 30, total: 200, totalPrev: 150, daily: [], topPages: [] })),
}))
vi.mock('@/lib/services/gsc', () => ({
  // Clinic read view: a connected platform property with scoped clicks.
  getClinicSeoPerformance: vi.fn(async () => ({
    perf: { clicks: 50, impressions: 900, ctr: 0.05, position: 8, topQueries: [] },
    platformConnected: true,
    customDomain: false,
    scopeLabel: '/site/acme',
  })),
  getGscConnectionView: vi.fn(async () => ({ connected: false, status: 'disconnected', siteUrl: null })),
  listGscSites: vi.fn(async () => []),
  getGscPerformance: vi.fn(async () => null),
  gscOAuthConfigured: vi.fn(() => true),
}))
vi.mock('@/lib/services/gbp-metrics', () => ({
  getGbpLocalMetrics: (org: string, opts?: { days?: number }) => getGbpLocalMetricsMock(org, opts),
}))
vi.mock('./actions', () => ({
  setGscSiteAction: vi.fn(),
  disconnectGscAction: vi.fn(),
}))
vi.mock('@/components/onboarding/module-hint', () => ({ default: () => null }))

import SeoPage from '@/app/(default)/seo/page'

function baseGbp(over: Partial<GbpLocalMetrics> = {}): GbpLocalMetrics {
  return {
    connected: true,
    impressions: 4120,
    calls: 38,
    directions: 52,
    websiteClicks: 96,
    bookings: 11,
    topKeywords: [
      { term: 'dentist near me', count: 612 },
      { term: 'teeth whitening austin', count: 274 },
    ],
    windowDays: 30,
    ...over,
  }
}

async function renderPage(gbp: GbpLocalMetrics) {
  getGbpLocalMetricsMock.mockResolvedValue(gbp)
  const el = await SeoPage({ searchParams: Promise.resolve({}) })
  render(el)
}

function hrefOf(text: RegExp): string[] {
  return screen
    .getAllByText(text)
    .map((n) => n.closest('a')?.getAttribute('href'))
    .filter((h): h is string => !!h)
}

beforeEach(() => {
  getGbpLocalMetricsMock.mockReset()
})

describe('/seo Google Business card — connected', () => {
  it('renders the local-metrics KPIs + top search terms', async () => {
    await renderPage(baseGbp())
    const card = screen.getByText('Google Business Profile').closest('section')!
    // KPIs (numbers are locale-formatted).
    expect(within(card).getByText('4,120')).toBeTruthy()
    expect(within(card).getByText('38')).toBeTruthy()
    expect(within(card).getByText('52')).toBeTruthy()
    expect(within(card).getByText('96')).toBeTruthy()
    expect(within(card).getByText('11')).toBeTruthy()
    // Top keywords table.
    expect(within(card).getByText(/Top search terms on Google/i)).toBeTruthy()
    expect(within(card).getByText('dentist near me')).toBeTruthy()
    expect(within(card).getByText('612')).toBeTruthy()
    // The old static checklist copy is gone.
    expect(screen.queryByText(/Claim & verify your profile/i)).toBeNull()
  })

  it('with no keywords above threshold, shows the honest "no terms yet" note (still connected)', async () => {
    await renderPage(baseGbp({ topKeywords: [] }))
    const card = screen.getByText('Google Business Profile').closest('section')!
    expect(within(card).getByText(/No search terms above Google/i)).toBeTruthy()
    // KPIs still render.
    expect(within(card).getByText('4,120')).toBeTruthy()
  })

  it('surfaces a soft error note when connected but metrics failed to load', async () => {
    await renderPage(baseGbp({ error: 'Zernio API 402 Payment Required', impressions: 0, calls: 0, directions: 0, websiteClicks: 0, bookings: 0, topKeywords: [] }))
    const card = screen.getByText('Google Business Profile').closest('section')!
    expect(within(card).getByText(/couldn't load metrics this time/i)).toBeTruthy()
  })
})

describe('/seo Google Business card — not connected', () => {
  it('shows a connect prompt linking to /integrations (no fabricated numbers)', async () => {
    await renderPage(baseGbp({ connected: false, impressions: 0, calls: 0, directions: 0, websiteClicks: 0, bookings: 0, topKeywords: [] }))
    const card = screen.getByText('Google Business Profile').closest('section')!
    expect(within(card).getByText(/See your Google Business performance here/i)).toBeTruthy()
    expect(hrefOf(/^Connect Google Business$/)).toContain('/integrations')
    // No KPI table / keyword table when disconnected.
    expect(within(card).queryByText(/Top search terms on Google/i)).toBeNull()
  })
})

describe('/seo — existing Search Console surface stays intact', () => {
  it('still renders the Search Console section + the clinic scoped clicks', async () => {
    await renderPage(baseGbp())
    expect(screen.getByText('Google Search Console')).toBeTruthy()
    // The clinic scoped clicks (50) from the mocked getClinicSeoPerformance.
    const gsc = screen.getByText('Google Search Console').closest('section')!
    expect(within(gsc).getByText('50')).toBeTruthy()
  })
})
