'use client'

import { useState } from 'react'
import { formatCents } from '@/lib/types/shop'
import { addToCart } from './cart-store'

interface VariantOpt {
  id: string
  name: string
  priceCents: number
  inStock: boolean
}

export default function AddToCart({
  slug,
  brand,
  product,
}: {
  slug: string
  brand: string
  product: { slug: string; name: string; image: string | null; variants: VariantOpt[] }
}) {
  const [variantId, setVariantId] = useState(product.variants[0]?.id ?? '')
  const [qty, setQty] = useState(1)
  const [added, setAdded] = useState(false)

  const variant = product.variants.find((v) => v.id === variantId) ?? product.variants[0]
  const outOfStock = variant && !variant.inStock

  return (
    <div>
      {product.variants.length > 1 && (
        <div className="mb-4">
          <label className="block text-[12px] font-medium mb-1.5" style={{ color: '#6B635A' }}>Option</label>
          <select
            value={variantId}
            onChange={(e) => { setVariantId(e.target.value); setAdded(false) }}
            className="w-full text-[15px] px-3.5 py-2.5 rounded-xl border bg-white"
            style={{ borderColor: '#E8E2D9' }}
          >
            {product.variants.map((v) => (
              <option key={v.id} value={v.id} disabled={!v.inStock}>
                {v.name} — {formatCents(v.priceCents)}{!v.inStock ? ' (sold out)' : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="text-2xl font-bold" style={{ color: '#1C1A17' }}>{variant ? formatCents(variant.priceCents) : ''}</div>
        <input
          type="number"
          min={1}
          max={99}
          value={qty}
          onChange={(e) => setQty(Math.max(1, Math.min(parseInt(e.target.value) || 1, 99)))}
          className="w-16 text-[15px] px-3 py-2.5 rounded-xl border bg-white"
          style={{ borderColor: '#E8E2D9' }}
        />
      </div>

      <button
        disabled={outOfStock}
        onClick={() => {
          if (!variant) return
          addToCart(slug, {
            variantId: variant.id,
            productSlug: product.slug,
            productName: product.name,
            variantName: variant.name,
            priceCents: variant.priceCents,
            image: product.image,
            qty,
          })
          setAdded(true)
        }}
        className="w-full mt-4 text-[15px] font-semibold px-6 py-3 rounded-xl text-white disabled:opacity-50"
        style={{ backgroundColor: brand }}
      >
        {outOfStock ? 'Sold out' : added ? 'Added ✓ — add more?' : 'Add to cart'}
      </button>
      {added && (
        <a href={`/site/${slug}/shop/cart`} className="block text-center text-[14px] font-medium mt-3 underline" style={{ color: brand }}>
          Go to cart →
        </a>
      )}
    </div>
  )
}
