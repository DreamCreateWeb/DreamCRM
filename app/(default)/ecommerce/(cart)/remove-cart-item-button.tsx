'use client'

import { useTransition } from 'react'
import { removeFromCart } from '../(shop)/actions'

export default function RemoveCartItemButton({ productId }: { productId: number }) {
  const [pending, startTransition] = useTransition()
  return (
    <button
      type="button"
      onClick={() => startTransition(() => removeFromCart(productId))}
      disabled={pending}
      className="text-sm underline hover:no-underline disabled:opacity-60"
    >
      {pending ? 'Removing…' : 'Remove'}
    </button>
  )
}
