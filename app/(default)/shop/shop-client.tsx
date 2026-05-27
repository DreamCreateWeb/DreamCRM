'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  CATEGORY_LABELS,
  priceRangeLabel,
  formatCents,
  type ProductRow,
  type ProductStatus,
  type ShopConfigView,
  type ShopStats,
} from '@/lib/types/shop'
import { setProductStatusAction, deleteProductAction, updateShopConfigAction, disconnectStripeAction } from './actions'

interface OrderStatsView {
  paidCount: number
  unfulfilledCount: number
  revenueCents: number
}

const STATUS_STYLE: Record<ProductStatus, string> = {
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  draft: 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300',
  archived: 'bg-stone-200 text-stone-500 dark:bg-stone-700 dark:text-stone-400',
}

interface Props {
  config: ShopConfigView
  products: ProductRow[]
  stats: ShopStats
  orderStats: OrderStatsView
  publicBase: string | null
  connectConfigured: boolean
  connectBanner: string | null
}

export default function ShopClient({ config, products, stats, orderStats, publicBase, connectConfigured, connectBanner }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function run(fn: () => Promise<unknown>) {
    startTransition(async () => {
      await fn()
      router.refresh()
    })
  }

  const connectReady = config.stripeAccountStatus === 'active' && config.chargesEnabled

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-600 dark:text-violet-400 mb-2">Commerce</p>
          <h1 className="text-2xl md:text-3xl font-bold text-stone-900 dark:text-stone-100 tracking-tight">Shop</h1>
          <p className="text-[13px] text-stone-500 dark:text-stone-400 mt-1 max-w-2xl">
            Sell whitening kits, brushes, and branded products on your own site. Payouts land in your bank — full margin
            to the practice.
          </p>
        </div>
        <Link
          href="/shop/products/new"
          className="inline-flex items-center px-4 py-2 rounded-lg text-[13px] font-semibold bg-stone-900 text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900"
        >
          + New product
        </Link>
      </div>

      {connectBanner === 'connected' && (
        <div className="mb-4 text-[13px] px-4 py-2.5 rounded-lg bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
          Stripe connected — payouts will go to your bank account.
        </div>
      )}
      {connectBanner?.startsWith('error:') && (
        <div className="mb-4 text-[13px] px-4 py-2.5 rounded-lg bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
          Couldn&apos;t connect Stripe: {connectBanner.slice(6)}
        </div>
      )}

      {config.storefrontEnabled ? (
        <div className="mb-6 text-[13px] px-4 py-2.5 rounded-lg bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300 flex items-center justify-between gap-3">
          <span>Your storefront is live{publicBase ? '.' : '.'}</span>
          {publicBase && (
            <a href={publicBase} target="_blank" rel="noopener" className="font-semibold underline shrink-0">View storefront →</a>
          )}
        </div>
      ) : (
        <div className="mb-6 text-[13px] px-4 py-2.5 rounded-lg bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          Your storefront is off — turn on “Publish storefront” below once you’ve added products and connected Stripe.
        </div>
      )}

      {/* Stripe Connect status */}
      <div className="mb-6 rounded-xl border border-stone-200 dark:border-stone-700/60 bg-white dark:bg-stone-900 p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-stone-800 dark:text-stone-100">Payments</h2>
            <p className="text-[12px] text-stone-500 dark:text-stone-400 mt-0.5 max-w-xl">
              {!connectConfigured
                ? 'Card payments are being finalized at the platform level. Your “Connect Stripe” button appears here once it’s ready — then payouts go straight to your bank.'
                : connectReady
                  ? 'Connected. Payouts go straight to your bank account; you keep full margin.'
                  : 'Connect your Stripe account to start accepting payments. Payouts land in your bank, not ours.'}
            </p>
          </div>
          <span
            className={`text-[11px] font-semibold uppercase tracking-wide px-2 py-1 rounded ${
              connectReady
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
            }`}
          >
            {connectReady ? 'Connected' : 'Not connected'}
          </span>
        </div>
        {connectConfigured && !connectReady && (
          <a
            href="/api/connect/shop/start"
            className="inline-flex items-center mt-3 px-4 py-2 rounded-lg text-[13px] font-semibold bg-stone-900 text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900"
          >
            {config.stripeAccountStatus === 'pending' ? 'Finish Stripe setup' : 'Connect Stripe'}
          </a>
        )}
        {connectReady && (
          <div className="flex items-center gap-3 mt-3">
            <a href="https://dashboard.stripe.com" target="_blank" rel="noopener" className="text-[12px] font-medium text-violet-600 dark:text-violet-400 hover:underline">
              Manage payouts in Stripe →
            </a>
            <button disabled={isPending} onClick={() => { if (confirm('Disconnect Stripe? You won’t be able to take payments until you reconnect.')) run(() => disconnectStripeAction()) }} className="text-[12px] text-stone-400 hover:text-rose-600 dark:text-stone-500 dark:hover:text-rose-400">
              Disconnect
            </button>
          </div>
        )}
      </div>

      {/* Stats + fulfillment config */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-4 mb-6">
        <div>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Products" value={stats.productCount} />
            <Stat label="Live" value={stats.activeCount} tone={stats.activeCount > 0 ? 'ok' : undefined} />
            <Stat label="Paid orders" value={orderStats.paidCount} />
            <Stat label="Revenue" value={formatCents(orderStats.revenueCents)} tone={orderStats.revenueCents > 0 ? 'ok' : undefined} />
          </div>
          <Link href="/shop/orders" className="inline-block mt-2 text-[12px] font-medium text-violet-600 dark:text-violet-400 hover:underline">
            View orders{orderStats.unfulfilledCount > 0 ? ` · ${orderStats.unfulfilledCount} to fulfill` : ''} →
          </Link>
        </div>
        <div className="rounded-xl border border-stone-200 dark:border-stone-700/60 bg-white dark:bg-stone-900 p-4">
          <p className="text-[11px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400 mb-2">Fulfillment &amp; storefront</p>
          <div className="flex flex-wrap gap-2">
            <Toggle label="In-office pickup" on={config.pickupEnabled} disabled={isPending} onClick={() => run(() => updateShopConfigAction({ pickupEnabled: !config.pickupEnabled }))} />
            <Toggle label="Ship to patient" on={config.shippingEnabled} disabled={isPending} onClick={() => run(() => updateShopConfigAction({ shippingEnabled: !config.shippingEnabled }))} />
            <Toggle label="Collect sales tax" on={config.taxEnabled} disabled={isPending} onClick={() => run(() => updateShopConfigAction({ taxEnabled: !config.taxEnabled }))} />
            <Toggle label="Publish storefront" on={config.storefrontEnabled} disabled={isPending} onClick={() => run(() => updateShopConfigAction({ storefrontEnabled: !config.storefrontEnabled }))} />
          </div>
        </div>
      </div>

      {/* Product list */}
      <div className="space-y-2.5">
        {products.length === 0 ? (
          <div className="bg-white dark:bg-stone-900 rounded-xl border border-dashed border-stone-300 dark:border-stone-700 p-8 text-center text-[13px] text-stone-400 dark:text-stone-500">
            No products yet. Click &ldquo;New product&rdquo; to add your first.
          </div>
        ) : (
          products.map((p) => (
            <div key={p.id} className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 p-4 flex items-center gap-4">
              <div className="w-14 h-14 rounded-lg bg-stone-100 dark:bg-stone-800 overflow-hidden shrink-0 flex items-center justify-center">
                {p.images[0] ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={p.images[0]} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-stone-300 dark:text-stone-600 text-xs">No image</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-stone-900 dark:text-stone-100 truncate">{p.name}</span>
                  <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${STATUS_STYLE[p.status]}`}>{p.status}</span>
                  {p.fsaEligible && <span className="text-[10px] text-sky-600 dark:text-sky-400">FSA (Rx)</span>}
                </div>
                <p className="text-[12px] text-stone-500 dark:text-stone-400 mt-0.5">
                  {CATEGORY_LABELS[p.category]} · {priceRangeLabel(p)} · {p.variants.length} variant{p.variants.length === 1 ? '' : 's'}
                  {p.totalInventory != null && ` · ${p.totalInventory} in stock`}
                </p>
              </div>
              <div className="flex items-center gap-1.5 text-[12px] shrink-0">
                <Link href={`/shop/products/${p.id}`} className="px-2 py-1 rounded text-stone-600 hover:text-violet-600 dark:text-stone-300">Edit</Link>
                {p.status === 'active' ? (
                  <button disabled={isPending} onClick={() => run(() => setProductStatusAction(p.id, 'archived'))} className="px-2 py-1 rounded text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800">Unpublish</button>
                ) : (
                  <button disabled={isPending} onClick={() => run(() => setProductStatusAction(p.id, 'active'))} className="px-2 py-1 rounded font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10">Publish</button>
                )}
                <button disabled={isPending} onClick={() => { if (confirm(`Delete "${p.name}"?`)) run(() => deleteProductAction(p.id)) }} className="px-2 py-1 rounded text-stone-400 hover:text-rose-600 dark:hover:text-rose-400">Delete</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' }) {
  return (
    <div className="px-3 py-2.5 rounded-lg bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700/60">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400">{label}</p>
      <p className={`text-2xl font-bold tabular-nums mt-0.5 ${tone === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-stone-900 dark:text-stone-100'}`}>{value}</p>
    </div>
  )
}

function Toggle({ label, on, disabled, onClick }: { label: string; on: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`text-[12px] px-3 py-1.5 rounded-full border transition ${
        on
          ? 'bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/40 dark:text-emerald-300'
          : 'border-stone-200 text-stone-500 dark:border-stone-700 dark:text-stone-400'
      }`}
    >
      {on ? '✓ ' : ''}
      {label}
    </button>
  )
}
