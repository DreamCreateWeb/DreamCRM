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
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

const { portalContext, shopConfig, clinicInfo } = vi.hoisted(() => ({
  portalContext: vi.fn(),
  shopConfig: vi.fn(),
  clinicInfo: vi.fn(),
}))

vi.mock('@/app/(portal)/patient/portal-data', async () => {
  const actual = await vi.importActual<
    typeof import('@/app/(portal)/patient/portal-data')
  >('@/app/(portal)/patient/portal-data')
  return { ...actual, getPortalPageContext: portalContext }
})
vi.mock('@/lib/services/shop', () => ({ getShopConfig: shopConfig }))

// The pages' own data, none of which this rule touches. The billing values are
// held where the upsell card is ELIGIBLE (no membership, one plan on sale) and
// the dashboard's where the rewards card RENDERS, so in both cases the only
// thing left deciding the out-link is the go-live lever.
vi.mock('@/lib/services/patient-portal', () => ({
  getMyBills: vi.fn(async () => ({
    pmsBalanceCents: 0,
    pmsBalanceUpdatedAt: null,
    membership: null,
    orders: [],
  })),
  getMyBalancePayments: vi.fn(async () => []),
  getMyPatientRecord: vi.fn(async () => ({ firstName: 'Sam', pmsBalanceCents: 0 })),
  getUpcomingVisits: vi.fn(async () => []),
  getPastVisits: vi.fn(async () => []),
  getMyRecallStatus: vi.fn(async () => 'ok'),
  getMyPendingForms: vi.fn(async () => []),
  getPortalClinicInfo: clinicInfo,
}))
vi.mock('@/lib/services/loyalty', () => ({
  getLoyaltySettings: vi.fn(async () => ({
    enabled: true,
    redeemPoints: 500,
    redeemValueCents: 2_500,
  })),
  getPointsBalance: vi.fn(async () => 120),
}))
vi.mock('@/lib/services/patient-referrals', () => ({ countReferrals: vi.fn(async () => 0) }))
vi.mock('@/lib/services/nps', () => ({ getOrCreatePortalSurvey: vi.fn(async () => null) }))

// A PROBE, not a stand-in. The rewards card only paints its shop link in the
// post-redeem state — a client transition no server render reaches — so the
// honest place to grade `app/(portal)/patient/dashboard/page.tsx` is the value
// it hands the card. This stub paints that value and nothing else, so the
// assertion below reads the same shape as the billing one and still fails for
// the page's reason rather than the card's.
vi.mock('@/components/patient-portal/loyalty-card', () => ({
  default: ({ shopHref }: { shopHref: string | null }) =>
    shopHref ? (
      <a data-testid="rewards-shop-link" href={shopHref}>
        Browse the shop
      </a>
    ) : (
      <p data-testid="rewards-no-shop-link">rewards card, no shop link</p>
    ),
}))

// The settings preview's own reads. It is a CLINIC-tenant page, so it resolves
// its own tenant and opens one query of its own rather than going through the
// portal page context.
vi.mock('@/lib/auth/context', () => ({
  requireTenant: vi.fn(async () => ({
    tenantType: 'clinic',
    organizationId: 'org_1',
    organizationName: 'Acme Dental',
  })),
}))
vi.mock('@/lib/services/portal-settings', () => ({
  getPortalSettings: vi.fn(async () => {
    const { DEFAULT_PORTAL_SETTINGS } = await import('@/lib/types/portal')
    return DEFAULT_PORTAL_SETTINGS
  }),
}))
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => [{ staff: [] }] }) }),
    }),
  },
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
import PortalHome from '@/app/(portal)/patient/dashboard/page'
import PortalPreviewPage from '@/app/(preview)/settings/portal/preview/page'

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

describe('/patient/dashboard, the rewards card’s “spend them” link', () => {
  beforeEach(() => vi.clearAllMocks())

  it('pre-live: the card is offered no shop to spend them in', async () => {
    portalContext.mockResolvedValue(context(null))
    render(await PortalHome() as React.ReactElement)
    expect(screen.queryByTestId('rewards-shop-link')).toBeNull()
    // Paired with the card still being THERE: the points balance is not what
    // the lever decides, and a test that passed because the whole card
    // vanished would be reporting the wrong thing.
    expect(screen.getByTestId('rewards-no-shop-link')).toBeTruthy()
  })

  it('published: the link is back, pointing at the portal’s own shop route', async () => {
    portalContext.mockResolvedValue(context(LIVE))
    render(await PortalHome() as React.ReactElement)
    expect(screen.getByTestId('rewards-shop-link').getAttribute('href')).toBe('/patient/shop')
  })
})

describe('the clinic’s own portal preview', () => {
  beforeEach(() => vi.clearAllMocks())

  /** Everything the preview reads about the clinic, minus the lever. */
  function previewClinic(siteLiveAt: Date | null) {
    return {
      organizationSlug: 'acme-dental',
      displayName: 'Acme Dental',
      brandColor: '#9CAF9F',
      selfBookingEnabled: true,
      timezone: 'America/New_York',
      siteLiveAt,
    }
  }

  it('pre-live: does not show the clinic a Shop entry no patient of theirs can see', async () => {
    clinicInfo.mockResolvedValue(previewClinic(null))
    render(await PortalPreviewPage() as React.ReactElement)
    expect(screen.queryByText('Shop')).toBeNull()
    // The control: the rest of the nav is rendering, so the absence above is
    // the lever's doing rather than a preview that failed to draw.
    expect(screen.getAllByText('Billing').length).toBeGreaterThan(0)
  })

  it('published: the preview shows Shop, like the portal it is a picture of', async () => {
    clinicInfo.mockResolvedValue(previewClinic(LIVE))
    render(await PortalPreviewPage() as React.ReactElement)
    expect(screen.getAllByText('Shop').length).toBeGreaterThan(0)
  })
})
