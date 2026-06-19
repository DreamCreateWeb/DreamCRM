import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'

/**
 * Design v2 header quick-create (`+ New ▾`, DESIGN-SYSTEM.md Part 4).
 * Covers: plan/role gating via `moduleIds`, the context-aware split control
 * (primary jumps straight to the create on a page that owns one), the
 * `dc:quick-create` custom event ('C' key), and render-nothing when the
 * tenant has no creatable surfaces.
 */

let pathname = '/'
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
}))

import QuickCreateMenu from '@/components/ui/quick-create-menu'

beforeEach(() => {
  pathname = '/'
})

describe('QuickCreateMenu — gating', () => {
  it('only offers entries whose module id is visible to the tenant', () => {
    // Patients + appointments visible; recall/blog not.
    render(<QuickCreateMenu moduleIds={['appointments', 'patients']} />)
    fireEvent.click(screen.getByRole('button', { name: /New|create/i }))
    const menu = screen.getByRole('menu')
    expect(within(menu).getByText('New booking')).toBeInTheDocument()
    expect(within(menu).getByText('New patient')).toBeInTheDocument()
    expect(within(menu).queryByText('New campaign')).not.toBeInTheDocument()
    expect(within(menu).queryByText('New post')).not.toBeInTheDocument()
  })

  it('includes campaign + post when those modules are visible', () => {
    render(<QuickCreateMenu moduleIds={['recall', 'blog']} />)
    fireEvent.click(screen.getByRole('button', { name: /New|create/i }))
    const menu = screen.getByRole('menu')
    expect(within(menu).getByText('New campaign')).toHaveAttribute('href', '/marketing/campaigns')
    expect(within(menu).getByText('New post')).toHaveAttribute('href', '/posts')
  })

  it('renders nothing when the tenant has no creatable surfaces (e.g. platform)', () => {
    const { container } = render(<QuickCreateMenu moduleIds={['clinics', 'subscriptions']} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('QuickCreateMenu — context default', () => {
  it('on /appointments the primary action jumps straight to the new-booking deep link', () => {
    pathname = '/appointments'
    render(<QuickCreateMenu moduleIds={['appointments', 'patients']} />)
    // Split control: a primary link (the contextual create) + a caret button.
    const primary = screen.getByRole('link', { name: /New booking/i })
    expect(primary).toHaveAttribute('href', '/appointments?new=1')
    // The caret still opens the full menu.
    expect(screen.getByRole('button', { name: /more create options/i })).toBeInTheDocument()
  })

  it('on /patients the contextual primary is New patient', () => {
    pathname = '/patients'
    render(<QuickCreateMenu moduleIds={['appointments', 'patients']} />)
    expect(screen.getByRole('link', { name: /New patient/i })).toHaveAttribute('href', '/patients?new=1')
  })

  it('off a create page there is no split primary — just the menu button', () => {
    pathname = '/reviews'
    render(<QuickCreateMenu moduleIds={['appointments', 'patients']} />)
    expect(screen.queryByRole('link', { name: /New booking/i })).not.toBeInTheDocument()
    // The plain `+ New` menu trigger is present.
    expect(screen.getByRole('button', { name: /New|create/i })).toBeInTheDocument()
  })
})

describe('QuickCreateMenu — C key (dc:quick-create event)', () => {
  it('opens the menu when the global key map dispatches dc:quick-create', () => {
    render(<QuickCreateMenu moduleIds={['appointments', 'patients']} />)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    fireEvent(window, new CustomEvent('dc:quick-create'))
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })

  it('closes on Escape', () => {
    render(<QuickCreateMenu moduleIds={['appointments', 'patients']} />)
    fireEvent(window, new CustomEvent('dc:quick-create'))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('moves focus into the menu when it opens (focus trap)', () => {
    render(<QuickCreateMenu moduleIds={['appointments', 'patients']} />)
    fireEvent(window, new CustomEvent('dc:quick-create'))
    const menu = screen.getByRole('menu')
    // The trap's initialFocus lands on the first focusable inside the menu.
    expect(menu.contains(document.activeElement)).toBe(true)
  })
})
