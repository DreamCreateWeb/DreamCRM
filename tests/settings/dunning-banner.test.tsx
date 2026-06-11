import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/app/(default)/settings/actions', () => ({
  openBillingPortal: vi.fn().mockResolvedValue(undefined),
}))

import BillingDunningBanner from '@/components/ui/billing-dunning-banner'
import type { TenantContext } from '@/lib/auth/context'

function ctx(partial: Partial<TenantContext>): TenantContext {
  return {
    userId: 'u1',
    userEmail: 'e@x.com',
    userName: 'Test',
    platformAdmin: false,
    organizationId: 'org_1',
    organizationName: 'Acme Dental',
    organizationSlug: 'acme',
    tenantType: 'clinic',
    role: 'owner',
    planTier: 'pro',
    patientId: null,
    isDemo: false,
    subscriptionStatus: 'past_due',
    ...partial,
  }
}

describe('BillingDunningBanner — render matrix (status × role × tenant)', () => {
  it('renders for a clinic owner with past_due', () => {
    render(<BillingDunningBanner ctx={ctx({ subscriptionStatus: 'past_due' })} />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/last payment didn't go through/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Update payment/i })).toBeInTheDocument()
  })

  it('renders for a clinic admin with unpaid', () => {
    render(<BillingDunningBanner ctx={ctx({ role: 'admin', subscriptionStatus: 'unpaid' })} />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('renders for incomplete_expired', () => {
    render(<BillingDunningBanner ctx={ctx({ subscriptionStatus: 'incomplete_expired' })} />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('does NOT render for active subscriptions', () => {
    const { container } = render(<BillingDunningBanner ctx={ctx({ subscriptionStatus: 'active' })} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('does NOT render for trialing subscriptions', () => {
    const { container } = render(<BillingDunningBanner ctx={ctx({ subscriptionStatus: 'trialing' })} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('does NOT render for canceled or null status', () => {
    const { container: c1 } = render(<BillingDunningBanner ctx={ctx({ subscriptionStatus: 'canceled' })} />)
    expect(c1).toBeEmptyDOMElement()
    const { container: c2 } = render(<BillingDunningBanner ctx={ctx({ subscriptionStatus: null })} />)
    expect(c2).toBeEmptyDOMElement()
  })

  it('does NOT render for a plain member even when past_due', () => {
    const { container } = render(<BillingDunningBanner ctx={ctx({ role: 'member', subscriptionStatus: 'past_due' })} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('does NOT render for non-clinic tenants', () => {
    const { container: plat } = render(
      <BillingDunningBanner ctx={ctx({ tenantType: 'platform', subscriptionStatus: 'past_due' })} />,
    )
    expect(plat).toBeEmptyDOMElement()
    const { container: pat } = render(
      <BillingDunningBanner ctx={ctx({ tenantType: 'patient', role: 'patient', subscriptionStatus: 'past_due' })} />,
    )
    expect(pat).toBeEmptyDOMElement()
  })

  it('yields to the activation banner when both could apply', () => {
    const { container } = render(
      <BillingDunningBanner ctx={ctx({ billingActivationPending: true, subscriptionStatus: 'past_due' })} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
