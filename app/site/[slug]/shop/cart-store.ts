'use client'

import type { CartLine } from '@/lib/types/shop'

// localStorage-backed cart, namespaced per clinic slug so two clinic
// storefronts never share a basket. The server always re-prices at checkout,
// so the stored price is display-only.
const keyFor = (slug: string) => `dreamcrm_cart_${slug}`

export function getCart(slug: string): CartLine[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(keyFor(slug))
    return raw ? (JSON.parse(raw) as CartLine[]) : []
  } catch {
    return []
  }
}

function save(slug: string, lines: CartLine[]) {
  localStorage.setItem(keyFor(slug), JSON.stringify(lines))
  window.dispatchEvent(new Event('cart-updated'))
}

export function addToCart(slug: string, line: CartLine) {
  const cart = getCart(slug)
  const existing = cart.find((l) => l.variantId === line.variantId)
  if (existing) existing.qty = Math.min(existing.qty + line.qty, 99)
  else cart.push(line)
  save(slug, cart)
}

export function setQty(slug: string, variantId: string, qty: number) {
  save(
    slug,
    getCart(slug).map((l) => (l.variantId === variantId ? { ...l, qty: Math.max(1, Math.min(qty, 99)) } : l)),
  )
}

export function removeLine(slug: string, variantId: string) {
  save(slug, getCart(slug).filter((l) => l.variantId !== variantId))
}

export function clearCart(slug: string) {
  save(slug, [])
}

export function cartCount(slug: string): number {
  return getCart(slug).reduce((s, l) => s + l.qty, 0)
}
