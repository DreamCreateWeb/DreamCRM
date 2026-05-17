import Link from 'next/link'
import { listCart, type CartLine } from '@/lib/services/cart'
import { requireUser } from '@/lib/session'
import { formatMoney } from '@/lib/utils'
import RemoveCartItemButton from './remove-cart-item-button'

export default async function CartItems() {
  const user = await requireUser()
  const lines: CartLine[] = await listCart(user.id)

  if (lines.length === 0) {
    return (
      <div>
        <div className="text-sm text-gray-500 dark:text-gray-400 px-4 py-10 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700/60 text-center">
          Your cart is empty.
        </div>
        <div className="mt-6">
          <Link className="text-sm font-medium text-violet-500 hover:text-violet-600 dark:hover:text-violet-400" href="/ecommerce/shop">
            &lt;- Back To Shopping
          </Link>
        </div>
      </div>
    )
  }

  return (
    <>
      <ul>
        {lines.map((line) => (
          <li key={line.productId} className="sm:flex items-center py-6 border-b border-gray-200 dark:border-gray-700/60">
            <Link className="block mb-4 sm:mb-0 mr-5 md:w-32 xl:w-auto shrink-0" href={`/ecommerce/product?slug=${encodeURIComponent(line.slug)}`}>
              {line.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="rounded-xs w-[200px] h-[142px] object-cover" src={line.imageUrl} width={200} height={142} alt={line.name} />
              ) : (
                <div className="rounded-xs w-[200px] h-[142px] bg-linear-to-tr from-violet-500/20 to-violet-500/5" />
              )}
            </Link>
            <div className="grow">
              <Link href={`/ecommerce/product?slug=${encodeURIComponent(line.slug)}`}>
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-1">{line.name}</h3>
              </Link>
              <div className="text-sm mb-2">Qty: {line.quantity}</div>
              <div className="flex flex-wrap justify-between items-center">
                <div>
                  <div className="inline-flex text-sm font-medium bg-green-500/20 text-green-700 rounded-full text-center px-2 py-0.5">
                    {formatMoney(line.priceCents * line.quantity, line.currency)}
                  </div>
                </div>
                <RemoveCartItemButton productId={line.productId} />
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-6">
        <Link className="text-sm font-medium text-violet-500 hover:text-violet-600 dark:hover:text-violet-400" href="/ecommerce/shop">
          &lt;- Back To Shopping
        </Link>
      </div>
    </>
  )
}
