import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AdminSubscription, AdminProduct } from '@/lib/services/stripe-admin'

vi.mock('../../app/(default)/ecommerce/invoices/admin-actions', () => ({
  cancelSubscription: vi.fn(),
  toggleCancelAtPeriodEnd: vi.fn(),
  changePlan: vi.fn(),
}))
// Pass useConfirm() through (auto-confirm) — rendered outside the provider.
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => async () => true }))

import SubscriptionsPanel from '@/app/(default)/ecommerce/invoices/subscriptions-panel'

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

const PRODUCTS: AdminProduct[] = []

describe('SubscriptionsPanel', () => {
  it('renders the empty state when no subscriptions exist', () => {
    render(<SubscriptionsPanel subscriptions={[]} products={PRODUCTS} />)
    expect(screen.getByText(/No subscriptions yet/i)).toBeInTheDocument()
  })

  it('shows status filter chips with live counts', () => {
    render(
      <SubscriptionsPanel
        subscriptions={[
          sub({ id: 'a', status: 'active' }),
          sub({ id: 'b', status: 'active' }),
          sub({ id: 'c', status: 'trialing' }),
          sub({ id: 'd', status: 'past_due' }),
          sub({ id: 'e', status: 'canceled' }),
        ]}
        products={PRODUCTS}
      />,
    )
    // FilterChip renders the count as a separate span next to the label, so the
    // accessible name is "<label> <count>" (no parens).
    expect(screen.getByRole('button', { name: /^All 5$/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Active 2$/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Trialing 1$/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Past due 1$/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Canceled 1$/ })).toBeInTheDocument()
  })

  it('filters subscriptions when a status chip is clicked', async () => {
    const user = userEvent.setup()
    render(
      <SubscriptionsPanel
        subscriptions={[
          sub({ id: 'a', clinicName: 'Active Clinic', status: 'active' }),
          sub({ id: 'b', clinicName: 'Trial Clinic', status: 'trialing' }),
        ]}
        products={PRODUCTS}
      />,
    )
    await user.click(screen.getByRole('button', { name: /^Trialing/ }))
    expect(screen.queryByText('Active Clinic')).not.toBeInTheDocument()
    expect(screen.getByText('Trial Clinic')).toBeInTheDocument()
  })

  it('searches by clinic name, email, and sub id', async () => {
    const user = userEvent.setup()
    render(
      <SubscriptionsPanel
        subscriptions={[
          sub({ id: 'sub_aaa', clinicName: 'Acme Dental', customerEmail: 'a@acme.com' }),
          sub({ id: 'sub_bbb', clinicName: 'Bright Smiles', customerEmail: 'b@bright.com' }),
        ]}
        products={PRODUCTS}
      />,
    )
    const search = screen.getByPlaceholderText(/Search clinic, email, or sub ID/)
    await user.type(search, 'bright')
    expect(screen.queryByText('Acme Dental')).not.toBeInTheDocument()
    expect(screen.getByText('Bright Smiles')).toBeInTheDocument()
  })

  it('links clinic name to the clinic detail page when an org is linked', () => {
    render(
      <SubscriptionsPanel
        subscriptions={[sub({ clinicOrgId: 'org_abc', clinicName: 'Linked Clinic' })]}
        products={PRODUCTS}
      />,
    )
    const link = screen.getByText('Linked Clinic').closest('a')
    expect(link).toBeTruthy()
    expect(link!.getAttribute('href')).toBe('/ecommerce/customers/org_abc')
  })

  it('falls back to plain text when there is no clinic org linked', () => {
    render(
      <SubscriptionsPanel
        subscriptions={[sub({ clinicOrgId: null, clinicName: null, customerName: 'Solo Buyer' })]}
        products={PRODUCTS}
      />,
    )
    expect(screen.getByText('Solo Buyer').tagName).toBe('DIV')
  })

  it('filters by product when the plan select changes', async () => {
    const user = userEvent.setup()
    render(
      <SubscriptionsPanel
        subscriptions={[
          sub({ id: 'a', clinicName: 'Pro Customer', productId: 'prod_pro', productName: 'Pro' }),
          sub({ id: 'b', clinicName: 'Premium Customer', productId: 'prod_prem', productName: 'Premium' }),
        ]}
        products={PRODUCTS}
      />,
    )
    await user.selectOptions(screen.getByLabelText('Filter by plan'), 'prod_prem')
    expect(screen.queryByText('Pro Customer')).not.toBeInTheDocument()
    expect(screen.getByText('Premium Customer')).toBeInTheDocument()
  })

  it('shows "cancels at period end" hint when scheduled', () => {
    render(
      <SubscriptionsPanel
        subscriptions={[sub({ cancelAtPeriodEnd: true })]}
        products={PRODUCTS}
      />,
    )
    expect(screen.getByText(/cancels at period end/)).toBeInTheDocument()
  })

  it('shows a no-match message when filters exclude every sub', async () => {
    const user = userEvent.setup()
    render(
      <SubscriptionsPanel
        subscriptions={[sub({ clinicName: 'Only One' })]}
        products={PRODUCTS}
      />,
    )
    const search = screen.getByPlaceholderText(/Search clinic, email, or sub ID/)
    await user.type(search, 'zzznotreal')
    expect(screen.getByText(/No subscriptions match these filters/i)).toBeInTheDocument()
  })
})
