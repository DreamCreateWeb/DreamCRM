import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { ToastProvider } from '@/components/ui/toast'
import { ConfirmProvider } from '@/components/ui/confirm-dialog'
import type { PmsLink } from '@/lib/pms-link'

/**
 * Balances are `patient.pms_balance_cents`, written only by the PMS sync.
 * With no bridge the Payments hub read "Nothing owed. Nice." and Collections
 * threw the 🎉 "every patient is square" all-clear — to a practice with real
 * AR the week it signed up (docs/ACTIVATION.md law 3: honest while pending).
 * Both pages now ask the PMS link first. And the Stripe door on Collections
 * is the Connect OAuth start, never the switched-off /shop hub.
 */
const h = vi.hoisted(() => ({
  link: { kind: 'connected' } as PmsLink,
  role: 'owner' as 'owner' | 'member',
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/payments',
}))
vi.mock('@/lib/auth/context', () => ({
  requireTenant: vi.fn(async () => ({
    userId: 'u_1',
    organizationId: 'org_1',
    organizationName: 'Acme Dental',
    tenantType: 'clinic',
    role: h.role,
    isDemo: false,
  })),
}))
vi.mock('@/lib/services/collections', () => ({
  getCollectionsBoard: vi.fn(async () => ({
    totalOutstandingCents: 0,
    patientCount: 0,
    collectedThisMonthCents: 0,
    withLinkOut: 0,
    truncated: false,
    rows: [],
  })),
  getCollectionsSnapshot: vi.fn(async () => ({ patientCount: 0, totalOutstandingCents: 0 })),
}))
vi.mock('@/lib/services/balance-payments', () => ({
  canTakeBalancePayments: vi.fn(async () => false),
  listRecentBalancePayments: vi.fn(async () => []),
  getCollectedPerWeek8: vi.fn(async () => []),
}))
vi.mock('@/lib/services/payment-plans', () => ({ listPaymentPlans: vi.fn(async () => []) }))
vi.mock('@/lib/services/membership', () => ({ getMembershipStats: vi.fn(async () => ({ activeMembers: 0, mrrCents: 0 })) }))
vi.mock('@/lib/services/clinic-timezone', () => ({ getClinicTimeZone: vi.fn(async () => 'America/New_York') }))
vi.mock('@/lib/services/pms-link', () => ({ getPmsLink: vi.fn(async () => h.link) }))
vi.mock('@/app/(default)/patients/actions', () => ({ sendPayLinkAction: vi.fn() }))
vi.mock('@/app/(default)/payments/collections/actions', () => ({ proposePlanAction: vi.fn(), cancelPlanAction: vi.fn() }))

import CollectionsPage from '@/app/(default)/payments/collections/page'
import PaymentsHubPage from '@/app/(default)/payments/page'

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ConfirmProvider>
      <ToastProvider>{children}</ToastProvider>
    </ConfirmProvider>
  )
}
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: Providers })

beforeEach(() => {
  h.link = { kind: 'connected' }
  h.role = 'owner'
})

describe('Collections — the empty board tells the truth about its source', () => {
  it('with a PMS, nothing owed is the earned all-clear', async () => {
    render(await CollectionsPage())
    expect(screen.getByText('No open balances')).toBeInTheDocument()
    expect(screen.getByText(/Every patient is square/)).toBeInTheDocument()
  })

  it('with no PMS, never "every patient is square" — balances arrive with the practice software, and the door is there', async () => {
    h.link = { kind: 'none' }
    render(await CollectionsPage())
    expect(screen.queryByText(/every patient is square/i)).not.toBeInTheDocument()
    expect(screen.getByText('Balances arrive with your practice software')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Connect it' })).toHaveAttribute('href', '/integrations/pms')
  })

  it('a pending request speaks in its own words with a door to the request', async () => {
    h.link = { kind: 'pending', vendorLabel: 'Dentrix', pill: 'We’re connecting it', sentence: 'We have your request for Dentrix.' }
    render(await CollectionsPage())
    expect(screen.getByText(/We have your request for Dentrix/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'See the request' })).toHaveAttribute('href', '/integrations/pms')
  })

  it('the Stripe note opens the Connect OAuth start for an owner, and tells a member who can', async () => {
    render(await CollectionsPage())
    expect(screen.getByRole('link', { name: 'Connect Stripe' })).toHaveAttribute('href', '/api/connect/shop/start?back=payments')
    expect(document.querySelector('a[href="/shop"]')).toBeNull()
    h.role = 'member'
    render(await CollectionsPage())
    expect(screen.getByText(/Ask an owner to connect Stripe/)).toBeInTheDocument()
  })
})

describe('Payments hub — the Outstanding tile tells the truth about its source', () => {
  it('with a PMS, nothing owed reads "Nothing owed. Nice."', async () => {
    render(await PaymentsHubPage())
    expect(screen.getByText('Nothing owed. Nice.')).toBeInTheDocument()
  })

  it('with no PMS, the tile is "—" with the source named, and opens the connect door', async () => {
    h.link = { kind: 'none' }
    render(await PaymentsHubPage())
    expect(screen.queryByText('Nothing owed. Nice.')).not.toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByText('balances come from your PMS — needs your practice software')).toBeInTheDocument()
    expect(screen.getByText('Outstanding').closest('a')).toHaveAttribute('href', '/integrations/pms')
  })
})
