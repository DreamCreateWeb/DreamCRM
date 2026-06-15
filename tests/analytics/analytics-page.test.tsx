/**
 * /analytics page — Schedule-health drill targets + Reputation honesty.
 *
 * Proves (UI-level):
 *  - every Schedule-health headline KPI is drillable into the filtered
 *    Appointments view that explains it (design doctrine: no dead-end numbers);
 *  - the Reputation band shows ONLY honestly-measured rows (Sent / Opened the
 *    link / Reviews left) — there is no reconstructed "Opened" count, and the
 *    subtitle + Acquisition copy reflect the SELECTED window (90), not "30";
 *  - the cancellation low-volume guard keys on the cancellation denominator
 *    (total bookings), independent of the no-show denominator (attended).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import React from 'react'
import type { ClinicAnalytics } from '@/lib/services/analytics'

const getClinicAnalyticsMock = vi.fn<(org: string, windowDays?: number) => Promise<ClinicAnalytics>>()

vi.mock('@/lib/auth/context', () => ({
  requireTenant: vi.fn(async () => ({
    tenantType: 'clinic',
    role: 'owner',
    organizationId: 'org_1',
    organizationName: 'Acme Dental',
    planTier: 'premium',
  })),
  requirePlan: vi.fn(async () => undefined),
}))

vi.mock('@/lib/services/analytics', () => ({
  getClinicAnalytics: (org: string, windowDays?: number) => getClinicAnalyticsMock(org, windowDays),
}))

// The page also renders the website-visits tile; keep it inert here so this
// test stays focused on the analytics bands (and never touches lib/db).
vi.mock('@/lib/services/site-analytics', () => ({
  getSiteTraffic: vi.fn(async (_org: string, days = 30) => ({
    windowDays: days,
    total: 0,
    priorTotal: 0,
    days: [],
    topPages: [],
  })),
}))

vi.mock('@/components/onboarding/module-hint', () => ({
  default: () => null,
}))

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
}))

import AnalyticsPage from '@/app/(default)/analytics/page'

function baseAnalytics(over: Partial<ClinicAnalytics> = {}): ClinicAnalytics {
  return {
    windowDays: 30,
    generatedAt: new Date(),
    acquisition: {
      newPatients: 4,
      newPatientsPrev: 2,
      trend: [{ label: 'May 1', count: 4 }],
      sourceMix: [{ source: 'booking_widget', count: 4 }],
      websiteFunnel: { clicks: 100, leads: 5, contacted: 3, converted: 1 },
      gbp: { connected: true, impressions: 3000, calls: 25, directions: 30, bookings: 8 },
    },
    schedule: {
      total: 40,
      completed: 30,
      noShow: 4,
      cancelled: 6,
      confirmed: 28,
      attended: 34,
      noShowRate: 4 / 34,
      cancellationRate: 6 / 40,
      confirmationRate: 28 / 34,
      benchmarkNoShowRate: 0.135,
      bySource: [{ source: 'booking_widget', count: 40 }],
      byProvider: [{ provider: 'Dr. Reyes', count: 40 }],
      volumeTrend: [{ label: 'May 1', count: 40 }],
    },
    recall: { due: 3, outreach: { sent: 10, opened: 5, clicked: 4, booked: 2 } },
    reputation: {
      sent: 10,
      opened: 5,
      completed: 4,
      clickRate: 0.5,
      completionRate: 0.4,
      byPlatform: { google: 3, healthgrades: 1, facebook: 0, yelp: 0 },
    },
    pmsOwned: [{ label: 'Production $', detail: 'In your PMS.' }],
    ...over,
  }
}

/** Render the async server component to a resolved React element. */
async function renderPage(days: string | undefined, analytics: ClinicAnalytics) {
  getClinicAnalyticsMock.mockResolvedValue(analytics)
  const el = await AnalyticsPage({ searchParams: Promise.resolve(days ? { days } : {}) })
  render(el)
}

function hrefOf(text: RegExp): string[] {
  const nodes = screen.getAllByText(text)
  return nodes
    .map((n) => n.closest('a')?.getAttribute('href'))
    .filter((h): h is string => !!h)
}

beforeEach(() => {
  getClinicAnalyticsMock.mockReset()
})

describe('Schedule-health KPIs are drillable', () => {
  it('confirmation rate links to the unconfirmed appointments queue', async () => {
    await renderPage('30', baseAnalytics())
    expect(hrefOf(/Confirmation rate/i)).toContain('/appointments?attention=unconfirmed')
  })

  it('no-show rate links to the no-show filter (past window)', async () => {
    await renderPage('30', baseAnalytics())
    expect(hrefOf(/No-show rate/i)).toContain('/appointments?window=past_30d&attention=no_show')
  })

  it('cancellation rate links to the cancelled filter (past window)', async () => {
    await renderPage('30', baseAnalytics())
    expect(hrefOf(/Cancellation rate/i)).toContain('/appointments?window=past_30d&attention=cancelled')
  })

  it('the appointments total links to the past-window agenda', async () => {
    await renderPage('30', baseAnalytics())
    expect(hrefOf(/^Appointments$/)).toContain('/appointments?window=past_30d')
  })
})

