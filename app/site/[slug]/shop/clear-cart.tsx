'use client'

import { useEffect } from 'react'
import { clearCart } from './cart-store'

export default function ClearCart({ slug }: { slug: string }) {
  useEffect(() => {
    clearCart(slug)
  }, [slug])
  return null
}
