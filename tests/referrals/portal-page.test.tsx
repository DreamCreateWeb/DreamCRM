import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

let ctx: { tenantType: string; userId: string; organizationName: string } | null = null

const svc = vi.hoisted(() => ({
  getPartnerByUserId: vi.fn(),
  getReferredClinics: vi.fn(async () => [] as unknown[]),
  getPartnerBalance: vi.fn(async () => ({ accruedCents: 0, lifetimePaidCents: 0 })),
  listPayouts: vi.fn(async () => [] as unknown[]),
  refreshPayoutStatus: vi.fn(async () => false),
  getPayoutMethodLabel: vi.fn(async () => null),
}))

vi.mock('@/lib/auth/context', () => ({
  // requirePartner authorizes by partner-row lookup (not tenantType). Mirror
  // that here: resolve the partner via getPartnerByUserId, redirect when none/
  // inactive (the new gate), and return { ctx, partner } on success.
  requirePartner: vi.fn(async () => {
    if (!ctx) throw new Error('no ctx')
    const partner = await svc.getPartnerByUserId(ctx.userId)
    if (!partner || partner.status === 'suspended') {
      throw new Error('REDIRECT:/')
    }
    return { ctx, partner }
  }),
}))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
}))
vi.mock('@/lib/services/referrals', () => ({
  getPartnerByUserId: svc.getPartnerByUserId,
  getReferredClinics: svc.getReferredClinics,
  getPartnerBalance: svc.getPartnerBalance,
  listPayouts: svc.listPayouts,
}))
vi.mock('@/lib/services/referral-payouts', () => ({
  refreshPayoutStatus: svc.refreshPayoutStatus,
  getPayoutMethodLabel: svc.getPayoutMethodLabel,
}))
// Client child uses server actions — stub the actions module so it imports.
vi.mock('@/app/(partner)/partner/actions', () => ({
  startPayoutSetupAction: vi.fn(),
  withdrawAction: vi.fn(),
  refreshPayoutStatusAction: vi.fn(),
}))

import PartnerDashboard from '@/app/(partner)/partner/page'

const basePartner = {
  id: 'p1',
  name: 'Jordan Reyes',
  status: 'active',
  defaultPercentBps: 1000,
  defaultTermMonths: null,
  termsNote: null,
  payoutsEnabled: 0,
  stripeConnectAccountId: null,
}

beforeEach(() => {
  ctx = { tenantType: 'partner', userId: 'u1', organizationName: 'Brightline IT' }
  svc.getPartnerByUserId.mockReset()
  svc.getReferredClinics.mockResolvedValue([])
  svc.getPartnerBalance.mockResolvedValue({ accruedCents: 0, lifetimePaidCents: 0 })
  svc.listPayouts.mockResolvedValue([])
  svc.getPayoutMethodLabel.mockResolvedValue(null)
})

async function renderPage() {
  svc.getPartnerByUserId.mockResolvedValue(basePartner)
  const ui = await PartnerDashboard({ searchParams: Promise.resolve({}) })
  render(ui)
}

describe('partner portal dashboard', () => {
  it('greets the partner by first name + shows the KPI band', async () => {
    svc.getReferredClinics.mockResolvedValue([
      { organizationId: 'o1', name: 'Acme', slug: 'acme', planTier: 'premium', subscriptionStatus: 'active', percentBps: 1000, termMonths: null, startedAt: new Date(), lifetimeCommissionCents: 5970 },
    ])
    svc.getPartnerBalance.mockResolvedValue({ accruedCents: 3980, lifetimePaidCents: 1990 })
    await renderPage()
    expect(screen.getByText(/Welcome back, Jordan/)).toBeInTheDocument()
    expect(screen.getByText('Referred clinics')).toBeInTheDocument()
    expect(screen.getByText('Accrued balance')).toBeInTheDocument()
    // money rendered (mono numerals); $39.80 accrued, $19.90 lifetime
    expect(screen.getByText('$40')).toBeInTheDocument() // whole-dollar KPI
  })

  it('payout-method = none → "Set up payouts" CTA, no withdraw', async () => {
    await renderPage()
    expect(screen.getByText(/Set up payouts/)).toBeInTheDocument()
    expect(screen.queryByText(/^Withdraw/)).not.toBeInTheDocument()
  })

  it('payout-method active but under minimum → withdraw button disabled', async () => {
    svc.getPartnerByUserId.mockResolvedValue({ ...basePartner, payoutsEnabled: 1, stripeConnectAccountId: 'acct_1' })
    svc.getPartnerBalance.mockResolvedValue({ accruedCents: 1000, lifetimePaidCents: 0 }) // $10 < $25
    const ui = await PartnerDashboard({ searchParams: Promise.resolve({}) })
    render(ui)
    const withdraw = screen.getByRole('button', { name: /Withdraw/ })
    expect(withdraw).toBeDisabled()
  })

  it('payout-method active + over minimum → withdraw enabled with the amount', async () => {
    svc.getPartnerByUserId.mockResolvedValue({ ...basePartner, payoutsEnabled: 1, stripeConnectAccountId: 'acct_1' })
    svc.getPartnerBalance.mockResolvedValue({ accruedCents: 5000, lifetimePaidCents: 0 })
    const ui = await PartnerDashboard({ searchParams: Promise.resolve({}) })
    render(ui)
    const withdraw = screen.getByRole('button', { name: /Withdraw \$50\.00/ })
    expect(withdraw).not.toBeDisabled()
  })

  it('a user with no active partner row is redirected away (even a clinic tenant)', async () => {
    // Authorization is by partner-row lookup now, not tenantType — a non-partner
    // (no row) is redirected regardless of their tenant.
    ctx = { tenantType: 'clinic', userId: 'u1', organizationName: 'X' }
    svc.getPartnerByUserId.mockResolvedValue(undefined)
    await expect(PartnerDashboard({ searchParams: Promise.resolve({}) })).rejects.toThrow(/REDIRECT:\//)
  })
})
