import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))
// The hub fires several server actions; stub them all so the client renders.
vi.mock('@/app/(default)/shop/actions', () => ({
  setProductStatusAction: vi.fn(),
  deleteProductAction: vi.fn(),
  updateShopConfigAction: vi.fn(),
  disconnectStripeAction: vi.fn(),
}))

import ShopClient from '@/app/(default)/shop/shop-client'
import type { ShopConfigView, ShopStats } from '@/lib/types/shop'

function config(over: Partial<ShopConfigView> = {}): ShopConfigView {
  return {
    stripeAccountStatus: 'active',
    chargesEnabled: true,
    payoutsEnabled: true,
    pickupEnabled: true,
    shippingEnabled: false,
    flatShippingCents: null,
    freeShippingThresholdCents: null,
    taxEnabled: false,
    platformFeeBps: 0,
    currency: 'usd',
    storefrontEnabled: true,
    membershipEnabled: true,
    ...over,
  }
}

const stats: ShopStats = { productCount: 3, activeCount: 2 }

interface RenderOpts {
  config?: Partial<ShopConfigView>
  orderStats?: { paidCount: number; unfulfilledCount: number; revenueCents: number }
  membershipStats?: { activeMembers: number; mrrCents: number }
  couponStats?: { activeCount: number }
  paymentStats?: { count: number }
  connectConfigured?: boolean
  connectBanner?: string | null
}

function renderHub(opts: RenderOpts = {}) {
  return render(
    <ShopClient
      config={config(opts.config)}
      products={[]}
      stats={stats}
      orderStats={opts.orderStats ?? { paidCount: 5, unfulfilledCount: 0, revenueCents: 12000 }}
      membershipStats={opts.membershipStats ?? { activeMembers: 0, mrrCents: 0 }}
      couponStats={opts.couponStats ?? { activeCount: 0 }}
      paymentStats={opts.paymentStats ?? { count: 0 }}
      publicBase="/site/acme/shop"
      connectConfigured={opts.connectConfigured ?? true}
      connectBanner={opts.connectBanner ?? null}
      orgName="Acme Dental"
    />,
  )
}

/** Find the section-navigation card whose link points at `href`. */
function sectionCard(href: string): HTMLElement {
  const links = screen.getAllByRole('link').filter((a) => a.getAttribute('href') === href)
  // The hub may link to a path more than once (e.g. catalog "+ Add product");
  // the section card is the one carrying the section title + stat line. Pick the
  // first link that wraps the section card layout (has the title element).
  const card = links.find((a) => a.querySelector('.v2-card-interactive'))
  if (!card) throw new Error(`No section card linking to ${href}`)
  return card as HTMLElement
}

