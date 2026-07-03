import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const stubs = {
  growth: {
    buckets: [
      { bucket: '2026-03-02', value: 0 },
      { bucket: '2026-03-09', value: 1 },
      { bucket: '2026-03-16', value: 2 },
    ],
    total: 3,
    newThisWeek: 2,
    newPrevWeek: 1,
    pctChange: 100,
  },
  mrr: {
    activeClinics: 6,
    byTier: { basic: 2, pro: 3, premium: 1 },
    monthlyRecurringCents: 2 * 9900 + 3 * 14900 + 1 * 19900,
    annualRunRateCents: (2 * 9900 + 3 * 14900 + 1 * 19900) * 12,
    arpu: Math.round((2 * 9900 + 3 * 14900 + 1 * 19900) / 6),
  },
  churn: { canceled30d: 1, pastDue: 0, approxChurnRate30d: 14.3 },
  velocity: {
    buckets: [
      { bucket: '2026-03-01', value: 2 },
      { bucket: '2026-04-01', value: 4 },
    ],
    completedThisMonth: 4,
    completedLastMonth: 2,
    pctChange: 100,
    avgDurationDays: 15,
  },
  funnel: {
    totalCreated: 10,
    reachedDiscovery: 9,
    reachedInProgress: 7,
    reachedReview: 5,
    reachedCompleted: 4,
    overallCompletionRate: 40,
    lossRate: 10,
  },
  engagement: {
    totalPatients: 1200,
    newPatients30d: 80,
    appointmentsBooked30d: 150,
    appointmentsBooked7d: 35,
  },
}

vi.mock('@/lib/services/platform-metrics', () => ({
  getClinicGrowth: async () => stubs.growth,
  getMrrSnapshot: async () => stubs.mrr,
  getChurnStats: async () => stubs.churn,
  getProjectVelocity: async () => stubs.velocity,
  getProjectFunnel: async () => stubs.funnel,
  getPlatformEngagement: async () => stubs.engagement,
}))

// Service Mix moved to Platform Metrics — mock the projects service it pulls from.
vi.mock('@/lib/services/projects', () => ({
  getProjectStats: async () => ({
    totalProjects: 10,
    openProjects: 6,
    completedThisMonth: 4,
    byStatus: {
      lead: 0, discovery: 0, in_progress: 0, review: 0, completed: 0, on_hold: 0, cancelled: 0,
    },
    byType: {
      website: 2,
      ecommerce: 1,
      intake_form: 3,
      videography: 4,
      photography: 0,
      content: 0,
      other: 0,
    },
    pipelineValueCents: 0,
    completedValueCents: 0,
    recentlyUpdated: [],
  }),
}))

import PlatformMetrics from '@/app/(default)/dashboard/analytics/platform-metrics'

beforeEach(() => {
  // restore stubs to defaults before each test
})

describe('PlatformMetrics', () => {
  it('renders the four health-ratio KPIs', async () => {
    const ui = await PlatformMetrics()
    render(ui)
    expect(screen.getByText('Platform Metrics')).toBeInTheDocument()
    expect(screen.getByText('Churn Rate (30d)')).toBeInTheDocument()
    expect(screen.getByText('ARPU')).toBeInTheDocument()
    expect(screen.getByText('Completion Rate')).toBeInTheDocument()
    expect(screen.getByText('Avg Project Duration')).toBeInTheDocument()
    expect(screen.getByText('14.3%')).toBeInTheDocument()
  })

  it('shows subscription-mix counts for Basic / Pro / Premium', async () => {
    const ui = await PlatformMetrics()
    render(ui)
    expect(screen.getByText('Subscription Mix')).toBeInTheDocument()
    expect(screen.getByText('$150')).toBeInTheDocument()
    expect(screen.getByText('$250')).toBeInTheDocument()
    expect(screen.getByText('$500')).toBeInTheDocument()
  })

  it('shows the Service Mix section with all project type labels', async () => {
    const ui = await PlatformMetrics()
    render(ui)
    expect(screen.getByText('Service Mix')).toBeInTheDocument()
    expect(screen.getByText('Website')).toBeInTheDocument()
    expect(screen.getByText('Ecommerce')).toBeInTheDocument()
    expect(screen.getByText('Patient Intake Form')).toBeInTheDocument()
    expect(screen.getByText('Videography')).toBeInTheDocument()
    expect(screen.getByText('Photography')).toBeInTheDocument()
  })

  it('renders growth + velocity trend cards with WoW badges', async () => {
    const ui = await PlatformMetrics()
    render(ui)
    expect(screen.getByText('New Clinics — last 12 weeks')).toBeInTheDocument()
    expect(screen.getByText('Completed Projects — last 6 months')).toBeInTheDocument()
    // both pctChange === 100 → "+100.0% wow" badges
    expect(screen.getAllByText('+100.0% wow').length).toBe(2)
  })

  it('renders the funnel with five stages and overall completion rate', async () => {
    const ui = await PlatformMetrics()
    render(ui)
    expect(screen.getByText('Created')).toBeInTheDocument()
    expect(screen.getByText('Discovery+')).toBeInTheDocument()
    expect(screen.getByText('In progress+')).toBeInTheDocument()
    expect(screen.getByText('Review+')).toBeInTheDocument()
    expect(screen.getByText('Completed')).toBeInTheDocument()
    // 40% appears as both the headline completion-rate KPI and the funnel inner stat
    expect(screen.getAllByText('40.0%').length).toBeGreaterThan(0)
    expect(screen.getByText('10.0%')).toBeInTheDocument()
  })

  it('renders all engagement KPIs', async () => {
    const ui = await PlatformMetrics()
    render(ui)
    expect(screen.getByText('Total Patients')).toBeInTheDocument()
    expect(screen.getByText('New Patients (30d)')).toBeInTheDocument()
    expect(screen.getByText('Appointments (30d)')).toBeInTheDocument()
    expect(screen.getByText('Appointments (7d)')).toBeInTheDocument()
    expect(screen.getByText('1,200')).toBeInTheDocument()
  })

  it('shows empty-state for subscription mix when nobody is active', async () => {
    stubs.mrr.activeClinics = 0
    stubs.mrr.byTier = { basic: 0, pro: 0, premium: 0 }
    stubs.mrr.monthlyRecurringCents = 0
    stubs.mrr.annualRunRateCents = 0
    stubs.mrr.arpu = 0
    const ui = await PlatformMetrics()
    render(ui)
    expect(screen.getByText(/No active subscriptions yet/)).toBeInTheDocument()
    // ARPU shows '—' when nobody's active
    expect(screen.getByText('—')).toBeInTheDocument()
    // restore for other tests
    stubs.mrr = {
      activeClinics: 6,
      byTier: { basic: 2, pro: 3, premium: 1 },
      monthlyRecurringCents: 2 * 9900 + 3 * 14900 + 1 * 19900,
      annualRunRateCents: (2 * 9900 + 3 * 14900 + 1 * 19900) * 12,
      arpu: Math.round((2 * 9900 + 3 * 14900 + 1 * 19900) / 6),
    }
  })

  it('shows empty-state for funnel when no projects', async () => {
    stubs.funnel = {
      totalCreated: 0,
      reachedDiscovery: 0,
      reachedInProgress: 0,
      reachedReview: 0,
      reachedCompleted: 0,
      overallCompletionRate: 0,
      lossRate: 0,
    }
    const ui = await PlatformMetrics()
    render(ui)
    expect(screen.getByText(/No projects logged yet/)).toBeInTheDocument()
  })
})
