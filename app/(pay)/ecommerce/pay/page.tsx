export const metadata = {
  title: 'Pay - DreamCRM',
  description: 'Complete your order',
}

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import PayForm from './pay-form'
import Logo from '@/components/ui/logo'
import { requireUser } from '@/lib/session'
import { cartTotal } from '@/lib/services/cart'

export default async function Pay({
  searchParams,
}: {
  searchParams: Promise<{ amount?: string; orderId?: string; currency?: string }>
}) {
  const user = await requireUser()
  const params = await searchParams

  let totalCents = 0
  let currency = params.currency || 'USD'
  const orderId = params.orderId ? parseInt(params.orderId, 10) : undefined

  if (params.amount) {
    totalCents = Math.round(parseFloat(params.amount) * 100)
  } else {
    const { subtotalCents, lines } = await cartTotal(user.id)
    const taxes = Math.round(subtotalCents * 0.1)
    totalCents = subtotalCents + taxes
    if (lines[0]?.currency) currency = lines[0].currency
  }

  return (
    <>
      <header className="bg-white dark:bg-gray-900">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 lg:border-b border-gray-200 dark:border-gray-700/60">
            <Logo />
            <Link className="block rounded-full text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" href="/ecommerce/cart">
              <span className="sr-only">Back</span>
              <svg width="32" height="32" viewBox="0 0 32 32">
                <path className="fill-current" d="M15.95 14.536l4.242-4.243a1 1 0 111.415 1.414l-4.243 4.243 4.243 4.242a1 1 0 11-1.415 1.415l-4.242-4.243-4.243 4.243a1 1 0 01-1.414-1.415l4.243-4.242-4.243-4.243a1 1 0 011.414-1.414l4.243 4.243z" />
              </svg>
            </Link>
          </div>
        </div>
      </header>

      <PayForm totalCents={totalCents} currency={currency} orderId={orderId} />
    </>
  )
}
