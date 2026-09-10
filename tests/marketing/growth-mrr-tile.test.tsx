import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

/**
 * The FIFTH MRR tile — the platform Growth page.
 *
 * Its em dash only ever covered `getSubscriptionStats()` REJECTING
 * (`:68` is `.catch(() => null)`). But `getPlatformMrr` swallows a Stripe
 * failure internally and resolves with `stripeUnavailable: true` and zeroed
 * money, so `subs` is non-null on that path and the tile printed a confident
 * $0 — the same defect as the other four surfaces, one page over.
 *
 * These assert the rendered NUMBER, not the caption beside it: a guard that
 * reads only the caption stays green while $0 sits directly above it.
 *
 * Found by Sentinel re-reviewing DREAMCRM-23 #535.
 */

const state = {
  subs: null as Record<string, unknown> | null,
}

vi.mock('next/navigation', () => ({ redirect: vi.fn(), permanentRedirect: vi.fn() }))
vi.mock('@/lib/auth/context', () => ({
  requireTenant: async () => ({
    tenantType: 'platform',
    organizationId: 'org_platform',
    organizationName: 'Dream Create',
    role: 'owner',
  }),
}))
vi.mock('@/lib/services/marketing', () => ({
  getFunnel: async () => [],
  getPipelineCounts: async () => ({ total: 0, open: 0, won: 0, lost: 0 }),
  listRecentActivity: async () => [],
  listAudiences: async () => [],
}))
vi.mock('@/lib/services/projects', () => ({
  getSubscriptionStats: async () => state.subs,
}))
vi.mock('@/app/(default)/marketing/acquisition-panel', () => ({
  default: () => null,
}))
vi.mock('@/app/(default)/marketing/dials-panel', () => ({ default: () => null }))
vi.mock('@/components/onboarding/module-hint', () => ({ default: () => null }))

import type { ReactElement } from 'react'
import MarketingDashboard from '@/app/(default)/marketing/page'

/**
 * The route component returns `<PlatformMarketingDashboard/>`, itself an
 * async server component, so one await lands on an element RTL cannot
 * resolve. Resolve the inner one too rather than exporting it just for a
 * test.
 */
async function renderGrowthPage() {
  const outer = (await MarketingDashboard({
    searchParams: Promise.resolve({}),
  })) as ReactElement
  const inner = await (outer.type as (p: unknown) => Promise<ReactElement>)(outer.props)
  render(inner)
}

function subs(over: Record<string, unknown> = {}) {
  return {
    activeClinics: 4,
    byTier: { basic: 0, pro: 0, premium: 4 },
    monthlyRecurringCents: 80_000,
    newClinics30d: 1,
    stripeUnavailable: false,
    ...over,
  }
}

beforeEach(() => {
  state.subs = subs()
})

describe('Growth page MRR tile', () => {
  it('shows the live Stripe figure when Stripe is reachable', async () => {
    await renderGrowthPage()
    expect(screen.getByText('$800')).toBeInTheDocument()
    expect(screen.getByText('Active subscriptions')).toBeInTheDocument()
  })

  it('renders an em dash, not $0, when Stripe is unreachable', async () => {
    // Exactly what getPlatformMrr returns on a Stripe failure: a resolved
    // object with the flag set and the money zeroed.
    state.subs = subs({ stripeUnavailable: true, monthlyRecurringCents: 0 })

    await renderGrowthPage()

    expect(screen.queryByText('$0')).not.toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByText('Couldn’t reach Stripe')).toBeInTheDocument()
  })

  it('still renders an em dash when the read itself failed', async () => {
    state.subs = null
    await renderGrowthPage()
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.queryByText('$0')).not.toBeInTheDocument()
  })
})
