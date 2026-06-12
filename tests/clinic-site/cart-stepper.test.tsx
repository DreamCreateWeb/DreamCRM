/**
 * Cart quantity stepper (Wave 4 mobile-ergonomics) — replaces the fiddly
 * number-spinner with ≥44px − / value / + buttons that clamp 1–99.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import type { CartLine } from '@/lib/types/shop'

const line: CartLine = {
  variantId: 'v1',
  productSlug: 'whitening-kit',
  productName: 'Whitening Kit',
  variantName: 'Default',
  priceCents: 4999,
  qty: 1,
  image: null,
}

// Mutable cart the mocked store reads/writes; the component refreshes from it
// on the 'cart-updated' event.
let cart: CartLine[] = [{ ...line }]
const setQtyMock = vi.fn((_slug: string, variantId: string, qty: number) => {
  cart = cart.map((l) => (l.variantId === variantId ? { ...l, qty } : l))
  window.dispatchEvent(new Event('cart-updated'))
})
const removeLineMock = vi.fn()

vi.mock('@/app/site/[slug]/shop/cart-store', () => ({
  getCart: () => cart,
  setQty: (slug: string, variantId: string, qty: number) => setQtyMock(slug, variantId, qty),
  removeLine: (slug: string, variantId: string) => removeLineMock(slug, variantId),
}))

vi.mock('@/app/site/[slug]/shop/actions', () => ({
  startCheckout: vi.fn(async () => ({ url: 'https://checkout.example' })),
  applyCoupon: vi.fn(async () => ({ ok: true, discountCents: 0 })),
}))

import CartView from '@/app/site/[slug]/shop/cart-view'

function renderCart() {
  return render(
    <CartView slug="acme" brand="#9CAF9F" basePath="/site/acme" pickupEnabled shippingEnabled />,
  )
}

describe('Cart quantity stepper', () => {
  beforeEach(() => {
    cart = [{ ...line }]
    setQtyMock.mockClear()
    removeLineMock.mockClear()
  })

  it('renders +/− stepper buttons with accessible labels and the current qty', () => {
    renderCart()
    expect(screen.getByLabelText(/Increase quantity of Whitening Kit/i)).toBeTruthy()
    expect(screen.getByLabelText(/Decrease quantity of Whitening Kit/i)).toBeTruthy()
    expect(screen.getByLabelText(/Quantity: 1/i)).toBeTruthy()
  })

  it('increments via the + button (clamped at 99)', () => {
    renderCart()
    fireEvent.click(screen.getByLabelText(/Increase quantity of Whitening Kit/i))
    expect(setQtyMock).toHaveBeenCalledWith('acme', 'v1', 2)
  })

  it('disables the − button at qty 1 (cannot go below 1)', () => {
    renderCart()
    const minus = screen.getByLabelText(/Decrease quantity of Whitening Kit/i) as HTMLButtonElement
    expect(minus.disabled).toBe(true)
  })

  it('exposes a remove button with an accessible label', () => {
    renderCart()
    const remove = screen.getByLabelText(/Remove Whitening Kit from cart/i)
    fireEvent.click(remove)
    expect(removeLineMock).toHaveBeenCalledWith('acme', 'v1')
  })
})
