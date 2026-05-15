'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { checkoutCart } from '../(shop)/actions'

export default function CheckoutButton({ totalCents, currency = 'USD' }: { totalCents: number; currency?: string }) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function onClick() {
    startTransition(async () => {
      try {
        await checkoutCart()
        router.push('/ecommerce/orders')
      } catch (err) {
        alert((err as Error).message)
      }
    })
  }

  const display = new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(totalCents / 100)

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending || totalCents <= 0}
      className="btn w-full bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white disabled:opacity-60"
    >
      {pending ? 'Processing…' : `Checkout — ${display}`}
    </button>
  )
}
