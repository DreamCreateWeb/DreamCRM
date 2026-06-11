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
import { PageHeader } from '@/components/ui/page-header'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import { EncodingLegend } from '@/components/ui/encoding-legend'
import { EmptyState } from '@/components/ui/empty-state'
import { KpiStat } from '@/components/ui/kpi-stat'
import { FlashToast } from '@/components/ui/flash-toast'
import type { PillLegendRow, Tone } from '@/lib/ui/encodings'

interface OrderStatsView {
  paidCount: number
  unfulfilledCount: number
  revenueCents: number
}

// Product lifecycle → tone contract. draft + archived are inert (neutral); an
// active product is live and selling (ok).
const PRODUCT_STATUS_TONE: Record<ProductStatus, Tone> = {
  active: 'ok',
  draft: 'neutral',
  archived: 'neutral',
}
const PRODUCT_STATUS_LABEL: Record<ProductStatus, string> = {
  active: 'Live',
  draft: 'Draft',
  archived: 'Archived',
}

const PRODUCT_PILL_LEGEND: PillLegendRow[] = [
  { tone: 'ok', label: 'Live', meaning: 'Published and buyable on your storefront' },
  { tone: 'neutral', label: 'Draft', meaning: 'Not yet published — only you can see it' },
  { tone: 'neutral', label: 'Archived', meaning: 'Hidden from the storefront' },
]

interface Props {
  config: ShopConfigView
  products: ProductRow[]
  stats: ShopStats
  orderStats: OrderStatsView
  membershipStats: { activeMembers: number; mrrCents: number }
  publicBase: string | null
  connectConfigured: boolean
  connectBanner: string | null
  orgName?: string
}

