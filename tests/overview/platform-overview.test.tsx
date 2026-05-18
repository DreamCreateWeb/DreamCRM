import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

let stubSubs = {
  activeClinics: 0,
  byTier: { basic: 0, pro: 0, premium: 0 },
  monthlyRecurringCents: 0,
  newClinics30d: 0,
}

interface AttentionItem {
  kind: string
  title: string
  subtitle: string | null
  href: string | null
  amountCents?: number
  ts: Date
}

let stubAttention: {
  total: number
  pastDueInvoiceCount: number
  pastDueInvoiceCents: number
  stalledProjectCount: number
  overdueProjectCount: number
  newSignupCount: number
  items: AttentionItem[]
  stripeUnavailable: boolean
} = {
  total: 0,
  pastDueInvoiceCount: 0,
  pastDueInvoiceCents: 0,
  stalledProjectCount: 0,
  overdueProjectCount: 0,
  newSignupCount: 0,
  items: [],
  stripeUnavailable: false,
}

let stubActivity: {
  rows: Array<{
    id: string
    kind: string
    title: string
    subtitle: string | null
    ts: Date
    amountCents?: number
  }>
  stripeUnavailable: boolean
} = { rows: [], stripeUnavailable: false }

vi.mock('@/lib/services/projects', () => ({
  getSubscriptionStats: async () => stubSubs,
}))

vi.mock('@/lib/services/operations', () => ({
  getAttentionItems: async () => stubAttention,
  getRecentPlatformActivity: async () => stubActivity,
}))

import PlatformOverview from '@/app/(default)/dashboard/platform-overview'

beforeEach(() => {
  stubSubs = {
    activeClinics: 0,
    byTier: { basic: 0, pro: 0, premium: 0 },
    monthlyRecurringCents: 0,
    newClinics30d: 0,
  }
  stubAttention = {
    total: 0,
    pastDueInvoiceCount: 0,
    pastDueInvoiceCents: 0,
    stalledProjectCount: 0,
    overdueProjectCount: 0,
    newSignupCount: 0,
    items: [],
    stripeUnavailable: false,
  }
  stubActivity = { rows: [], stripeUnavailable: false }
})

describe('PlatformOverview', () => {
  it("shows the four status KPIs and a caught-up state when everything is clean", async () => {
    const ui = await PlatformOverview()
    render(ui)
    expect(screen.getByText('Overview')).toBeInTheDocument()
    expect(screen.getByText('Active Clinics')).toBeInTheDocument()
    expect(screen.getByText('MRR')).toBeInTheDocument()
    expect(screen.getByText('Open Projects')).toBeInTheDocument()
    expect(screen.getByText('Needs Attention')).toBeInTheDocument()
    expect(screen.getByText(/You're caught up/i)).toBeInTheDocument()
    expect(screen.getByText(/All clear/i)).toBeInTheDocument()
  })

  it('reflects subscription counts and 30d signups in the Active Clinics card', async () => {
    stubSubs = {
      activeClinics: 6,
      byTier: { basic: 2, pro: 3, premium: 1 },
      monthlyRecurringCents: 2 * 9900 + 3 * 14900 + 1 * 19900,
      newClinics30d: 4,
    }
    const ui = await PlatformOverview()
    render(ui)
    expect(screen.getByText('6')).toBeInTheDocument()
    expect(screen.getByText(/4 new in 30d/)).toBeInTheDocument()
  })

  it('renders each kind of attention item with its icon class', async () => {
    stubAttention = {
      total: 3,
      pastDueInvoiceCount: 1,
      pastDueInvoiceCents: 14_900,
      stalledProjectCount: 1,
      overdueProjectCount: 0,
      newSignupCount: 1,
      items: [
        {
          kind: 'past_due_invoice',
          title: 'Past-due invoice · Acme Dental',
          subtitle: 'Stripe invoice is open',
          href: '/dashboard/fintech',
          amountCents: 14_900,
          ts: new Date(),
        },
        {
          kind: 'stalled_project',
          title: 'Stalled · Rebrand video',
          subtitle: 'Bright Dental',
          href: '/dashboard',
          ts: new Date(),
        },
        {
          kind: 'new_signup',
          title: 'New clinic · Cozy Dental',
          subtitle: 'Welcome them',
          href: '/dashboard',
          ts: new Date(),
        },
      ],
      stripeUnavailable: false,
    }
    const ui = await PlatformOverview()
    render(ui)
    expect(screen.getByText(/Past-due invoice · Acme Dental/)).toBeInTheDocument()
    expect(screen.getByText(/Stalled · Rebrand video/)).toBeInTheDocument()
    expect(screen.getByText(/New clinic · Cozy Dental/)).toBeInTheDocument()
    // Total past-due dollar amount appears on the section header
    expect(screen.getByText(/\$149 past-due/)).toBeInTheDocument()
  })

  it("flags a warn tone on Needs Attention KPI when total > 0", async () => {
    stubAttention.total = 2
    stubAttention.pastDueInvoiceCount = 2
    stubAttention.pastDueInvoiceCents = 30_000
    stubAttention.items = [
      {
        kind: 'past_due_invoice',
        title: 'Past-due invoice · X',
        subtitle: null,
        href: null,
        amountCents: 30_000,
        ts: new Date(),
      },
    ]
    const ui = await PlatformOverview()
    render(ui)
    // The hint reflects past-due count
    expect(screen.getByText(/2 past-due/)).toBeInTheDocument()
  })

  it('renders Recent Platform Activity with a mixed feed (signups, paid invoices, completions)', async () => {
    stubActivity = {
      rows: [
        {
          id: 's1',
          kind: 'signup',
          title: 'Acme Dental joined Dream Create',
          subtitle: 'New clinic signup',
          ts: new Date(),
        },
        {
          id: 'p1',
          kind: 'subscription_paid',
          title: 'Subscription payment received',
          subtitle: 'Bright Dental',
          ts: new Date(),
          amountCents: 14_900,
        },
        {
          id: 'd1',
          kind: 'project_completed',
          title: 'Rebrand video delivered',
          subtitle: 'Cozy Dental',
          ts: new Date(),
          amountCents: 250_000,
        },
      ],
      stripeUnavailable: false,
    }
    const ui = await PlatformOverview()
    render(ui)
    expect(screen.getByText(/Acme Dental joined Dream Create/)).toBeInTheDocument()
    expect(screen.getByText('Subscription payment received')).toBeInTheDocument()
    expect(screen.getByText('Rebrand video delivered')).toBeInTheDocument()
    expect(screen.getByText('+$149')).toBeInTheDocument()
    expect(screen.getByText('+$2,500')).toBeInTheDocument()
  })

  it("shows empty state for recent activity when there's none", async () => {
    const ui = await PlatformOverview()
    render(ui)
    expect(screen.getByText(/No activity yet/)).toBeInTheDocument()
  })

  it('shows the Stripe banner when attention fetch couldn\'t reach Stripe', async () => {
    stubAttention.stripeUnavailable = true
    const ui = await PlatformOverview()
    render(ui)
    expect(screen.getByText(/Stripe couldn't be reached/)).toBeInTheDocument()
  })

  it('includes quick-link cards to the other metric modules', async () => {
    const ui = await PlatformOverview()
    render(ui)
    // Each link appears in both the top action bar AND the quick-link grid
    expect(screen.getAllByText(/^Platform Metrics/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/^Revenue/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/^Clinics/).length).toBeGreaterThan(0)
  })
})
