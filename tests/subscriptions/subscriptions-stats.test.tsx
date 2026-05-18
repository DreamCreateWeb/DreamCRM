import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { SubscriptionStats } from '@/lib/services/stripe-admin'
import SubscriptionsStats, { PlanMixCard } from '@/app/(default)/ecommerce/invoices/subscriptions-stats'

function stats(overrides: Partial<SubscriptionStats> = {}): SubscriptionStats {
  return {
    total: 0,
    active: 0,
    trialing: 0,
    pastDue: 0,
    canceled: 0,
    scheduledCancel: 0,
    trialEndingSoon: 0,
    mrrCents: 0,
    planMix: [],
    ...overrides,
  }
}

describe('SubscriptionsStats', () => {
  it('shows MRR and annualized ARR in the headline card', () => {
    render(<SubscriptionsStats stats={stats({ mrrCents: 50_000 })} />)
    expect(screen.getByText('Monthly Recurring Revenue')).toBeInTheDocument()
    expect(screen.getByText('$500')).toBeInTheDocument()
    expect(screen.getByText(/\$6,000 annualized/)).toBeInTheDocument()
  })

  it('combines active + trialing into the subscriber count', () => {
    render(<SubscriptionsStats stats={stats({ active: 3, trialing: 2 })} />)
    expect(screen.getByText('Active subscribers')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText(/3 paid · 2 trialing/)).toBeInTheDocument()
  })

  it('flags attention when past due or trial-ending exists', () => {
    render(<SubscriptionsStats stats={stats({ pastDue: 1, trialEndingSoon: 2 })} />)
    expect(screen.getByText(/1 past due · 2 trial ending/)).toBeInTheDocument()
  })

  it('shows reassuring text when nothing is scheduled to cancel', () => {
    render(<SubscriptionsStats stats={stats({ scheduledCancel: 0 })} />)
    expect(screen.getByText(/No churn risk flagged/)).toBeInTheDocument()
  })
})

describe('PlanMixCard', () => {
  it('shows an empty message when there is no paying subscriber', () => {
    render(<PlanMixCard stats={stats()} />)
    expect(screen.getByText(/No paying subscribers yet/i)).toBeInTheDocument()
  })

  it('renders each plan with its sub count and MRR contribution', () => {
    render(
      <PlanMixCard
        stats={stats({
          planMix: [
            { productName: 'Pro', count: 4, mrrCents: 59_600 },
            { productName: 'Premium', count: 1, mrrCents: 19_900 },
          ],
        })}
      />,
    )
    expect(screen.getByText('Pro')).toBeInTheDocument()
    expect(screen.getByText(/4 subs · \$596\/mo/)).toBeInTheDocument()
    expect(screen.getByText('Premium')).toBeInTheDocument()
    expect(screen.getByText(/1 sub · \$199\/mo/)).toBeInTheDocument()
  })
})
