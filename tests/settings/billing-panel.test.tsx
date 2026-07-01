import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'

/**
 * SubscriptionPanel — the presentation upgrades on Settings → Billing:
 *   - a REAL trial-end countdown (sourced from ctx.trialEndsAt), escalating
 *     tone as it shrinks;
 *   - the monthly/annual toggle persisted to `?interval=` so a reload keeps it;
 *   - the subscription status pill (plain-language, from the shared meta).
 *
 * These lock the DISPLAY behavior; the Stripe actions are mocked out (this page
 * changes presentation only — no Stripe wiring is touched).
 */

const replace = vi.fn()
let searchParamsStr = ''

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => '/settings/billing',
  useSearchParams: () => new URLSearchParams(searchParamsStr),
}))

vi.mock('@/app/(default)/settings/actions', () => ({
  startStripeCheckout: vi.fn(),
  openBillingPortal: vi.fn(),
  cancelSubscriptionAction: vi.fn(),
  reactivateSubscriptionAction: vi.fn(),
}))

vi.mock('@/components/ui/confirm-dialog', () => ({
  useConfirm: () => vi.fn(async () => true),
}))

import SubscriptionPanel from '@/app/(default)/settings/billing/subscription-panel'

type PanelProps = Parameters<typeof SubscriptionPanel>[0]

function baseProps(overrides: Partial<PanelProps> = {}): PanelProps {
  return {
    planTier: 'pro',
    subscriptionStatus: 'active',
    interval: 'monthly',
    initialInterval: null,
    renewsAt: null,
    cancelAtPeriodEnd: false,
    card: null,
    nextChargeCents: null,
    nextChargeCurrency: null,
    hasSubscription: true,
    onTrial: false,
    trialEndsAt: null,
    upgradeModuleLabel: null,
    invoices: [],
    ...overrides,
  }
}

/** A trial end N whole days out, offset so ceil lands exactly on N. */
function daysOut(n: number): string {
  return new Date(Date.now() + (n - 0.5) * 24 * 60 * 60 * 1000).toISOString()
}

beforeEach(() => {
  replace.mockClear()
  searchParamsStr = ''
})

describe('SubscriptionPanel — trial-end countdown', () => {
  it('shows a real days-left countdown while on trial', () => {
    render(<SubscriptionPanel {...baseProps({ onTrial: true, trialEndsAt: daysOut(5) })} />)
    expect(screen.getByText(/5 days left/i)).toBeInTheDocument()
    expect(screen.getByText(/in your trial/i)).toBeInTheDocument()
    // And the exact end date is surfaced too.
    expect(screen.getByText(/Your trial ends on/i)).toBeInTheDocument()
  })

  it('escalates to an urgent tone on the final day', () => {
    render(<SubscriptionPanel {...baseProps({ onTrial: true, trialEndsAt: daysOut(1) })} />)
    const pill = screen.getByText(/1 day left/i).closest('[data-tone]')
    expect(pill).toHaveAttribute('data-tone', 'urgent')
  })

  it('uses a calmer (special) tone when the trial has plenty of runway', () => {
    render(<SubscriptionPanel {...baseProps({ onTrial: true, trialEndsAt: daysOut(6) })} />)
    const pill = screen.getByText(/6 days left/i).closest('[data-tone]')
    expect(pill).toHaveAttribute('data-tone', 'special')
  })

  it('shows the subscription status pill (not a trial pill) when not on trial', () => {
    render(<SubscriptionPanel {...baseProps({ onTrial: false, subscriptionStatus: 'active' })} />)
    expect(screen.queryByText(/in your trial/i)).not.toBeInTheDocument()
    const active = screen.getByText('Active').closest('[data-tone]')
    expect(active).toHaveAttribute('data-tone', 'ok')
  })

  it('maps past_due / unpaid to their shared plain-language pills', () => {
    const { unmount } = render(<SubscriptionPanel {...baseProps({ subscriptionStatus: 'past_due' })} />)
    expect(screen.getByText('Past due').closest('[data-tone]')).toHaveAttribute('data-tone', 'warn')
    unmount()
    render(<SubscriptionPanel {...baseProps({ subscriptionStatus: 'unpaid' })} />)
    expect(screen.getByText('Unpaid').closest('[data-tone]')).toHaveAttribute('data-tone', 'urgent')
  })
})

describe('SubscriptionPanel — interval persisted in the URL', () => {
  it('writes ?interval=annual when the toggle flips on', () => {
    render(<SubscriptionPanel {...baseProps({ initialInterval: 'monthly' })} />)
    fireEvent.click(screen.getByRole('switch', { name: /Pay annually/i }))
    expect(replace).toHaveBeenCalledTimes(1)
    expect(replace.mock.calls[0][0]).toContain('interval=annual')
  })

  it('seeds the toggle from ?interval=annual on mount (annual prices shown)', () => {
    render(<SubscriptionPanel {...baseProps({ initialInterval: 'annual' })} />)
    // Annual copy is present (the "2 months free" note + a /yr price somewhere).
    expect(screen.getByText(/2 months free/i)).toBeInTheDocument()
    expect(screen.getAllByText(/\/yr/i).length).toBeGreaterThan(0)
  })

  it('preserves an existing param (e.g. ?upgrade=) when writing interval', () => {
    searchParamsStr = 'upgrade=reviews'
    render(<SubscriptionPanel {...baseProps()} />)
    fireEvent.click(screen.getByRole('switch', { name: /Pay annually/i }))
    const url = replace.mock.calls[0][0] as string
    expect(url).toContain('upgrade=reviews')
    expect(url).toContain('interval=annual')
  })
})

describe('SubscriptionPanel — Stripe entry points intact', () => {
  it('keeps the Stripe portal button and the plan-grid switch CTAs', () => {
    render(<SubscriptionPanel {...baseProps()} />)
    expect(screen.getByRole('button', { name: /Manage billing in Stripe/i })).toBeInTheDocument()
    // The plan grid renders a switch/current control per plan.
    const grid = screen.getByRole('heading', { name: /Change your plan/i }).closest('section')
    expect(grid && within(grid).getAllByText(/Switch to|Current plan/i).length).toBeTruthy()
  })
})
