/**
 * PRE-LIVE CLINIC, PORTAL OUT-LINKS (DREAMCRM-131, ledger :1382).
 *
 * The signed-in portal sends patients to two pages that live on the clinic's
 * PUBLIC site — the storefront and the membership pitch. Both are marketing
 * content, so both sit behind the go-live lever. Before the practice publishes,
 * every one of those links landed a patient on the branded "coming soon" page:
 * a dead end reached from inside a product they are signed into.
 *
 * The call was to HIDE the links while the site is unpublished rather than
 * exempt the routes from the gate — exempting would publish the commerce pages
 * of a site the practice deliberately has not published.
 *
 * This file grades the rule where a patient meets it: the nav entry lives in
 * tests/patient-portal/portal-nav.test.ts, and here are the destination and the
 * two page bodies that render an href. Each case has its published-site control
 * beside it, because a test that only asserts an ABSENCE passes just as well
 * when the whole card has gone missing for some unrelated reason.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import {
  showsPortalSiteOutLinks,
  shouldShowComingSoon,
} from '@/lib/clinic-site-helpers'

const LIVE = new Date('2026-08-01T12:00:00Z')

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
}))

const { portalContext, shopConfig } = vi.hoisted(() => ({
  portalContext: vi.fn(),
  shopConfig: vi.fn(),
}))

vi.mock('@/app/(portal)/patient/portal-data', async () => {
  const actual = await vi.importActual<
    typeof import('@/app/(portal)/patient/portal-data')
  >('@/app/(portal)/patient/portal-data')
  return { ...actual, getPortalPageContext: portalContext }
})
vi.mock('@/lib/services/shop', () => ({ getShopConfig: shopConfig }))

// The billing page's own data, none of which this rule touches. Held at the
// values that make the upsell card ELIGIBLE (no membership, one plan on sale)
// so the only thing left deciding whether it renders is the go-live lever.
vi.mock('@/lib/services/patient-portal', () => ({
  getMyBills: vi.fn(async () => ({
    pmsBalanceCents: 0,
    pmsBalanceUpdatedAt: null,
    membership: null,
    orders: [],
  })),
  getMyBalancePayments: vi.fn(async () => []),
}))
vi.mock('@/lib/services/membership', () => ({
  listActivePlans: vi.fn(async () => [
    { id: 'plan_1', name: 'Bright Smile', priceCents: 2900, billingInterval: 'monthly' },
  ]),
}))
vi.mock('@/lib/services/balance-payments', () => ({
  canTakeBalancePayments: vi.fn(async () => false),
  finalizeBalancePaymentFromSession: vi.fn(async () => {}),
}))
vi.mock('@/lib/services/payment-plans', () => ({
  getMyOpenPaymentPlan: vi.fn(async () => null),
  planInstallmentCents: () => 0,
  planAmountForInstallment: () => 0,
  PLAN_MIN_TOTAL_CENTS: 20_000,
  PLAN_MIN_INSTALLMENT_CENTS: 2_500,
  PLAN_MIN_MONTHS: 2,
  PLAN_MAX_MONTHS: 6,
}))

import PortalShopRedirect from '@/app/(portal)/patient/shop/page'
import PortalBillingPage from '@/app/(portal)/patient/invoices/page'

function context(siteLiveAt: Date | null) {
  return {
    ctx: {
      organizationId: 'org_1',
      organizationSlug: 'acme-dental',
      organizationName: 'Acme Dental',
      patientId: 'pat_1',
      tenantType: 'patient',
    },
    settings: {
      features: { billing: true, shopLink: true, payments: false },
      copy: {},
    },
    clinic: { organizationSlug: 'acme-dental', displayName: 'Acme Dental', siteLiveAt },
    brand: '#9CAF9F',
    timeZone: 'America/New_York',
    selfBookingEnabled: true,
    dependents: [],
    allowedPatientIds: ['pat_1'],
  }
}

/** Drive a page to whichever redirect it throws; '' when it renders instead. */
async function redirectedTo(page: () => Promise<unknown>): Promise<string> {
  try {
    await page()
    return ''
  } catch (e) {
    const m = /^REDIRECT:(.*)$/.exec((e as Error).message)
    if (!m) throw e
    return m[1]
  }
}

describe('showsPortalSiteOutLinks', () => {
  it('is false before the lever is pulled and true after', () => {
    expect(showsPortalSiteOutLinks(null)).toBe(false)
    expect(showsPortalSiteOutLinks(undefined)).toBe(false)
    expect(showsPortalSiteOutLinks(LIVE)).toBe(true)
    expect(showsPortalSiteOutLinks('2026-08-01T12:00:00Z')).toBe(true)
  })

  it('is the EXACT complement of the gate a patient tapping the link would meet', () => {
    // Not a second opinion about the go-live rule — the same call, negated,
    // with a patient's three escapes (editor / template frame / access route)
    // pinned false. If the gate changes, this is what keeps the portal side
    // from drifting away from it.
    for (const siteLiveAt of [null, undefined, LIVE]) {
      const gated = shouldShowComingSoon({
        siteLiveAt,
        canEdit: false,
        isFrame: false,
        isAccessRoute: false,
      })
      expect(showsPortalSiteOutLinks(siteLiveAt)).toBe(!gated)
    }
  })
})

describe('/patient/shop, the destination', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    shopConfig.mockResolvedValue({ storefrontEnabled: true })
  })

  it('pre-live: sends the patient home instead of out to the coming-soon page', async () => {
    portalContext.mockResolvedValue(context(null))
    expect(await redirectedTo(PortalShopRedirect)).toBe('/patient/dashboard')
  })

  it('published: carries the patient to the storefront as before', async () => {
    portalContext.mockResolvedValue(context(LIVE))
    expect(await redirectedTo(PortalShopRedirect)).toBe('/site/acme-dental/shop')
  })
})

describe('/patient/invoices, the membership upsell', () => {
  beforeEach(() => vi.clearAllMocks())

  it('pre-live: the card and its dental-plans link are gone', async () => {
    portalContext.mockResolvedValue(context(null))
    render(await PortalBillingPage({ searchParams: Promise.resolve({}) }) as React.ReactElement)
    expect(screen.queryByRole('link', { name: /see the plans/i })).toBeNull()
    expect(document.querySelector('a[href*="/dental-plans"]')).toBeNull()
  })

  it('published: the card is exactly where it was', async () => {
    portalContext.mockResolvedValue(context(LIVE))
    render(await PortalBillingPage({ searchParams: Promise.resolve({}) }) as React.ReactElement)
    const link = screen.getByRole('link', { name: /see the plans/i })
    expect(link.getAttribute('href')).toBe('/site/acme-dental/dental-plans')
  })
})
