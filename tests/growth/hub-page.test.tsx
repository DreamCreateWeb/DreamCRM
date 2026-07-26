/**
 * The /growth hub — v3 redesign ("acquisition leads, two engines"). Proves:
 *  - the hero is the New-patients scoreboard: the trailing-4-week total, the
 *    12-week heartbeat sparkline (the page's ONE spark, Design System law 7),
 *    and the four channel rows with REAL numbers or honest connect states;
 *  - engine #2 renders the reactivation funnel from getRecallStats and its
 *    status line: next scheduled send / quiet-engine nudge / calm default;
 *  - the news cards carry attention tones (leads to triage, reviews waiting
 *    on a reply incl. the 1–2★ escalation, social activity);
 *  - every read is best-effort — a failed stat never breaks the page;
 *  - Audiences/Analytics/queue demote to the utility footer.
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

const statsMock = vi.fn(async () => ({
  count: 12,
  averageRating: 4.8,
  needsReply: 0,
  lowStarNeedsReply: 0,
}))
vi.mock('@/lib/services/google-reviews', () => ({
  getGoogleReviewStats: (...a: unknown[]) => statsMock(...(a as [])),
}))

// 12 clinic-local weeks; last 4 sum to 9, prior 4 sum to 6 (+50%).
const weeklyMock = vi.fn(async () => [
  { bucket: 'May 3', value: 1 },
  { bucket: 'May 10', value: 2 },
  { bucket: 'May 17', value: 0 },
  { bucket: 'May 24', value: 1 },
  { bucket: 'May 31', value: 2 },
  { bucket: 'Jun 7', value: 1 },
  { bucket: 'Jun 14', value: 2 },
  { bucket: 'Jun 21', value: 1 },
  { bucket: 'Jun 28', value: 3 },
  { bucket: 'Jul 5', value: 2 },
  { bucket: 'Jul 12', value: 1 },
  { bucket: 'Jul 19', value: 3 },
])
vi.mock('@/lib/services/patients', () => ({
  getNewPatientsPerWeek12: (...a: unknown[]) => weeklyMock(...(a as [])),
}))

const baseRecall = {
  recallDueCount: 50,
  recallDueReachableCount: 41,
  lapsedCount: 90,
  lapsedReachableCount: 70,
  newPatientsCount: 4,
  birthdayThisMonthCount: 2,
  sentThisMonthCount: 128,
  bookedFromRecallCount: 7,
  openRate30d: 62,
  clickRate30d: 18,
  optedOutCount: 3,
  marketableCount: 400,
  upcomingSends: [] as unknown[],
  recentSends: [] as unknown[],
  recentActivity: [] as unknown[],
}
const recallMock = vi.fn(async (): Promise<Record<string, unknown>> => ({ ...baseRecall }))
vi.mock('@/lib/services/recall-stats', () => ({
  getRecallStats: (...a: unknown[]) => recallMock(...(a as [])),
}))

const sitePerfMock = vi.fn(async () => ({
  traffic: { windowDays: 30, total: 412, totalPrev: 300, daily: [], topPages: [] },
  leads30d: 9,
  conversionPct: 2,
}))
vi.mock('@/lib/services/site-analytics', () => ({
  getSitePerformance: (...a: unknown[]) => sitePerfMock(...(a as [])),
}))

const gbpMock = vi.fn(
  async (): Promise<Record<string, unknown>> => ({
    connected: true,
    impressions: 900,
    calls: 14,
    directions: 22,
    websiteClicks: 31,
    bookings: 2,
    topKeywords: [],
    windowDays: 30,
  }),
)
vi.mock('@/lib/services/gbp-metrics', () => ({
  getGbpLocalMetrics: (...a: unknown[]) => gbpMock(...(a as [])),
}))

const postCountsMock = vi.fn(
  async (): Promise<Record<string, number>> => ({ google: 3, facebook: 2 }),
)
vi.mock('@/lib/services/social-posts', () => ({
  getPublishedPostCounts: (...a: unknown[]) => postCountsMock(...(a as [])),
}))

const leadCountsMock = vi.fn(async () => ({
  new: 5,
  contacted: 2,
  converted: 8,
  archived: 1,
  total: 16,
}))
vi.mock('@/lib/services/leads', () => ({
  getLeadCounts: (...a: unknown[]) => leadCountsMock(...(a as [])),
}))

const audiencesMock = vi.fn(async (): Promise<unknown[]> => [{ id: 1 }, { id: 2 }, { id: 3 }])
vi.mock('@/lib/services/marketing', () => ({
  listAudiences: (...a: unknown[]) => audiencesMock(...(a as [])),
}))

vi.mock('@/lib/services/clinic-timezone', () => ({
  getClinicTimeZone: vi.fn(async () => 'America/Chicago'),
}))

import GrowthHubPage from '@/app/(default)/growth/page'

beforeEach(() => {
  ctx = {
    tenantType: 'clinic',
    role: 'owner',
    organizationId: 'org_1',
    organizationName: 'Acme Dental',
  }
  bundlesMock.mockClear()
  statsMock.mockClear()
  weeklyMock.mockClear()
  recallMock.mockClear()
  gbpMock.mockClear()
})

describe('the acquisition hero', () => {
  it('leads with new patients: 4-week total, delta, and the ONE heartbeat spark', async () => {
    const { container } = render(await GrowthHubPage())
    expect(screen.getByText('New patients')).toBeTruthy()
    expect(screen.getByText('9')).toBeTruthy() // last-4-weeks sum
    expect(screen.getByText(/▲ 50% vs prior 4/)).toBeTruthy()
    // Exactly one heartbeat on the whole page (law 7), decorative.
    const sparks = container.querySelectorAll('svg polyline')
    expect(sparks.length).toBe(1)
    expect(sparks[0].closest('svg')!.getAttribute('aria-hidden')).toBe('true')
    cleanup()
  })

  it('shows every channel with a real number when connected', async () => {
    render(await GrowthHubPage())
    expect(screen.getByText('412 visits → 9 leads · 30d')).toBeTruthy()
    expect(screen.getByText('4.8★ · 12 Google reviews')).toBeTruthy()
    expect(screen.getByText('14 calls · 22 direction requests · 30d')).toBeTruthy()
    expect(screen.getByText('5 posts published · 30d')).toBeTruthy()
    cleanup()
  })

  it('unconnected channels say so honestly and route to Integrations', async () => {
    bundlesMock.mockResolvedValueOnce(new Set<string>())
    gbpMock.mockResolvedValueOnce({
      connected: false,
      impressions: 0,
      calls: 0,
      directions: 0,
      websiteClicks: 0,
      bookings: 0,
      topKeywords: [],
      windowDays: 30,
    })
    const { container } = render(await GrowthHubPage())
    expect(screen.getByText(/not connected — the local-search numbers live here/)).toBeTruthy()
    expect(
      screen.getAllByText(/not connected — the composer unlocks in Integrations/i).length,
    ).toBeGreaterThanOrEqual(1)
    expect(container.querySelectorAll('a[href="/integrations"]').length).toBeGreaterThanOrEqual(2)
    cleanup()
  })

  it('a delta needs a prior period — no percent renders when the prior 4 weeks are zero', async () => {
    weeklyMock.mockResolvedValueOnce([
      { bucket: 'Jun 28', value: 0 },
      { bucket: 'Jul 5', value: 2 },
      { bucket: 'Jul 12', value: 1 },
      { bucket: 'Jul 19', value: 3 },
    ])
    render(await GrowthHubPage())
    expect(screen.queryByText(/vs prior 4/)).toBeNull()
    cleanup()
  })
})

describe('engine #2 — the reactivation funnel', () => {
  it('renders the four stages with linked real numbers', async () => {
    const { container } = render(await GrowthHubPage())
    expect(screen.getByText('Your own list — the reactivation engine')).toBeTruthy()
    expect(screen.getByText('41')).toBeTruthy()
    expect(screen.getByText('128')).toBeTruthy()
    expect(screen.getByText('62%')).toBeTruthy()
    expect(screen.getByText('7')).toBeTruthy()
    // The due stage routes to the queue, not the generic outreach page.
    const due = screen.getByLabelText(/41 patients due and reachable/)
    expect(due.getAttribute('href')).toBe('/growth/outreach/queue')
    expect(container.querySelector('a[href="/growth/outreach"]')).toBeTruthy()
    cleanup()
  })

  it('quiet engine: due patients + nothing scheduled → the warn nudge', async () => {
    render(await GrowthHubPage())
    expect(screen.getByText(/41 patients are due and nothing is/)).toBeTruthy()
    cleanup()
  })

  it('a scheduled send replaces the nudge with the engine-status line', async () => {
    recallMock.mockResolvedValueOnce({
      ...baseRecall,
      upcomingSends: [
        {
          id: 9,
          name: 'Hygiene recall',
          subject: null,
          scheduledAt: new Date('2026-07-28T14:00:00Z'),
          audienceName: 'Overdue 6mo',
          audienceRecipientCount: 41,
        },
      ],
    })
    render(await GrowthHubPage())
    expect(screen.getByText(/Next send:/)).toBeTruthy()
    expect(screen.getByText('Hygiene recall')).toBeTruthy()
    expect(screen.queryByText(/nothing is scheduled to reach them/)).toBeNull()
    cleanup()
  })

  it('a recall-stats hiccup drops the band, never the page', async () => {
    recallMock.mockRejectedValueOnce(new Error('db blip'))
    render(await GrowthHubPage())
    expect(screen.queryByText('Your own list — the reactivation engine')).toBeNull()
    expect(screen.getByText('New patients')).toBeTruthy()
    cleanup()
  })
})

describe("what's happening — attention tones", () => {
  it('new leads to triage carry the warn tone and route to /leads', async () => {
    render(await GrowthHubPage())
    const leads = screen.getByLabelText('Leads — 5 new to triage')
    expect(leads.getAttribute('href')).toBe('/leads')
    cleanup()
  })

  it('reviews waiting on a reply surface the count — 1–2★ escalations upgrade it to urgent', async () => {
    statsMock.mockResolvedValueOnce({
      count: 12,
      averageRating: 4.4,
      needsReply: 3,
      lowStarNeedsReply: 1,
    })
    render(await GrowthHubPage())
    const card = screen.getByLabelText(/Reviews — 3 waiting on a reply, 1 rated 1 to 2 stars/)
    expect(card.getAttribute('href')).toBe('/growth/reviews/received')
    expect(screen.getByText(/1 rated 1–2★/)).toBeTruthy()
    cleanup()
  })

  it('all-replied reviews show the calm count card instead', async () => {
    render(await GrowthHubPage())
    const card = screen.getByLabelText(/Reviews — 12 Google reviews, 4\.8 star average, none waiting/)
    expect(card.getAttribute('href')).toBe('/growth/reviews')
    cleanup()
  })
})

describe('the utility footer + header actions', () => {
  it('Audiences, the queue (with a real nudge count), and Analytics demote to the footer', async () => {
    render(await GrowthHubPage())
    expect(screen.getByText('3 saved')).toBeTruthy()
    expect(screen.getByText('111 worth a nudge')).toBeTruthy() // 41 due + 70 lapsed reachable
    expect(screen.getByText('the whole picture')).toBeTruthy()
    cleanup()
  })

  it('New campaign is the header primary, deep-linking the outreach modal', async () => {
    const { container } = render(await GrowthHubPage())
    expect(container.querySelector('a[href="/growth/outreach?new=1"]')).toBeTruthy()
    cleanup()
  })
})
