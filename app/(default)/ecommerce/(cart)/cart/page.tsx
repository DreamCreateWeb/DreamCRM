export const metadata = {
  title: 'Cart - DreamCRM',
  description: 'Your shopping cart',
}

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import CartItems from '../cart-items'
import CheckoutButton from '../checkout-button'
import { requireTenant } from '@/lib/auth/context'
import { cartTotal } from '@/lib/services/cart'
import { formatMoney } from '@/lib/utils'

export default async function Cart() {
  const ctx = await requireTenant()
  // The clinic's commerce surface is /shop — this generic Mosaic cart isn't
  // in their nav. (Mirrors the /calendar clinic redirect.)
  if (ctx.tenantType === 'clinic') redirect('/shop')
  const { subtotalCents, itemCount, lines } = await cartTotal(ctx.userId, ctx.organizationId)
  const currency = lines[0]?.currency ?? 'USD'
  const taxes = Math.round(subtotalCents * 0.1)
  const total = subtotalCents + taxes

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full">
      <div className="max-w-5xl mx-auto flex flex-col lg:flex-row lg:space-x-8 xl:space-x-16">
        <div className="mb-6 lg:mb-0 grow">
          <div className="mb-3">
            <div className="flex text-sm font-medium text-gray-400 dark:text-gray-500 space-x-2">
              <span className="text-violet-500">Review</span>
              <span>-&gt;</span>
              <span className="text-gray-500 dark:text-gray-400">Payment</span>
              <span>-&gt;</span>
              <span className="text-gray-500 dark:text-gray-400">Confirm</span>
            </div>
          </div>
          <header className="mb-2">
            <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">Shopping Cart ({itemCount})</h1>
          </header>

          <CartItems />
        </div>

        <div>
          <div className="v2-card p-5 lg:w-[18rem] xl:w-[20rem]">
            <div className="text-gray-800 dark:text-gray-100 font-semibold mb-2">Order Summary</div>
            <ul className="mb-4">
              <li className="text-sm w-full flex justify-between py-3 border-b border-gray-200 dark:border-gray-700/60">
                <div>Products & Subscriptions</div>
                <div className="font-medium text-gray-800 dark:text-gray-100">{formatMoney(subtotalCents, currency)}</div>
              </li>
              <li className="text-sm w-full flex justify-between py-3 border-b border-gray-200 dark:border-gray-700/60">
                <div>Shipping</div>
                <div className="font-medium text-gray-800 dark:text-gray-100">-</div>
              </li>
              <li className="text-sm w-full flex justify-between py-3 border-b border-gray-200 dark:border-gray-700/60">
                <div>Taxes (10%)</div>
                <div className="font-medium text-gray-800 dark:text-gray-100">{formatMoney(taxes, currency)}</div>
              </li>
              <li className="text-sm w-full flex justify-between py-3 border-b border-gray-200 dark:border-gray-700/60">
                <div>Total due (including taxes)</div>
                <div className="font-medium text-green-600">{formatMoney(total, currency)}</div>
              </li>
            </ul>
            <div className="mb-4">
              <CheckoutButton totalCents={total} currency={currency} />
            </div>
            <div className="text-xs text-gray-500 italic text-center">By checking out you agree to our Terms.</div>
          </div>
        </div>
      </div>
    </div>
  )
}