describe('ShopClient — section navigation cards', () => {
  it('renders a section card for each shop area linking to the right route', () => {
    renderHub()
    for (const href of ['/shop/orders', '/shop/memberships', '/shop/coupons', '/shop/payments']) {
      expect(sectionCard(href)).toBeInTheDocument()
    }
  })

  it('each section card shows its title and live stat line', () => {
    renderHub({
      orderStats: { paidCount: 9, unfulfilledCount: 4, revenueCents: 50000 },
      membershipStats: { activeMembers: 12, mrrCents: 39900 },
      couponStats: { activeCount: 3 },
      paymentStats: { count: 2 },
    })

    const orders = within(sectionCard('/shop/orders'))
    expect(orders.getByText('Orders')).toBeInTheDocument()
    expect(orders.getByText('4 to fulfill')).toBeInTheDocument()

    const memberships = within(sectionCard('/shop/memberships'))
    expect(memberships.getByText('Memberships')).toBeInTheDocument()
    expect(memberships.getByText(/12 active/)).toBeInTheDocument()
    expect(memberships.getByText(/\$399\.00\/mo/)).toBeInTheDocument()

    const coupons = within(sectionCard('/shop/coupons'))
    expect(coupons.getByText('Coupons')).toBeInTheDocument()
    expect(coupons.getByText('3 active codes')).toBeInTheDocument()

    const payments = within(sectionCard('/shop/payments'))
    expect(payments.getByText('Payments')).toBeInTheDocument()
    expect(payments.getByText('2 to reconcile')).toBeInTheDocument()
  })

  it('Orders card surfaces the unfulfilled count (warn) — the founder\'s "view orders" need', () => {
    renderHub({ orderStats: { paidCount: 7, unfulfilledCount: 3, revenueCents: 9000 } })
    const orders = within(sectionCard('/shop/orders'))
    const stat = orders.getByText('3 to fulfill')
    // Warn tone (needs our action) when there are unfulfilled orders.
    expect(stat.className).toMatch(/amber/)
  })

  it('Orders card falls back to the paid count when nothing is unfulfilled', () => {
    renderHub({ orderStats: { paidCount: 5, unfulfilledCount: 0, revenueCents: 12000 } })
    expect(within(sectionCard('/shop/orders')).getByText('5 paid')).toBeInTheDocument()
  })

  it('shows calm zero-state stats when each area is empty', () => {
    renderHub({
      orderStats: { paidCount: 0, unfulfilledCount: 0, revenueCents: 0 },
      membershipStats: { activeMembers: 0, mrrCents: 0 },
      couponStats: { activeCount: 0 },
      paymentStats: { count: 0 },
    })
    expect(within(sectionCard('/shop/orders')).getByText('0 paid')).toBeInTheDocument()
    expect(within(sectionCard('/shop/memberships')).getByText('No members yet')).toBeInTheDocument()
    expect(within(sectionCard('/shop/coupons')).getByText('No active codes')).toBeInTheDocument()
    // Connected + nothing to reconcile reads as a calm "Connected".
    expect(within(sectionCard('/shop/payments')).getByText('Connected')).toBeInTheDocument()
  })

  it('Payments card reads "Not connected" when Stripe is not ready', () => {
    renderHub({ config: { stripeAccountStatus: 'none', chargesEnabled: false } })
    expect(within(sectionCard('/shop/payments')).getByText('Not connected')).toBeInTheDocument()
  })

  it('uses the singular "code" label for a single active coupon', () => {
    renderHub({ couponStats: { activeCount: 1 } })
    expect(within(sectionCard('/shop/coupons')).getByText('1 active code')).toBeInTheDocument()
  })
})

describe('ShopClient — Stripe Connect status panel', () => {
  it('shows the teal Connect CTA when configured but not yet connected', () => {
    renderHub({ config: { stripeAccountStatus: 'none', chargesEnabled: false }, connectConfigured: true })
    // When not connected, both the page primary (header) and the status panel
    // surface a "Connect Stripe" CTA — both point at the OAuth start route.
    // (Exact name match excludes the Payments section card, whose description
    // also mentions connecting Stripe.)
    const connect = screen.getAllByRole('link', { name: 'Connect Stripe' })
    expect(connect.length).toBeGreaterThan(0)
    expect(connect.every((a) => a.getAttribute('href') === '/api/connect/shop/start')).toBe(true)
  })

  it('shows a calm Connected panel with the Stripe dashboard link once active', () => {
    renderHub({ config: { stripeAccountStatus: 'active', chargesEnabled: true } })
    expect(screen.getByRole('link', { name: /Manage payouts in Stripe/i })).toHaveAttribute(
      'href',
      'https://dashboard.stripe.com',
    )
  })
})

describe('ShopClient — catalog + header', () => {
  it('keeps the page primary action (Add product) when payments are ready', () => {
    renderHub()
    // Header + catalog both expose an Add-product link to the new-product route.
    const addLinks = screen.getAllByRole('link', { name: /\+ Add product/i })
    expect(addLinks.length).toBeGreaterThan(0)
    expect(addLinks.every((a) => a.getAttribute('href') === '/shop/products/new')).toBe(true)
  })

  it('renders the empty catalog state with its own Add-product CTA', () => {
    renderHub()
    expect(screen.getByText('No products yet')).toBeInTheDocument()
  })
})
