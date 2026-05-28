'use client'

import { useEffect, useState } from 'react'
import { cartCount } from './cart-store'

export default function CartButton({ slug, brand, basePath }: { slug: string; brand: string; basePath: string }) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    const update = () => setCount(cartCount(slug))
    update()
    window.addEventListener('cart-updated', update)
    window.addEventListener('storage', update)
    return () => {
      window.removeEventListener('cart-updated', update)
      window.removeEventListener('storage', update)
    }
  }, [slug])

  return (
    <a
      href={`${basePath}/shop/cart`}
      className="shrink-0 inline-flex items-center gap-2 text-[14px] font-semibold px-4 py-2 rounded-full border"
      style={{ borderColor: brand, color: brand }}
    >
      Cart
      {count > 0 && (
        <span className="inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full text-[11px] text-white" style={{ backgroundColor: brand }}>
          {count}
        </span>
      )}
    </a>
  )
}
