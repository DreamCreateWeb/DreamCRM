import Link from 'next/link'
import type { Product } from '@/lib/db/schema'
import { formatMoney } from '@/lib/utils'
import AddToCartButton from './add-to-cart-button'

export default function ProductList({ products }: { products: Product[] }) {
  if (!products.length) {
    return (
      <div className="col-span-full bg-white dark:bg-gray-800 shadow-sm rounded-xl px-5 py-10 text-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No products yet. Add some via the catalog admin.
        </p>
      </div>
    )
  }

  return (
    <>
      {products.map((p) => (
        <div
          key={p.id}
          className="col-span-full sm:col-span-6 xl:col-span-3 bg-white dark:bg-gray-800 shadow-sm rounded-xl overflow-hidden"
        >
          <div className="flex flex-col h-full">
            {p.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="w-full h-40 object-cover" src={p.imageUrl} alt={p.name} />
            ) : (
              <div className="w-full h-40 bg-linear-to-tr from-violet-500/20 to-violet-500/5" />
            )}
            <div className="grow flex flex-col p-5">
              <div className="grow">
                <header className="mb-3">
                  <Link href={`/ecommerce/product?slug=${encodeURIComponent(p.slug)}`}>
                    <h3 className="text-lg text-gray-800 dark:text-gray-100 font-semibold hover:underline">{p.name}</h3>
                  </Link>
                </header>
                <div className="flex flex-wrap justify-between items-center mb-4">
                  <div className="text-xs text-gray-500 dark:text-gray-400">{p.category ?? 'General'}</div>
                  <div>
                    <div className="inline-flex text-sm font-medium bg-green-500/20 text-green-700 rounded-full text-center px-2 py-0.5">
                      {formatMoney(p.priceCents, p.currency)}
                    </div>
                  </div>
                </div>
                {p.description ? (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-5 line-clamp-3">{p.description}</p>
                ) : null}
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                  Stock: {p.stock}
                </div>
              </div>
              <div>
                <AddToCartButton productId={p.id} />
              </div>
            </div>
          </div>
        </div>
      ))}
    </>
  )
}
