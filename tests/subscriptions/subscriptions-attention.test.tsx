import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { AdminSubscription } from '@/lib/services/stripe-admin'
import SubscriptionsAttention from '@/app/(default)/ecommerce/invoices/subscriptions-attention'

function sub(overrides: Partial<AdminSubscription> = {}): AdminSubscription {
  return {
    id: 'sub_x',
    status: 'active',
    cancelAtPeriodEnd: false,
    currentPeriodEnd: 1_780_000_000,
    createdAt: 1_770_000_000,
    customerId: 'cus_x',
    customerEmail: 'x@example.com',
    customerName: 'X Clinic',
    clinicOrgId: 'org_x',
    clinicName: 'X Clinic',
    itemId: 'si_x',
    priceId: 'price_pro_m',
    productId: 'prod_pro',
    productName: 'Pro',
    unitAmountCents: 14_900,
    currency: 'usd',
    interval: 'month',
    trialEnd: null,
    ...overrides,
  }
}

describe('SubscriptionsAttention', () => {
  it('shows the all-clear message when nothing needs attention', () => {
    render(
      <SubscriptionsAttention
        attention={{ trialEndingSoon: [], pastDue: [], scheduledCancel: [] }}
      />,
    )
    expect(screen.getByText(/No subscriptions need attention/i)).toBeInTheDocument()
  })

  it('renders the three buckets with counts and clinic links', () => {
    render(
      <SubscriptionsAttention
        attention={{
          trialEndingSoon: [sub({ id: 'tr_a', clinicName: 'Trial One', clinicOrgId: 'org_trial' })],
          pastDue: [sub({ id: 'pd_a', clinicName: 'Past Due', clinicOrgId: 'org_pastdue' })],
          scheduledCancel: [sub({ id: 'sc_a', clinicName: 'Quitting', clinicOrgId: 'org_quit' })],
        }}
      />,
    )
    expect(screen.getByText('Trial ending soon')).toBeInTheDocument()
    expect(screen.getByText('Past due')).toBeInTheDocument()
    expect(screen.getByText('Scheduled to cancel')).toBeInTheDocument()
    const trialLink = screen.getByText('Trial One').closest('a')
    expect(trialLink!.getAttribute('href')).toBe('/ecommerce/customers/org_trial')
    const pdLink = screen.getByText('Past Due').closest('a')
    expect(pdLink!.getAttribute('href')).toBe('/ecommerce/customers/org_pastdue')
  })

  it('renders names without links when no clinic org is linked', () => {
    render(
      <SubscriptionsAttention
        attention={{
          trialEndingSoon: [],
          pastDue: [sub({ id: 'pd_a', clinicName: 'Unlinked', clinicOrgId: null })],
          scheduledCancel: [],
        }}
      />,
    )
    const el = screen.getByText('Unlinked')
    expect(el.closest('a')).toBeNull()
  })

  it('caps each bucket at 6 visible rows and shows a "+N more" footer', () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      sub({ id: `pd_${i}`, clinicName: `Clinic ${i}`, clinicOrgId: `org_${i}` }),
    )
    render(
      <SubscriptionsAttention
        attention={{ trialEndingSoon: [], pastDue: many, scheduledCancel: [] }}
      />,
    )
    expect(screen.getByText('Clinic 0')).toBeInTheDocument()
    expect(screen.getByText('Clinic 5')).toBeInTheDocument()
    expect(screen.queryByText('Clinic 6')).not.toBeInTheDocument()
    expect(screen.getByText('+ 3 more')).toBeInTheDocument()
  })

  it('shows per-bucket empty messages when only one bucket has items', () => {
    render(
      <SubscriptionsAttention
        attention={{
          trialEndingSoon: [sub({ id: 't', clinicName: 'Only Trial' })],
          pastDue: [],
          scheduledCancel: [],
        }}
      />,
    )
    expect(screen.getByText('Only Trial')).toBeInTheDocument()
    expect(screen.getByText('No failed payments.')).toBeInTheDocument()
    expect(screen.getByText('No churn risk flagged.')).toBeInTheDocument()
  })
})
