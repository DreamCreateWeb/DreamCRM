import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const stubs = {
  stripe: {
    totalCents: 178_800,
    paidInvoiceCount: 12,
    buckets: Array.from({ length: 12 }, (_, i) => ({
      bucket: `2026-w${i}`,
      value: 14_900,
    })),
    stripeUnavailable: false,
  },
  project: {
    totalCents: 500_000,
    completedCount: 3,
    buckets: Array.from({ length: 12 }, (_, i) => ({
      bucket: `2026-w${i}`,
      value: i === 11 ? 500_000 : 0,
    })),
  },
  outstanding: {
    pastDueInvoiceCents: 9_900,
    pastDueInvoiceCount: 1,
    openProjectCents: 250_000,
    openProjectCount: 2,
    stripeUnavailable: false,
  },
  top: {
    rows: [
      {
        clinicId: 'org_a',
        clinicName: 'Bright Dental',
        slug: 'bright',
        subscriptionCents: 14_900,
        projectCents: 500_000,
        total: 514_900,
      },
      {
        clinicId: 'org_b',
        clinicName: 'Acme Dental',
        slug: 'acme',
        subscriptionCents: 29_800,
        projectCents: 0,
        total: 29_800,
      },
    ],
    stripeUnavailable: false,
  },
  recent: {
    rows: [
      {
        id: 'inv_1',
        source: 'subscription' as const,
        description: 'Pro Monthly',
        clinicName: 'Acme Dental',
        amountCents: 14_900,
        occurredAt: new Date(),
        status: 'paid',
      },
      {
        id: 'p_1',
        source: 'project' as const,
        description: 'New brand video (Videography)',
        clinicName: 'Bright Dental',
        amountCents: 250_000,
        occurredAt: new Date(),
        status: 'completed',
      },
    ],
    stripeUnavailable: false,
  },
  mrr: {
    activeClinics: 6,
    byTier: { basic: 2, pro: 3, premium: 1 },
    monthlyRecurringCents: 2 * 9_900 + 3 * 14_900 + 1 * 19_900,
    annualRunRateCents: (2 * 9_900 + 3 * 14_900 + 1 * 19_900) * 12,
    arpu: Math.round((2 * 9_900 + 3 * 14_900 + 1 * 19_900) / 6),
  },
}

vi.mock('@/lib/services/revenue', () => ({
  getStripeRevenueWindow: async () => stubs.stripe,
  getProjectRevenueWindow: async () => stubs.project,
  getOutstandingRevenue: async () => stubs.outstanding,
  getTopRevenueClinics: async () => stubs.top,
  getRecentRevenueTransactions: async () => stubs.recent,
}))

vi.mock('@/lib/services/platform-metrics', () => ({
  getMrrSnapshot: async () => stubs.mrr,
}))

import PlatformRevenue from '@/app/(default)/dashboard/fintech/platform-revenue'

describe('PlatformRevenue page', () => {
  beforeEach(() => {
    // ensure defaults for each test (mutated stubs from previous test)
    stubs.stripe.stripeUnavailable = false
    stubs.outstanding.stripeUnavailable = false
    stubs.recent.stripeUnavailable = false
  })

  it('renders the four top-line stat cards', async () => {
    const ui = await PlatformRevenue()
    render(ui)
    expect(screen.getByText('Total (12 weeks)')).toBeInTheDocument()
    expect(screen.getByText('MRR')).toBeInTheDocument()
    expect(screen.getByText('Project Revenue (12w)')).toBeInTheDocument()
    // "Outstanding" appears as the KPI label AND as the side-card heading
    expect(screen.getAllByText('Outstanding').length).toBeGreaterThanOrEqual(1)
  })

  it('shows the combined trend row with subscriptions + projects', async () => {
    const ui = await PlatformRevenue()
    render(ui)
    // "Combined" appears in both the legend dot AND the trend row label
    expect(screen.getAllByText('Combined').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Subscriptions').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Projects').length).toBeGreaterThan(0)
  })

  it('lists top contributors with revenue split', async () => {
    const ui = await PlatformRevenue()
    render(ui)
    expect(screen.getByText('Bright Dental')).toBeInTheDocument()
    expect(screen.getByText('Acme Dental')).toBeInTheDocument()
    // $5,149 for Bright total (51490 cents)
    expect(screen.getByText('$5,149')).toBeInTheDocument()
  })

  it('shows recent transactions with money formatting', async () => {
    const ui = await PlatformRevenue()
    render(ui)
    expect(screen.getByText('Pro Monthly')).toBeInTheDocument()
    expect(screen.getByText('New brand video (Videography)')).toBeInTheDocument()
    expect(screen.getByText('+$149')).toBeInTheDocument()
    expect(screen.getByText('+$2,500')).toBeInTheDocument()
  })

  it('shows the Stripe unavailable banner when Stripe couldn\'t be reached', async () => {
    stubs.stripe.stripeUnavailable = true
    const ui = await PlatformRevenue()
    render(ui)
    expect(screen.getByText(/Stripe couldn't be reached/i)).toBeInTheDocument()
  })

  it('shows happy outstanding state when nothing is outstanding', async () => {
    const orig = { ...stubs.outstanding }
    stubs.outstanding.pastDueInvoiceCents = 0
    stubs.outstanding.pastDueInvoiceCount = 0
    stubs.outstanding.openProjectCents = 0
    stubs.outstanding.openProjectCount = 0
    const ui = await PlatformRevenue()
    render(ui)
    expect(screen.getByText(/No outstanding receivables/)).toBeInTheDocument()
    Object.assign(stubs.outstanding, orig)
  })

  it('shows empty top-contributors state', async () => {
    const orig = stubs.top.rows
    stubs.top.rows = []
    const ui = await PlatformRevenue()
    render(ui)
    expect(screen.getByText(/No revenue recorded yet/)).toBeInTheDocument()
    stubs.top.rows = orig
  })
})
