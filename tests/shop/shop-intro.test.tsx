import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/**
 * ML-42 — the Shop's own front door. Off, it names the three steps and does
 * the first one (Stripe) right there; the connect link is real and only
 * offered to someone who can use it; an unreadable Stripe state never reads
 * "not connected". The hub's own connect card is still the page once on.
 */

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh }), usePathname: () => '/x' }))
const enableFeatureAction = vi.fn(async () => ({ ok: true as const }))
vi.mock('@/app/(default)/feature-switch-actions', () => ({
  enableFeatureAction: (...a: unknown[]) => enableFeatureAction(...(a as [])),
  disableFeatureAction: vi.fn(),
}))

import ShopIntroCard from '@/app/(default)/shop/shop-intro-card'

const base = { orgName: 'Dream Dental', canManage: true, connectConfigured: true, isDemo: false, productCount: 0, shopPath: '/site/dream-dental/shop' }

beforeEach(() => {
  refresh.mockClear()
  enableFeatureAction.mockClear()
})

describe('ShopIntroCard', () => {
  it('renders the three steps with the real connect link while the shop is off', async () => {
    render(<ShopIntroCard {...base} stripe="none" />)
    expect(screen.getByTestId('shop-intro')).toBeInTheDocument()
    expect(screen.getByTestId('shop-step-1')).toHaveTextContent('Connect Stripe')
    expect(screen.getByTestId('shop-step-2')).toHaveTextContent('Add a product')
    expect(screen.getByTestId('shop-step-3')).toHaveTextContent('Share the link')
    expect(screen.getByTestId('shop-step-3')).toHaveTextContent('/site/dream-dental/shop')
    expect(screen.getByRole('link', { name: 'Connect Stripe' })).toHaveAttribute('href', '/api/connect/shop/start')
    fireEvent.click(screen.getByRole('button', { name: 'Turn on Shop' }))
    await waitFor(() => expect(enableFeatureAction).toHaveBeenCalledWith('shop'))
  })

  it('says the true Stripe state: connected, pending, unreadable', () => {
    const { unmount } = render(<ShopIntroCard {...base} stripe="ready" productCount={3} />)
    expect(screen.getByText('Stripe connected')).toBeInTheDocument()
    expect(screen.getByText('3 products ready')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Connect Stripe' })).toBeNull()
    unmount()
    const pending = render(<ShopIntroCard {...base} stripe="pending" />)
    expect(screen.getByText('Finish setup in Stripe')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Finish Stripe setup' })).toBeInTheDocument()
    pending.unmount()
    render(<ShopIntroCard {...base} stripe="unreadable" productCount={null} />)
    expect(screen.getByText('Couldn’t read Stripe just now')).toBeInTheDocument()
    expect(screen.queryByText('Stripe not connected')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Connect Stripe' })).toBeNull()
  })

  it('no connect link for a member, the demo, or an installation without Connect; members read who can', () => {
    const a = render(<ShopIntroCard {...base} canManage={false} stripe="none" />)
    expect(screen.queryByRole('link', { name: 'Connect Stripe' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Turn on Shop' })).toBeNull()
    a.unmount()
    const b = render(<ShopIntroCard {...base} isDemo stripe="none" />)
    expect(screen.queryByRole('link', { name: 'Connect Stripe' })).toBeNull()
    b.unmount()
    render(<ShopIntroCard {...base} connectConfigured={false} stripe="none" />)
    expect(screen.queryByRole('link', { name: 'Connect Stripe' })).toBeNull()
    expect(screen.getByText(/isn’t configured on this installation/)).toBeInTheDocument()
  })

  it('never says coming soon', () => {
    render(<ShopIntroCard {...base} stripe="none" />)
    expect(document.body.textContent).not.toMatch(/coming (soon|next|later)|in the works/i)
  })
})
