import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

/**
 * WHAT A PROSPECT IS QUOTED (DREAMCRM-38, owner decision).
 *
 * The deal room inside prospecting is a sales surface — it is what a prospect
 * gets shown on a call. It quoted "$500/mo" from a copied tier→price map while
 * the pricing page, the billing panel and Stripe checkout all said $200, the
 * limited-time founding practice rate ($500 is the struck-through LIST price).
 *
 * `tests/prospecting/vendors.test.ts` pins the math. THIS pins what the reader
 * actually gets — the rendered row — because the estimate returning 200 is no
 * use if the markup around it still prints a literal.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => '/platform/prospecting',
  useSearchParams: () => new URLSearchParams(''),
}))

vi.mock('@/app/(default)/platform/prospecting/contacts-panel', () => ({
  default: () => null,
}))
vi.mock('@/app/(default)/platform/prospecting/drawer-actions', () => ({
  default: () => null,
}))
vi.mock('@/app/(default)/platform/prospecting/demo-followup-drafter', () => ({
  default: () => null,
}))

import ProspectDrawer from '@/app/(default)/platform/prospecting/prospect-drawer'

type DrawerProps = Parameters<typeof ProspectDrawer>[0]

/** A crawled prospect running a marketing tool + a booking tool — the stack
 *  that used to route to "Premium $500". */
function detail(vendors: Array<{ name: string; category: string; estMonthly: number }>): DrawerProps['detail'] {
  return {
    prospect: {
      id: 'p1',
      name: 'Smile Dental',
      status: 'call_list',
      addressLine1: '1 Main St',
      city: 'Austin',
      state: 'TX',
      postalCode: '78701',
      phone: null,
      npiNumber: null,
      email: null,
      websiteUrl: 'https://smiledental.example',
      enrichedAt: new Date(),
      googleRatingTenths: null,
      reviewCount: null,
      googleMapsUri: null,
      scoreBand: null,
      opportunityScore: null,
      intentSignal: null,
      intentSummary: null,
      talkingPoints: null,
      scoreReasons: null,
      aiVerdict: null,
      demoBrief: null,
      authorizedOfficialName: null,
      authorizedOfficialTitle: null,
      enrichment: {
        ssl: true,
        mobileViewport: true,
        bookingWidget: true,
        copyrightYear: 2024,
        builder: null,
        socialLinks: {},
        vendors,
      },
    },
    contacts: [],
    touches: [],
    events: [],
    calls: [],
  } as unknown as DrawerProps['detail']
}

describe('the deal room quote', () => {
  it('quotes the $200 founding rate with $500 struck through', () => {
    render(
      <ProspectDrawer
        detail={detail([
          { name: 'NexHealth', category: 'booking', estMonthly: 300 },
          { name: 'RevenueWell', category: 'marketing', estMonthly: 350 },
        ])}
        closeHref="/platform/prospecting"
      />,
    )

    // The number a prospect is quoted. Before the fix this row read "$500/mo".
    expect(screen.getByText('$200/mo')).toBeTruthy()
    // The list price, struck through, exactly as the pricing page frames it.
    const list = screen.getByTitle('Regular price')
    expect(list.textContent).toBe('$500')
    expect(list.className).toContain('line-through')
    expect(screen.getByText(/Limited time/i)).toBeTruthy()
    expect(screen.getByText(/DreamCRM Premium replaces it/)).toBeTruthy()
    // $650 across their tools minus the $200 we actually charge.
    expect(screen.getByText(/\$450\/mo/)).toBeTruthy()
  })

  it('quotes the same rate for a stack that used to route to a legacy tier', () => {
    // Booking + reviews, no marketing: this used to say "DreamCRM Pro
    // replaces it — $250/mo", naming a plan that has not been sellable since
    // the 2026-07-19 single-plan collapse, at MORE than the plan they can buy.
    render(
      <ProspectDrawer
        detail={detail([
          { name: 'LocalMed', category: 'booking', estMonthly: 250 },
          { name: 'Birdeye', category: 'reviews', estMonthly: 300 },
        ])}
        closeHref="/platform/prospecting"
      />,
    )
    expect(screen.getByText('$200/mo')).toBeTruthy()
    expect(screen.getByText(/DreamCRM Premium replaces it/)).toBeTruthy()
    // "~$250/mo" still appears — that is LocalMed's own cost in the displace
    // list. What must not appear is a QUOTE of 250, i.e. a plan row.
    expect(screen.queryByText(/DreamCRM (Pro|Basic) replaces it/)).toBeNull()
    expect(screen.queryByText('$250/mo')).toBeNull()
  })
})
