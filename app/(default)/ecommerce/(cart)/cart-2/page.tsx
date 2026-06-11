export const metadata = {
  title: 'Cart 2 - DreamCRM',
  description: 'Review and pay',
}

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import CartItems from '../cart-items'
import CheckoutButton from '../checkout-button'
import { requireTenant } from '@/lib/auth/context'
import { cartTotal } from '@/lib/services/cart'
import { formatMoney } from '@/lib/utils'

export default async function Cart2() {
  const ctx = await requireTenant()
  // The clinic's commerce surface is /shop — this generic Mosaic cart isn't
  // in their nav. (Mirrors the /calendar clinic redirect.)
  if (ctx.tenantType === 'clinic') redirect('/shop')
  const { subtotalCents, itemCount, lines } = await cartTotal(ctx.userId, ctx.organizationId)
  const currency = lines[0]?.currency ?? 'USD'
  const taxes = Math.round(subtotalCents * 0.1)
  const total = subtotalCents + taxes

  return (
    <div className="lg:relative lg:flex">
      <div className="px-4 sm:px-6 lg:px-8 py-8 lg:grow lg:pr-8 xl:pr-16 2xl:ml-[80px]">
        <div className="lg:max-w-[640px] lg:mx-auto">
          <div className="mb-6 lg:mb-0">
            <div className="mb-3">
              <div className="flex text-sm font-medium text-gray-400 dark:text-gray-500 space-x-2">
                <span className="text-gray-500 dark:text-gray-400">Review</span>
                <span>-&gt;</span>
                <span className="text-violet-500">Payment</span>
                <span>-&gt;</span>
                <span className="text-gray-500 dark:text-gray-400">Confirm</span>
              </div>
            </div>
            <header className="mb-2">
              <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">Shopping Cart ({itemCount})</h1>
            </header>
            <CartItems />
          </div>
        </div>
      </div>

      <div>
        <div className="lg:sticky lg:top-16 bg-linear-to-r from-white/30 dark:from-gray-800/30 lg:overflow-x-hidden lg:overflow-y-auto no-scrollbar lg:shrink-0 border-t lg:border-t-0 lg:border-l border-gray-200 dark:border-gray-700/60 lg:w-[320px] xl:w-[352px] 2xl:w-[calc(352px+80px)] lg:h-[calc(100dvh-64px)]">
          <div className="py-8 px-4 lg:px-8 2xl:px-12">
            <div className="max-w-sm mx-auto lg:max-w-none">
              <h2 className="text-2xl text-gray-800 dark:text-gray-100 font-bold mb-6">Review & Pay</h2>
              <div className="space-y-6">
                <div>
                  <div className="text-gray-800 dark:text-gray-100 font-semibold mb-2">Order Summary</div>
                  <ul className="mb-4">
                    <li className="text-sm w-full flex justify-between py-3 border-b border-gray-200 dark:border-gray-700/60">
                      <div>Subtotal</div>
                      <div className="font-medium text-gray-800 dark:text-gray-100">{formatMoney(subtotalCents, currency)}</div>
                    </li>
                    <li className="text-sm w-full flex justify-between py-3 border-b border-gray-200 dark:border-gray-700/60">
                      <div>Taxes (10%)</div>
                      <div className="font-medium text-gray-800 dark:text-gray-100">{formatMoney(taxes, currency)}</div>
                    </li>
                    <li className="text-sm w-full flex justify-between py-3 border-b border-gray-200 dark:border-gray-700/60">
                      <div>Total due</div>
                      <div className="font-medium text-green-600">{formatMoney(total, currency)}</div>
                    </li>
                  </ul>
                </div>

                <div className="mt-6">
                  <div className="mb-4">
                    <CheckoutButton totalCents={total} currency={currency} />
                  </div>
                  <div className="text-xs text-gray-500 italic text-center">No real payment is processed — this creates an order with status &quot;processing&quot;.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
