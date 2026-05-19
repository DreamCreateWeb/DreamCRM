export const metadata = {
  title: 'Cart 3 - DreamCRM',
  description: 'Order confirmation',
}

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireTenant } from '@/lib/auth/context'
import { listOrders } from '@/lib/services/orders'
import { formatMoney, formatShortDate } from '@/lib/utils'

export default async function Cart3() {
  const ctx = await requireTenant()
  const orders = await listOrders(ctx.organizationId)
  const lastOrder = orders[0]

  return (
    <div className="lg:relative lg:flex">
      <div className="px-4 sm:px-6 lg:px-8 py-8 lg:grow lg:pr-8 xl:pr-16 2xl:ml-[80px]">
        <div className="lg:max-w-[640px] lg:mx-auto">
          <div className="mb-6 lg:mb-0">
            <div className="mb-3">
              <div className="flex text-sm font-medium text-gray-400 dark:text-gray-500 space-x-2">
                <span className="text-gray-500 dark:text-gray-400">Review</span>
                <span>-&gt;</span>
                <span className="text-gray-500 dark:text-gray-400">Payment</span>
                <span>-&gt;</span>
                <span className="text-violet-500">Confirm</span>
              </div>
            </div>
            <header className="mb-6">
              <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold mb-2">Thank you for your order</h1>
              {lastOrder ? (
                <p>
                  Your order <span className="font-semibold">{lastOrder.orderNumber}</span> was placed on{' '}
                  {formatShortDate(lastOrder.createdAt)}. You will receive a confirmation email soon.
                </p>
              ) : (
                <p>You don&apos;t have any orders yet.</p>
              )}
            </header>
            <div className="bg-gray-50 dark:bg-gray-800/30 rounded-sm border border-gray-200 dark:border-gray-700/60 p-4">
              <div className="text-center md:text-left md:flex md:items-center md:justify-between space-y-2 md:space-y-0 md:space-x-2">
                <div className="text-sm">
                  Enjoy a <span className="font-medium text-gray-800 dark:text-gray-100">20% OFF</span> discount on your next order
                </div>
                <Link href="/ecommerce/shop" className="text-sm font-medium text-violet-500 hover:text-violet-600">
                  Continue shopping -&gt;
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className="lg:sticky lg:top-16 bg-linear-to-r from-white/30 dark:from-gray-800/30 lg:overflow-x-hidden lg:overflow-y-auto no-scrollbar lg:shrink-0 border-t lg:border-t-0 lg:border-l border-gray-200 dark:border-gray-700/60 lg:w-[320px] xl:w-[352px] 2xl:w-[calc(352px+80px)] lg:h-[calc(100dvh-64px)]">
          <div className="py-8 px-4 lg:px-8 2xl:px-12">
            <div className="max-w-sm mx-auto lg:max-w-none">
              <h2 className="text-2xl text-gray-800 dark:text-gray-100 font-bold mb-6">Order Summary</h2>
              {lastOrder ? (
                <div className="space-y-6">
                  <div>
                    <div className="text-gray-800 dark:text-gray-100 font-semibold mb-2">Order Details</div>
                    <ul>
                      {Array.isArray(lastOrder.items) &&
                        (lastOrder.items as Array<{ name: string; quantity: number; priceCents: number }>).map((it, i) => (
                          <li key={i} className="flex items-center py-3 border-b border-gray-200 dark:border-gray-700/60">
                            <div className="grow">
                              <h4 className="text-sm font-medium text-gray-800 dark:text-gray-100 leading-tight">{it.name}</h4>
                              <div className="text-xs text-gray-500 dark:text-gray-400">Qty {it.quantity}</div>
                            </div>
                            <div className="text-sm font-medium text-gray-800 dark:text-gray-100 ml-2">
                              {formatMoney(it.priceCents * it.quantity, lastOrder.currency)}
                            </div>
                          </li>
                        ))}
                    </ul>
                    <ul>
                      <li className="flex items-center justify-between py-3 border-b border-gray-200 dark:border-gray-700/60">
                        <div className="text-sm">Total</div>
                        <div className="text-sm font-medium text-green-600 ml-2">{formatMoney(lastOrder.totalCents, lastOrder.currency)}</div>
                      </li>
                      <li className="flex items-center justify-between py-3 border-b border-gray-200 dark:border-gray-700/60">
                        <div className="text-sm">Status</div>
                        <div className="text-sm font-medium text-gray-800 dark:text-gray-100 ml-2 capitalize">{lastOrder.status}</div>
                      </li>
                    </ul>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-gray-500 dark:text-gray-400">No orders to show.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
