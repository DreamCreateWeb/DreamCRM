'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import PayBg from '@/public/images/pay-bg.jpg'
import User from '@/public/images/user-64-13.jpg'
import { payForAmount, payForCart } from './actions'

export default function PayForm({
  totalCents,
  currency = 'USD',
  orderId,
}: {
  totalCents: number
  currency?: string
  orderId?: number
}) {
  const [card, setCard] = useState<boolean>(true)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const display = new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(totalCents / 100)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        if (orderId) {
          // existing order; just mark it processing (no-op since createOrder already does that)
        } else if (totalCents > 0) {
          // Either checkout the cart (preferred) or create an order with the passed total
          try {
            await payForCart()
          } catch {
            await payForAmount(totalCents)
          }
        } else {
          await payForCart()
        }
        router.push('/ecommerce/cart-3')
      } catch (err) {
        setError((err as Error).message)
      }
    })
  }

  return (
    <main>
      <div className="relative pt-8">
        <div className="absolute inset-0 bg-gray-800 overflow-hidden" aria-hidden="true">
          <Image className="object-cover h-full w-full filter blur-sm opacity-10" src={PayBg} width={460} height={180} alt="Pay background" />
        </div>
        <div className="relative px-4 sm:px-6 lg:px-8 max-w-lg mx-auto">
          <Image className="rounded-t-xl shadow-lg" src={PayBg} width={460} height={180} alt="Pay background" />
        </div>
      </div>

      <div className="relative px-4 sm:px-6 lg:px-8 pb-8 max-w-lg mx-auto">
        <div className="bg-white dark:bg-gray-800 px-8 pb-6 rounded-b-xl shadow-sm">
          <div className="text-center mb-6">
            <div className="mb-2">
              <Image className="-mt-8 inline-flex rounded-full" src={User} width={64} height={64} alt="User" />
            </div>
            <h1 className="text-xl leading-snug text-gray-800 dark:text-gray-100 font-semibold mb-2">Complete your order</h1>
            <div className="text-sm">
              Pay {display} to finish placing your order.
            </div>
          </div>

          <div className="flex justify-center mb-6">
            <div className="relative flex w-full p-1 bg-gray-100 dark:bg-gray-700/30 rounded-sm">
              <span className="absolute inset-0 m-1 pointer-events-none" aria-hidden="true">
                <span className={`absolute inset-0 w-1/2 bg-white dark:bg-gray-100 rounded-lg border border-gray-200 shadow-sm transition ${card ? 'translate-x-0' : 'translate-x-full'}`}></span>
              </span>
              <button
                type="button"
                className={`relative flex-1 text-sm font-medium text-gray-600 p-1 transition ${card ? 'dark:text-gray-800' : 'dark:text-gray-500'}`}
                onClick={(e) => { e.preventDefault(); setCard(true); }}
              >Pay With Card</button>
              <button
                type="button"
                className={`relative flex-1 text-sm font-medium text-gray-600 p-1 transition ${!card ? 'dark:text-gray-800' : 'dark:text-gray-500'}`}
                onClick={(e) => { e.preventDefault(); setCard(false); }}
              >Pay With PayPal</button>
            </div>
          </div>

          <form onSubmit={submit}>
            {card && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1" htmlFor="card-nr">Card Number <span className="text-red-500">*</span></label>
                  <input id="card-nr" className="form-input w-full" type="text" placeholder="1234 1234 1234 1234" required />
                </div>
                <div className="flex space-x-4">
                  <div className="flex-1">
                    <label className="block text-sm font-medium mb-1" htmlFor="card-expiry">Expiry Date <span className="text-red-500">*</span></label>
                    <input id="card-expiry" className="form-input w-full" type="text" placeholder="MM/YY" required />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-medium mb-1" htmlFor="card-cvc">CVC <span className="text-red-500">*</span></label>
                    <input id="card-cvc" className="form-input w-full" type="text" placeholder="CVC" required />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" htmlFor="card-name">Name on Card <span className="text-red-500">*</span></label>
                  <input id="card-name" className="form-input w-full" type="text" placeholder="John Doe" required />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" htmlFor="card-email">Email <span className="text-red-500">*</span></label>
                  <input id="card-email" className="form-input w-full" type="email" placeholder="john@company.com" required />
                </div>
              </div>
            )}

            {error && (
              <div className="mt-4 text-sm text-red-600 bg-red-50 dark:bg-red-500/10 px-3 py-2 rounded">{error}</div>
            )}

            <div className="mt-6">
              <div className="mb-4">
                <button type="submit" disabled={pending} className="btn w-full bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white disabled:opacity-60">
                  {pending ? 'Processing…' : card ? `Pay ${display}` : `Pay with PayPal — ${display}`}
                </button>
              </div>
              <div className="text-xs text-gray-500 italic text-center">
                No real payment is processed. This persists an order with status &quot;processing&quot;.
              </div>
            </div>
          </form>
        </div>
      </div>
    </main>
  )
}
