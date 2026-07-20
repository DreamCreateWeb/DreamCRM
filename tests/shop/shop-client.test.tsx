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
// Rendered outside the ConfirmProvider; pass useConfirm() through.
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => async () => true }))

import ShopClient from '@/app/(default)/shop/shop-client'
import type { ShopConfigView, ShopStats } from '@/lib/types/shop'

/** Money surfaces (payments / collections / memberships) moved to the
 *  Payments workspace (2026-07-14) — their door tests live in
 *  tests/payments/hub-doors.test.tsx. This suite covers the commerce hub. */

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
  orderStats?: Partial<{
    paidCount: number
    unfulfilledCount: number
    fulfilledCount: number
    revenueCents: number
    last30Cents: number
    last30Count: number
  }>
  ordersPerWeek8?: Array<{ bucket: string; value: number }>
  topProducts?: Array<{ productName: string; unitsSold: number; revenueCents: number; productId: string | null }>
  membershipStats?: { activeMembers: number; mrrCents: number }
  couponStats?: { activeCount: number }
  connectConfigured?: boolean
  connectBanner?: string | null
}

function renderHub(opts: RenderOpts = {}) {
  return render(
    <ShopClient
      config={config(opts.config)}
      products={[]}
      stats={stats}
      orderStats={{
        paidCount: 5,
        unfulfilledCount: 0,
        fulfilledCount: 5,
        revenueCents: 12000,
        last30Cents: 12000,
        last30Count: 5,
        ...opts.orderStats,
      }}
      ordersPerWeek8={opts.ordersPerWeek8}
      topProducts={opts.topProducts ?? []}
      membershipStats={opts.membershipStats ?? { activeMembers: 0, mrrCents: 0 }}
      couponStats={opts.couponStats ?? { activeCount: 0 }}
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
  const card = links.find((a) => a.querySelector('.v2-card-interactive'))
  if (!card) throw new Error(`No section card linking to ${href}`)
  return card as HTMLElement
}

describe('ShopClient — section navigation cards', () => {
  it('renders the commerce section cards — money doors live on /payments now', () => {
    renderHub()
    for (const href of ['/shop/orders', '/shop/coupons']) {
      expect(sectionCard(href)).toBeInTheDocument()
    }
    // The moved money surfaces must NOT have hub doors here anymore.
    for (const gone of ['/payments/collections', '/payments/online']) {
      const links = screen.getAllByRole('link').filter((a) => a.getAttribute('href') === gone)
      expect(links.find((a) => a.querySelector('.v2-card-interactive'))).toBeUndefined()
    }
  })

  it('each section card shows its title and live stat line', () => {
    renderHub({
      orderStats: { paidCount: 9, unfulfilledCount: 4, revenueCents: 50000 },
      couponStats: { activeCount: 3 },
    })

    const orders = within(sectionCard('/shop/orders'))
    expect(orders.getByText('Orders')).toBeInTheDocument()
    expect(orders.getByText('4 to fulfill')).toBeInTheDocument()

    const coupons = within(sectionCard('/shop/coupons'))
    expect(coupons.getByText('Coupons')).toBeInTheDocument()
    expect(coupons.getByText('3 active codes')).toBeInTheDocument()
  })

  it('Orders card surfaces the unfulfilled count (warn) — the founder\'s "view orders" need', () => {
    renderHub({ orderStats: { paidCount: 7, unfulfilledCount: 3, revenueCents: 9000 } })
    const orders = within(sectionCard('/shop/orders'))
    const stat = orders.getByText('3 to fulfill')
    expect(stat.className).toMatch(/amber/)
  })

  it('Orders card falls back to the paid count when nothing is unfulfilled', () => {
    renderHub({ orderStats: { paidCount: 5, unfulfilledCount: 0, revenueCents: 12000 } })
    expect(within(sectionCard('/shop/orders')).getByText('5 paid')).toBeInTheDocument()
  })

  it('uses the singular "code" label for a single active coupon', () => {
    renderHub({ couponStats: { activeCount: 1 } })
    expect(within(sectionCard('/shop/coupons')).getByText('1 active code')).toBeInTheDocument()
  })
})

describe('ShopClient — Stripe Connect status panel', () => {
  it('shows the teal Connect CTA when configured but not yet connected', () => {
    renderHub({ config: { stripeAccountStatus: 'none', chargesEnabled: false }, connectConfigured: true })
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

describe('ShopClient — sales overview', () => {
  it('leads with a sales band (revenue + best sellers) once there are sales', () => {
    renderHub({
      orderStats: { paidCount: 9, unfulfilledCount: 4, fulfilledCount: 5, revenueCents: 50000, last30Cents: 30000, last30Count: 6 },
      topProducts: [
        { productName: 'Whitening Kit', unitsSold: 7, revenueCents: 28000, productId: 'prod_1' },
        { productName: 'Sonic Brush', unitsSold: 3, revenueCents: 26700, productId: null },
      ],
    })
    expect(screen.getByText('Sales')).toBeInTheDocument()
    expect(screen.getByText('Best sellers')).toBeInTheDocument()
    expect(screen.getByText('Whitening Kit')).toBeInTheDocument()
    expect(screen.getByText('7 sold')).toBeInTheDocument()
    // v3 action-links law: a live best seller links to its product editor;
    // a deleted product's row stays plain text (no 404 links).
    expect(screen.getByRole('link', { name: 'Whitening Kit' })).toHaveAttribute('href', '/shop/products/prod_1')
    expect(screen.queryByRole('link', { name: 'Sonic Brush' })).toBeNull()
    const revenueTile = screen.getByText('Revenue · 30 days').closest('a')
    expect(revenueTile).toHaveAttribute('href', '/shop/orders?status=paid')
  })

  it('the Recurring KPI drills into the Payments workspace (memberships moved there)', () => {
    renderHub({ membershipStats: { activeMembers: 12, mrrCents: 39900 } })
    const tile = screen.getByText('Recurring').closest('a')
    expect(tile).toHaveAttribute('href', '/payments/memberships')
  })

  it('draws the orders-per-week heartbeat on the Paid-orders tile (and ONLY there), decorative', () => {
    const { container } = renderHub({
      orderStats: { paidCount: 9, unfulfilledCount: 4, fulfilledCount: 5, revenueCents: 50000, last30Cents: 30000, last30Count: 6 },
      ordersPerWeek8: [
        { bucket: 'Nov 16', value: 0 },
        { bucket: 'Nov 23', value: 2 },
        { bucket: 'Nov 30', value: 1 },
        { bucket: 'Dec 7', value: 3 },
        { bucket: 'Dec 14', value: 0 },
        { bucket: 'Dec 21', value: 1 },
        { bucket: 'Dec 28', value: 4 },
        { bucket: 'Jan 4', value: 2 },
      ],
    })
    // The Sparkline's polyline is unambiguous — NavIcon svgs draw paths only.
    const tile = screen.getByText('Paid orders').closest('a') as HTMLElement
    expect(tile.querySelectorAll('polyline').length).toBe(1)
    // Law 7 budget: one heartbeat on this hub, total.
    expect(container.querySelectorAll('polyline').length).toBe(1)
    // Decorative + non-interactive: aria-hidden wrapper, pointer-events off.
    const wrap = tile.querySelector('[aria-hidden="true"]') as HTMLElement
    expect(wrap).toBeTruthy()
    expect(wrap.className).toContain('pointer-events-none')
  })

  it('renders sparkless (not broken) when the weekly series is empty — the best-effort .catch', () => {
    const { container } = renderHub({
      orderStats: { paidCount: 9, unfulfilledCount: 4, fulfilledCount: 5, revenueCents: 50000, last30Cents: 30000, last30Count: 6 },
      ordersPerWeek8: [],
    })
    expect(screen.getByText('Paid orders')).toBeInTheDocument()
    expect(container.querySelectorAll('polyline').length).toBe(0)
  })

  it('hides the sales band entirely for a brand-new shop with no sales', () => {
    renderHub({
      orderStats: { paidCount: 0, unfulfilledCount: 0, fulfilledCount: 0, revenueCents: 0, last30Cents: 0, last30Count: 0 },
      membershipStats: { activeMembers: 0, mrrCents: 0 },
      topProducts: [],
    })
    expect(screen.queryByText('Sales')).toBeNull()
    expect(screen.queryByText('Best sellers')).toBeNull()
  })
})

describe('ShopClient — catalog + header', () => {
  it('keeps the page primary action (Add product) when payments are ready', () => {
    renderHub()
    const addLinks = screen.getAllByRole('link', { name: /\+ Add product/i })
    expect(addLinks.length).toBeGreaterThan(0)
    expect(addLinks.every((a) => a.getAttribute('href') === '/shop/products/new')).toBe(true)
  })

  it('renders the empty catalog state with its own Add-product CTA', () => {
    renderHub()
    expect(screen.getByText('No products yet')).toBeInTheDocument()
  })
})
