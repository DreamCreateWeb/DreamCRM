'use client'

import { useState, useTransition } from 'react'
import { addToCart } from './actions'

export default function AddToCartButton({
  productId,
  quantity = 1,
  label = 'Add to Cart',
}: {
  productId: number
  quantity?: number
  label?: string
}) {
  const [pending, startTransition] = useTransition()
  const [done, setDone] = useState(false)

  function onClick() {
    startTransition(async () => {
      await addToCart(productId, quantity)
      setDone(true)
      setTimeout(() => setDone(false), 1500)
    })
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="btn-sm w-full bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white disabled:opacity-60"
    >
      {pending ? 'Adding…' : done ? 'Added!' : label}
    </button>
  )
}
