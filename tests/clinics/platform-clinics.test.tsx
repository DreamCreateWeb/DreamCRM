import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ClinicListRow } from '@/lib/services/clinics'

/**
 * The Clinics page's KPI row. "Active Subscribers" used to count every row
 * whose column said active/trialing — and the column says 'trialing' for a
 * clinic a month behind the billing wall, because nothing writes it when the
 * trial runs out. The count now asks the same rule the wall does.
 */

let stubRows: ClinicListRow[] = []
let stubMrr = { withTrialing: { clinics: 0, monthlyCents: 0, byTier: { basic: 0, pro: 0, premium: 0 } }, recognized: { clinics: 0, monthlyCents: 0, byTier: { basic: 0, pro: 0, premium: 0 } }, stripeUnavailable: false, monthlyCentsByOrg: new Map<string, number>() }

vi.mock('@/lib/services/clinics', () => ({ listClinics: async () => stubRows }))
vi.mock('@/lib/services/referrals', () => ({ listActivePartners: async () => [] }))
vi.mock('@/lib/services/platform-mrr', () => ({
  getPlatformMrr: async () => stubMrr,
  emptyPlatformMrr: (stripeUnavailable = false) => ({ ...stubMrr, stripeUnavailable }),
}))
// The add-clinic modal reads the app router's search params — not under test here.
vi.mock('@/app/(default)/ecommerce/customers/add-clinic-modal', () => ({ default: () => null }))

import PlatformClinics from '@/app/(default)/ecommerce/customers/platform-clinics'

const NO_TRIAL = { onTrial: false, expired: false, trialEndsAt: null, daysLeft: null }

function row(overrides: Partial<ClinicListRow> = {}): ClinicListRow {
  return {
    orgId: 'org_x',
    name: 'X Clinic',
    slug: 'x',
    displayName: null,
    logoUrl: null,
    brandColor: null,
    email: null,
    phone: null,
    city: null,
    state: null,
    planTier: 'premium',
    subscriptionStatus: 'active',
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    ownerInvitePending: false,
    trial: NO_TRIAL,
    createdAt: new Date('2026-01-01'),
    isDemo: false,
    monthlyContributionCents: 20_000,
    memberCount: 1,
    patientCount: 0,
    activeProjectCount: 0,
    hasWebsiteContent: false,
    ...overrides,
  }
}

function tile(label: string): HTMLElement {
  const el = screen.getByText(label).closest('div.v2-card, div.v2-card-interactive')
  expect(el).not.toBeNull()
  return el as HTMLElement
}

beforeEach(() => {
  stubRows = []
  stubMrr = { ...stubMrr, stripeUnavailable: false, withTrialing: { clinics: 0, monthlyCents: 0, byTier: { basic: 0, pro: 0, premium: 0 } } }
})

describe('PlatformClinics KPI row', () => {
  it('Active Subscribers excludes an EXPIRED trial even though its column still says trialing', async () => {
    const ended = new Date(Date.now() - 30 * 86_400_000)
    stubRows = [
      row({ orgId: 'a', name: 'Paying', subscriptionStatus: 'active', stripeSubscriptionId: 'sub_a' }),
      row({ orgId: 'b', name: 'On trial', subscriptionStatus: 'trialing', trial: { onTrial: true, expired: false, trialEndsAt: new Date(Date.now() + 3 * 86_400_000), daysLeft: 3 } }),
      row({ orgId: 'c', name: 'Walled', subscriptionStatus: 'trialing', trial: { onTrial: false, expired: true, trialEndsAt: ended, daysLeft: 0 } }),
    ]
    render(await PlatformClinics())
    expect(within(tile('Active Subscribers')).getByText('2')).toBeInTheDocument()
    expect(within(tile('Total Clinics')).getByText('3')).toBeInTheDocument()
  })

  it('the demo clinic stays out of every aggregate', async () => {
    stubRows = [
      row({ orgId: 'a', name: 'Paying', subscriptionStatus: 'active', stripeSubscriptionId: 'sub_a' }),
      row({ orgId: 'demo', name: 'Dream Dental', subscriptionStatus: 'active', isDemo: true }),
    ]
    render(await PlatformClinics())
    expect(within(tile('Active Subscribers')).getByText('1')).toBeInTheDocument()
    expect(within(tile('Total Clinics')).getByText('1')).toBeInTheDocument()
  })

  it('the legend names the trial states and the invite state — "setup pending" is gone', async () => {
    const user = userEvent.setup()
    render(await PlatformClinics())
    // The Key opens on a click; its rows come from the page's own pill list.
    await user.click(screen.getByRole('button', { name: /Key/ }))
    const key = screen.getByRole('dialog', { name: /What the colors and icons mean/ })
    expect(within(key).getByText('trial ended')).toBeInTheDocument()
    expect(within(key).getByText('invite pending')).toBeInTheDocument()
    expect(within(key).queryByText('setup pending')).toBeNull()
  })
})
