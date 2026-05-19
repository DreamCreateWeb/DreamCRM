export const metadata = {
  title: 'Product - DreamCRM',
  description: 'Product details',
}

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireTenant } from '@/lib/auth/context'
import { getProductBySlug, listProducts } from '@/lib/services/products'
import { formatMoney } from '@/lib/utils'
import AddToCartButton from '../(shop)/add-to-cart-button'

export default async function Product({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string }>
}) {
  const ctx = await requireTenant()
  const params = await searchParams
  let product = params.slug ? await getProductBySlug(ctx.organizationId, params.slug) : undefined
  if (!product) {
    const all = await listProducts(ctx.organizationId, { limit: 1 })
    product = all[0]
  }

  if (!product) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-3xl mx-auto">
        <div className="mb-3">
          <Link className="text-sm font-medium text-violet-500 hover:text-violet-600 dark:hover:text-violet-400" href="/ecommerce/shop">
            &lt;- Back To Listing
          </Link>
        </div>
        <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold mb-2">No product found</h1>
        <p>Add some products to your catalog to see them here.</p>
      </div>
    )
  }

  const related = (await listProducts(ctx.organizationId, { limit: 4 })).filter((p) => p.id !== product!.id).slice(0, 3)

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full">
      <div className="max-w-5xl mx-auto flex flex-col lg:flex-row lg:space-x-8 xl:space-x-16">
        {/* Content */}
        <div className="grow">
          <div className="mb-3">
            <Link className="text-sm font-medium text-violet-500 hover:text-violet-600 dark:hover:text-violet-400" href="/ecommerce/shop">
              &lt;- Back To Listing
            </Link>
          </div>
          <header className="mb-4">
            <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold mb-2">{product.name}</h1>
            {product.description ? <p>{product.description}</p> : null}
          </header>

          <figure className="mb-6">
            {product.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="w-full rounded-xs h-[360px] object-cover" src={product.imageUrl} alt={product.name} />
            ) : (
              <div className="w-full h-[360px] rounded-xs bg-linear-to-tr from-violet-500/20 to-violet-500/5" />
            )}
          </figure>

          <div>
            <h2 className="text-xl leading-snug text-gray-800 dark:text-gray-100 font-bold mb-2">Overview</h2>
            <p className="mb-6">{product.description ?? 'No description provided.'}</p>
            <ul className="text-sm space-y-1 mb-6">
              <li>Category: <span className="font-medium text-gray-800 dark:text-gray-100">{product.category ?? 'General'}</span></li>
              <li>SKU: <span className="font-medium text-gray-800 dark:text-gray-100">{product.slug}</span></li>
              <li>Stock available: <span className="font-medium text-gray-800 dark:text-gray-100">{product.stock}</span></li>
            </ul>
          </div>

          {related.length > 0 && (
            <>
              <hr className="my-6 border-t border-gray-100 dark:border-gray-700/60" />
              <div>
                <h2 className="text-xl leading-snug text-gray-800 dark:text-gray-100 font-bold mb-2">Related Products</h2>
                <ul className="space-y-5 my-6">
                  {related.map((r) => (
                    <li key={r.id} className="sm:flex items-center">
                      <Link className="block mb-4 sm:mb-0 mr-5 md:w-32 xl:w-auto shrink-0" href={`/ecommerce/product?slug=${encodeURIComponent(r.slug)}`}>
                        {r.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img className="rounded-xs w-[200px] h-[142px] object-cover" src={r.imageUrl} alt={r.name} />
                        ) : (
                          <div className="rounded-xs w-[200px] h-[142px] bg-linear-to-tr from-violet-500/20 to-violet-500/5" />
                        )}
                      </Link>
                      <div className="grow">
                        <Link href={`/ecommerce/product?slug=${encodeURIComponent(r.slug)}`}>
                          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-1">{r.name}</h3>
                        </Link>
                        {r.description ? <div className="text-sm mb-2 line-clamp-2">{r.description}</div> : null}
                        <div className="inline-flex text-sm font-medium bg-green-500/20 text-green-700 rounded-full text-center px-2 py-0.5">
                          {formatMoney(r.priceCents, r.currency)}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>

        {/* Sidebar */}
        <div>
          <div className="bg-white dark:bg-gray-800 p-5 shadow-sm rounded-xl lg:w-[18rem] xl:w-[20rem]">
            <div className="text-2xl font-bold text-green-600 mb-1">{formatMoney(product.priceCents, product.currency)}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400 mb-4">{product.stock > 0 ? 'In stock' : 'Out of stock'}</div>
            <div className="mb-3">
              <AddToCartButton productId={product.id} />
            </div>
            <div className="mb-4">
              <Link href="/ecommerce/cart" className="btn w-full border border-gray-200 dark:border-gray-700/60 text-gray-800 dark:text-gray-100">
                Go to Cart
              </Link>
            </div>
            <div className="text-xs text-gray-500 italic text-center">14-day refund policy.</div>
          </div>
        </div>
      </div>
    </div>
  )
}
