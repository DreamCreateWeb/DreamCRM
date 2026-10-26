/**
 * The portal home's balance strip only promises what the Billing page will
 * honour.
 *
 * Billing shows the pay form when the clinic turned payments ON *and* its
 * Stripe Connect account can charge; otherwise it says "call us". Payments
 * default OFF, so the strip's old "you can take care of it online in about a
 * minute" was a promise the very next tap retracted for most clinics with a
 * PMS balance (DESIGN.md portal rule 5: honest numbers or no numbers). The
 * strip now asks the SAME gate and reads the amount through fmtMoney.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import React from 'react'
import { DEFAULT_PORTAL_SETTINGS, type PortalSettings } from '@/lib/types/portal'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

let settings: PortalSettings = DEFAULT_PORTAL_SETTINGS
vi.mock('@/app/(portal)/patient/portal-data', () => ({
  getPortalPageContext: vi.fn(async () => ({
    ctx: { patientId: 'pat_1', organizationId: 'org_1', organizationName: 'Acme Dental' },
    settings,
    clinic: { displayName: 'Acme Dental', phone: '(555) 555-0100', hours: null },
    brand: '#2F6D6A',
    timeZone: 'America/Chicago',
    selfBookingEnabled: true,
    allowedPatientIds: ['pat_1'],
  })),
  toVisitCardData: vi.fn(),
  mapsQueryFor: vi.fn(() => null),
}))

let balanceCents = 0
vi.mock('@/lib/services/patient-portal', () => ({
  getMyPatientRecord: vi.fn(async () => ({ firstName: 'Maria', pmsBalanceCents: balanceCents })),
  getUpcomingVisits: vi.fn(async () => []),
  getPastVisits: vi.fn(async () => []),
  getMyRecallStatus: vi.fn(async () => 'current'),
  getMyPendingForms: vi.fn(async () => []),
}))
vi.mock('@/lib/services/patient-referrals', () => ({ countReferrals: vi.fn(async () => 0) }))
vi.mock('@/lib/services/loyalty', () => ({
  getLoyaltySettings: vi.fn(async () => ({ enabled: false })),
  getPointsBalance: vi.fn(async () => 0),
}))
vi.mock('@/lib/services/nps', () => ({ getOrCreatePortalSurvey: vi.fn(async () => null) }))

const canTakeBalancePayments = vi.fn(async () => false)
vi.mock('@/lib/services/balance-payments', () => ({
  canTakeBalancePayments: (...a: unknown[]) => canTakeBalancePayments(...(a as [])),
}))

import PortalHome from '@/app/(portal)/patient/dashboard/page'

function withPayments(on: boolean): PortalSettings {
  return { ...DEFAULT_PORTAL_SETTINGS, features: { ...DEFAULT_PORTAL_SETTINGS.features, payments: on } }
}

async function renderHome() {
  const ui = await PortalHome()
  return render(ui as React.ReactElement)
}

beforeEach(() => {
  cleanup()
  canTakeBalancePayments.mockReset()
  canTakeBalancePayments.mockResolvedValue(false)
  settings = DEFAULT_PORTAL_SETTINGS
  balanceCents = 0
})

describe('portal home — the balance strip', () => {
  it('payments OFF (the default): states the balance and the call-us path, never "online"', async () => {
    balanceCents = 12_350
    settings = withPayments(false)
    await renderHome()
    const strip = screen.getByRole('link', { name: /\$123\.50 balance/i })
    expect(strip.getAttribute('href')).toBe('/patient/invoices')
    expect(strip.textContent).toContain('call us or stop by')
    expect(strip.textContent).not.toMatch(/online/i)
    // No Stripe read for a clinic that never turned payments on.
    expect(canTakeBalancePayments).not.toHaveBeenCalled()
  })

  it('payments ON but Connect cannot charge yet: still the call-us path', async () => {
    balanceCents = 4_000
    settings = withPayments(true)
    canTakeBalancePayments.mockResolvedValue(false)
    await renderHome()
    const strip = screen.getByRole('link', { name: /\$40 balance/i })
    expect(strip.textContent).toContain('call us or stop by')
    expect(strip.textContent).not.toMatch(/online/i)
    expect(canTakeBalancePayments).toHaveBeenCalledWith('org_1')
  })

  it('payments ON and Connect live: promises the online minute the Billing page will honour', async () => {
    balanceCents = 4_000
    settings = withPayments(true)
    canTakeBalancePayments.mockResolvedValue(true)
    await renderHome()
    const strip = screen.getByRole('link', { name: /\$40 balance/i })
    expect(strip.textContent).toContain('pay online in about a minute')
  })

  it('a Stripe hiccup reads as the call-us path, never a crash or a false promise', async () => {
    balanceCents = 4_000
    settings = withPayments(true)
    canTakeBalancePayments.mockRejectedValue(new Error('stripe down'))
    await renderHome()
    const strip = screen.getByRole('link', { name: /\$40 balance/i })
    expect(strip.textContent).toContain('call us or stop by')
  })

  it('no balance: no strip, and no Stripe read at all', async () => {
    balanceCents = 0
    settings = withPayments(true)
    await renderHome()
    expect(screen.queryByRole('link', { name: /\$[\d,.]+ balance/i })).toBeNull()
    expect(canTakeBalancePayments).not.toHaveBeenCalled()
  })
})