export default function ShopClient({
  config,
  products,
  stats,
  orderStats,
  membershipStats,
  publicBase,
  connectConfigured,
  connectBanner,
  orgName = 'Your clinic',
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [toast, setToast] = useState<string | null>(null)

  function run(fn: () => Promise<unknown>, done?: string) {
    startTransition(async () => {
      await fn()
      if (done) setToast(done)
      router.refresh()
    })
  }

  const connectReady = config.stripeAccountStatus === 'active' && config.chargesEnabled

  // The primary action is "Add product" once payments are wired; before that the
  // setup action (connect Stripe) IS the work, so it leads the header.
  const primaryAction =
    connectConfigured && !connectReady ? (
      <ActionButton variant="primary" breath size="sm" href="/api/connect/shop/start">
        {config.stripeAccountStatus === 'pending' ? 'Finish Stripe setup' : 'Connect Stripe'}
      </ActionButton>
    ) : (
      <ActionButton variant="primary" breath size="sm" href="/shop/products/new">
        + Add product
      </ActionButton>
    )

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <PageHeader
        eyebrow={`Business · ${orgName}`}
        title="Shop"
        subtitle="Sell whitening kits, brushes, and branded products on your own site. Payouts land in your bank — full margin to the practice."
        legend={<EncodingLegend pills={PRODUCT_PILL_LEGEND} />}
        actions={primaryAction}
      />

      {connectBanner === 'connected' && (
        <div className="mb-4 text-sm px-4 py-2.5 rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
          Stripe connected — payouts will go to your bank account.
        </div>
      )}
      {connectBanner?.startsWith('error:') && (
        <div className="mb-4 text-sm px-4 py-2.5 rounded-lg bg-rose-500/15 text-rose-700 dark:text-rose-300">
          Couldn&apos;t connect Stripe: {connectBanner.slice(6)}
        </div>
      )}

      {config.storefrontEnabled ? (
        <div className="mb-6 text-sm px-4 py-2.5 rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 flex items-center justify-between gap-3">
          <span>Your storefront is live.</span>
          {publicBase && (
            <a href={publicBase} target="_blank" rel="noopener noreferrer" className="font-semibold underline shrink-0">
              View storefront →
            </a>
          )}
        </div>
      ) : (
        <div className="mb-6 text-sm px-4 py-2.5 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300">
          Your storefront is off — turn on &ldquo;Publish storefront&rdquo; below once you&apos;ve added products and
          connected Stripe.
        </div>
      )}

      {/* Stripe Connect status — etched panel (status hero) */}
      <div className="v2-panel mb-6 p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Payments</h2>
              <StatusPill
                tone={connectReady ? 'ok' : 'warn'}
                label={connectReady ? 'Connected' : 'Not connected'}
                title={
                  connectReady
                    ? 'Stripe is connected — payouts go to your bank'
                    : 'Connect Stripe to start taking payments'
                }
              />
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-xl">
              {!connectConfigured
                ? 'Card payments are being finalized at the platform level. Your "Connect Stripe" button appears here once it\'s ready — then payouts go straight to your bank.'
                : connectReady
                  ? 'Connected. Payouts go straight to your bank account; you keep full margin.'
                  : 'Connect your Stripe account to start accepting payments. Payouts land in your bank, not ours.'}
            </p>
          </div>
        </div>
        {connectConfigured && !connectReady && (
          <ActionButton variant="primary" size="sm" href="/api/connect/shop/start" className="mt-3">
            {config.stripeAccountStatus === 'pending' ? 'Finish Stripe setup' : 'Connect Stripe'}
          </ActionButton>
        )}
        {connectReady && (
          <div className="flex items-center gap-3 mt-3">
            <a
              href="https://dashboard.stripe.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-teal-700 dark:text-teal-400 hover:underline"
            >
              Manage payouts in Stripe →
            </a>
            <ActionButton
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={() => {
                if (confirm('Disconnect Stripe? You won’t be able to take payments until you reconnect.'))
                  run(() => disconnectStripeAction(), 'Stripe disconnected.')
              }}
            >
              Disconnect
            </ActionButton>
          </div>
        )}
      </div>

      {/* Stats + fulfillment config */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-4 mb-6">
        <div>
          <div className="grid grid-cols-2 gap-3">
            <KpiStat label="Products" value={stats.productCount} />
            <KpiStat
              label="Live"
              value={stats.activeCount}
              tone={stats.activeCount > 0 ? 'ok' : undefined}
              sub={stats.activeCount > 0 ? 'On your storefront' : undefined}
            />
            <KpiStat label="Paid orders" value={orderStats.paidCount} href="/shop/orders" />
            <KpiStat
              label="Revenue"
              value={formatCents(orderStats.revenueCents)}
              tone={orderStats.revenueCents > 0 ? 'ok' : undefined}
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            <Link href="/shop/orders" className="text-sm font-medium text-teal-700 dark:text-teal-400 hover:underline">
              View orders
              {orderStats.unfulfilledCount > 0 ? ` · ${orderStats.unfulfilledCount} to fulfill` : ''} →
            </Link>
            <Link
              href="/shop/memberships"
              className="text-sm font-medium text-teal-700 dark:text-teal-400 hover:underline"
            >
              Membership plans
              {membershipStats.activeMembers > 0
                ? ` · ${membershipStats.activeMembers} active (${formatCents(membershipStats.mrrCents)}/mo)`
                : ''}{' '}
              →
            </Link>
            <Link
              href="/shop/coupons"
              className="text-sm font-medium text-teal-700 dark:text-teal-400 hover:underline"
            >
              Coupons &amp; birthday codes →
            </Link>
          </div>
        </div>
        <div className="v2-card p-4">
          <p className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 mb-2">
            Fulfillment &amp; storefront
          </p>
          <div className="flex flex-wrap gap-2">
            <Toggle
              label="In-office pickup"
              on={config.pickupEnabled}
              disabled={isPending}
              onClick={() => run(() => updateShopConfigAction({ pickupEnabled: !config.pickupEnabled }))}
            />
            <Toggle
              label="Ship to patient"
              on={config.shippingEnabled}
              disabled={isPending}
              onClick={() => run(() => updateShopConfigAction({ shippingEnabled: !config.shippingEnabled }))}
            />
            <Toggle
              label="Collect sales tax"
              on={config.taxEnabled}
              disabled={isPending}
              onClick={() => run(() => updateShopConfigAction({ taxEnabled: !config.taxEnabled }))}
            />
            <Toggle
              label="Publish storefront"
              on={config.storefrontEnabled}
              disabled={isPending}
              onClick={() =>
                run(
                  () => updateShopConfigAction({ storefrontEnabled: !config.storefrontEnabled }),
                  config.storefrontEnabled ? 'Storefront hidden.' : 'Storefront published.',
                )
              }
            />
          </div>
        </div>
      </div>

      {/* Product list */}
      <div className="space-y-2.5">
        {products.length === 0 ? (
          <EmptyState
            icon="🛍️"
            title="No products yet"
            body="Add your first product — a whitening kit, an electric brush, or branded merch — and it goes live on your storefront."
            action={
              <ActionButton variant="primary" size="sm" href="/shop/products/new">
                + Add product
              </ActionButton>
            }
          />
        ) : (
          products.map((p) => (
            <div
              key={p.id}
              className="v2-card p-4 flex items-center gap-4"
            >
              <div className="w-14 h-14 rounded-lg bg-gray-100 dark:bg-gray-700 overflow-hidden shrink-0 flex items-center justify-center">
                {p.images[0] ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={p.images[0]} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-gray-500 dark:text-gray-400 text-xs">No image</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{p.name}</span>
                  <StatusPill tone={PRODUCT_STATUS_TONE[p.status]} label={PRODUCT_STATUS_LABEL[p.status]} />
                  {p.fsaEligible && <span className="text-xs text-indigo-700 dark:text-indigo-300">FSA (Rx)</span>}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 tabular-nums">
                  {CATEGORY_LABELS[p.category]} ·{' '}
                  <span className="font-mono-num">{priceRangeLabel(p)}</span> · {p.variants.length} variant
                  {p.variants.length === 1 ? '' : 's'}
                  {p.totalInventory != null && ` · ${p.totalInventory} in stock`}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <ActionButton variant="ghost" size="sm" href={`/shop/products/${p.id}`}>
                  Edit
                </ActionButton>
                {p.status === 'active' ? (
                  <ActionButton
                    variant="secondary"
                    size="sm"
                    disabled={isPending}
                    onClick={() => run(() => setProductStatusAction(p.id, 'archived'), `${p.name} unpublished.`)}
                  >
                    Unpublish
                  </ActionButton>
                ) : (
                  <ActionButton
                    variant="secondary"
                    size="sm"
                    disabled={isPending}
                    onClick={() => run(() => setProductStatusAction(p.id, 'active'), `${p.name} is live.`)}
                  >
                    Publish
                  </ActionButton>
                )}
                <ActionButton
                  variant="danger"
                  size="sm"
                  disabled={isPending}
                  onClick={() => {
                    if (confirm(`Delete "${p.name}"?`)) run(() => deleteProductAction(p.id), `${p.name} deleted.`)
                  }}
                >
                  Delete
                </ActionButton>
              </div>
            </div>
          ))
        )}
      </div>

      {toast && <FlashToast message={toast} onDone={() => setToast(null)} />}
    </div>
  )
}

function Toggle({ label, on, disabled, onClick }: { label: string; on: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={on}
      className={`text-xs px-3 py-1.5 rounded-full border transition disabled:opacity-60 ${
        on
          ? 'bg-emerald-500/15 border-emerald-300 text-emerald-700 dark:border-emerald-500/40 dark:text-emerald-300'
          : 'border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-300'
      }`}
    >
      {on ? '✓ ' : ''}
      {label}
    </button>
  )
}