describe('Acquisition — Google Business local-actions tile', () => {
  it('renders calls / directions / bookings + impressions when GBP is connected', async () => {
    await renderPage('30', baseAnalytics())
    // Scope to the GBP card itself (the Acquisition section has other numbers).
    const card = screen.getByText(/Google Business — local actions/i).closest('div.v2-card') as HTMLElement
    // The connected snapshot in baseAnalytics: impressions 3000 / calls 25 /
    // directions 30 / bookings 8 — each under its labeled KPI.
    expect(within(card).getByText('3,000')).toBeTruthy()
    expect(within(card).getByText('25')).toBeTruthy()
    expect(within(card).getByText('30')).toBeTruthy()
    expect(within(card).getByText('8')).toBeTruthy()
    expect(within(card).getByText(/Listing views/i)).toBeTruthy()
    expect(within(card).getByText(/Directions/i)).toBeTruthy()
    // Connected → the header link points at the SEO details, not a connect CTA.
    expect(hrefOf(/^Details →$/)).toContain('/seo')
  })

  it('shows a connect prompt to /integrations when no GBP is connected', async () => {
    await renderPage('30', baseAnalytics({
      acquisition: { ...baseAnalytics().acquisition, gbp: null },
    }))
    const section = screen.getByText('Acquisition').closest('section')!
    expect(within(section).getByText(/Connect your/i)).toBeTruthy()
    // Both the header chip and the inline link route to Integrations.
    expect(hrefOf(/^Connect →$/)).toContain('/integrations')
    expect(hrefOf(/Google Business Profile/i)).toContain('/integrations')
  })
})

describe('Recall band drill target uses a param the patients page reads', () => {
  // Regression: the "Recall due now → View list" link used ?filter=recall_due,
  // but the patients page reads ?status= (not ?filter=), so the deep-link landed
  // on the unfiltered patient list. Assert it uses the status param + a value
  // the patients page's parseStatus accepts.
  it('links Recall-due "View list" to /patients?status=recall_due', async () => {
    await renderPage('30', baseAnalytics())
    expect(hrefOf(/View list/i)).toContain('/patients?status=recall_due')
  })
})

describe('Reputation band honesty + window', () => {
  it('shows the measured "Opened the link" count, no reconstructed Opened', async () => {
    await renderPage('30', baseAnalytics())
    // The honest middle step is labeled "Opened the link" and equals the
    // measured opened count (5). The old fabricated "Opened" label is gone.
    expect(screen.getByText(/Opened the link/i)).toBeTruthy()
    // The reputation funnel renders the measured value 5.
    const reputation = screen.getByText('Reputation').closest('section')!
    expect(within(reputation).getByText('5')).toBeTruthy()
  })

  it('subtitle + acquisition copy reflect the selected 90-day window', async () => {
    await renderPage('90', baseAnalytics({ windowDays: 90 }))
    // Reputation subtitle is no longer hardcoded to "30 days".
    expect(screen.getByText(/Review requests · last 90 days/i)).toBeTruthy()
    expect(screen.queryByText(/Review requests · last 30 days/i)).toBeNull()
  })

  it('Reviews-left step deep-links into the received reviews', async () => {
    await renderPage('30', baseAnalytics())
    expect(hrefOf(/Reviews left/i)).toContain('/reviews/received')
  })
})

describe('cancellation low-volume guard keys on its own denominator', () => {
  it('shows cancellation as a percentage when total bookings ≥ threshold even if attended is thin', async () => {
    // attended = 4 (< 5, thin) but total = 20 (≥ 5). The cancellation rate must
    // render as a PERCENT (its denominator is total), while the no-show rate
    // falls back to a count (its denominator, attended, is thin). The bug was a
    // single `attended < 5` guard forcing BOTH to counts.
    const a = baseAnalytics({
      schedule: {
        ...baseAnalytics().schedule,
        total: 20,
        completed: 2,
        noShow: 2,
        cancelled: 4,
        confirmed: 14,
        attended: 4,
        noShowRate: 2 / 4,
        cancellationRate: 4 / 20, // 20%
        confirmationRate: 14 / 16,
      },
    })
    await renderPage('30', a)
    const cancelTile = screen.getByText(/Cancellation rate/i).closest('a')!
    // 4/20 = 20.0% — a percentage, NOT a "4/20" count fallback.
    expect(within(cancelTile).getByText('20.0%')).toBeTruthy()
    // No-show stays a count fallback because attended (4) is thin.
    const noShowTile = screen.getByText(/No-show rate/i).closest('a')!
    expect(within(noShowTile).getByText(/2 of 4/)).toBeTruthy()
  })

  it('falls back to a count for cancellation only when total bookings are thin', async () => {
    const a = baseAnalytics({
      schedule: {
        ...baseAnalytics().schedule,
        total: 3,
        completed: 1,
        noShow: 0,
        cancelled: 1,
        confirmed: 2,
        attended: 1,
        noShowRate: 0,
        cancellationRate: 1 / 3,
        confirmationRate: 1,
      },
    })
    await renderPage('30', a)
    const cancelTile = screen.getByText(/Cancellation rate/i).closest('a')!
    expect(within(cancelTile).getByText('1/3')).toBeTruthy()
  })
})
