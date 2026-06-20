'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  CATEGORY_LABELS,
  priceRangeLabel,
  formatCents,
  lowStockProducts,
  type ProductRow,
  type ProductStatus,
  type ShopConfigView,
  type ShopStats,
  type TopProduct,
} from '@/lib/types/shop'
import { setProductStatusAction, deleteProductAction, updateShopConfigAction, disconnectStripeAction } from './actions'
import { PageHeader } from '@/components/ui/page-header'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import { EncodingLegend } from '@/components/ui/encoding-legend'
import { EmptyState } from '@/components/ui/empty-state'
import { KpiStat } from '@/components/ui/kpi-stat'
import { FlashToast } from '@/components/ui/flash-toast'
import { NavIcon } from '@/components/ui/nav-icons'
import { TONE_TEXT, type PillLegendRow, type Tone } from '@/lib/ui/encodings'
import { useConfirm } from '@/components/ui/confirm-dialog'

interface OrderStatsView {
  paidCount: number
  unfulfilledCount: number
  fulfilledCount: number
  revenueCents: number
  last30Cents: number
  last30Count: number
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
  topProducts: TopProduct[]
  membershipStats: { activeMembers: number; mrrCents: number }
  couponStats: { activeCount: number }
  paymentStats: { count: number }
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
  topProducts,
  membershipStats,
  couponStats,
  paymentStats,
  publicBase,
  connectConfigured,
  connectBanner,
  orgName = 'Your clinic',
}: Props) {
  const router = useRouter()
  const confirm = useConfirm()
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

  // Doorways into each shop area. Each is a real destination, not a footnote —
  // an icon, a live stat in mono numerals, a one-line description, hover-lift.
  const sections: SectionCardProps[] = [
    {
      href: '/shop/orders',
      icon: 'bag',
      title: 'Orders',
      stat:
        orderStats.unfulfilledCount > 0
          ? `${orderStats.unfulfilledCount} to fulfill`
          : `${orderStats.paidCount} paid`,
      statTone: orderStats.unfulfilledCount > 0 ? 'warn' : undefined,
      description:
        orderStats.unfulfilledCount > 0
          ? 'Pack and hand off what patients bought.'
          : 'Track and fulfill product orders.',
    },
    {
      href: '/shop/memberships',
      icon: 'star',
      title: 'Memberships',
      stat:
        membershipStats.activeMembers > 0
          ? `${membershipStats.activeMembers} active · ${formatCents(membershipStats.mrrCents)}/mo`
          : 'No members yet',
      statTone: membershipStats.activeMembers > 0 ? 'ok' : undefined,
      description: 'In-house dental plans with recurring billing.',
    },
    {
      href: '/shop/coupons',
      icon: 'receipt',
      title: 'Coupons',
      stat:
        couponStats.activeCount > 0
          ? `${couponStats.activeCount} active ${couponStats.activeCount === 1 ? 'code' : 'codes'}`
          : 'No active codes',
      description: 'Promo and birthday codes for your storefront.',
    },
    {
      href: '/shop/payments',
      icon: 'wallet',
      title: 'Payments',
      stat: connectReady
        ? paymentStats.count > 0
          ? `${paymentStats.count} to reconcile`
          : 'Connected'
        : 'Not connected',
      statTone: connectReady ? (paymentStats.count > 0 ? 'warn' : 'ok') : 'warn',
      description: connectReady
        ? 'Online balance payments to post to your PMS.'
        : 'Connect Stripe to take online payments.',
    },
  ]

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

      {/* Stripe Connect status — a clean status panel, shown only while it's
          actionable (setting up or freshly connected). Once steady it folds
          into the Payments section card, keeping the hub uncluttered. The
          teal primary CTA leads when not connected; a calm "Connected" state
          replaces it once payouts are flowing. */}
      {connectConfigured && !connectReady && (
        <div className="v2-panel mb-6 p-5">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Payments</h2>
            <StatusPill tone="warn" label="Not connected" title="Connect Stripe to start taking payments" />
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-xl">
            Connect your Stripe account to start accepting payments. Payouts land in your bank, not ours.
          </p>
          <ActionButton variant="primary" size="sm" href="/api/connect/shop/start" className="mt-3">
            {config.stripeAccountStatus === 'pending' ? 'Finish Stripe setup' : 'Connect Stripe'}
          </ActionButton>
        </div>
      )}
      {!connectConfigured && (
        <div className="v2-panel mb-6 p-5">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Payments</h2>
            <StatusPill
              tone="neutral"
              label="Setup pending"
              title="Card payments are being finalized at the platform level"
            />
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-xl">
            Card payments are being finalized at the platform level. Your &ldquo;Connect Stripe&rdquo; button appears
            here once it&apos;s ready — then payouts go straight to your bank.
          </p>
        </div>
      )}
      {connectReady && (
        <div className="v2-panel mb-6 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Payments</h2>
                <StatusPill tone="ok" label="Connected" title="Stripe is connected — payouts go to your bank" />
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-xl">
                Payouts go straight to your bank account; you keep full margin.
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
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
                onClick={async () => {
                  if (
                    await confirm({
                      title: 'Disconnect Stripe?',
                      message: 'You won’t be able to take payments until you reconnect.',
                      confirmLabel: 'Disconnect',
                      danger: true,
                    })
                  )
                    run(() => disconnectStripeAction(), 'Stripe disconnected.')
                }}
              >
                Disconnect
              </ActionButton>
            </div>
          </div>
        </div>
      )}

      <LowStockPanel products={products} />

      {/* Sales overview — the hub used to be analytically hollow (doorway cards
          only). Lead with the money: real revenue / orders / fulfillment / MRR
          (all drillable) + best sellers. Hidden for a brand-new shop with no
          sales yet, so nobody stares at a $0 band during setup. */}
      {(orderStats.paidCount > 0 || membershipStats.activeMembers > 0) && (
        <section className="mb-8">
          <p className="mb-3 text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">
            Sales
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiStat
              label="Revenue · 30 days"
              value={formatCents(orderStats.last30Cents)}
              href="/shop/orders?status=paid"
              sub={`${formatCents(orderStats.revenueCents)} all time`}
            />
            <KpiStat
              label="Paid orders"
              value={orderStats.paidCount}
              href="/shop/orders?status=paid"
              sub={orderStats.last30Count > 0 ? `${orderStats.last30Count} in 30 days` : 'all time'}
            />
            <KpiStat
              label="To fulfill"
              value={orderStats.unfulfilledCount}
              tone={orderStats.unfulfilledCount > 0 ? 'warn' : undefined}
              href="/shop/orders?status=paid"
              sub={
                orderStats.paidCount > 0
                  ? `${Math.round((orderStats.fulfilledCount / orderStats.paidCount) * 100)}% fulfilled`
                  : undefined
              }
            />
            <KpiStat
              label="Recurring"
              value={`${formatCents(membershipStats.mrrCents)}/mo`}
              tone={membershipStats.activeMembers > 0 ? 'ok' : undefined}
              sub={`${membershipStats.activeMembers} member${membershipStats.activeMembers === 1 ? '' : 's'}`}
            />
          </div>
          {topProducts.length > 0 && (
            <div className="v2-card p-4 mt-3">
              <p className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 mb-2">
                Best sellers
              </p>
              <ul className="divide-y divide-[color:var(--color-hairline)]">
                {topProducts.map((p, i) => (
                  <li
                    key={p.productName}
                    className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-xs font-mono-num tabular-nums text-gray-400 dark:text-gray-500 w-4 shrink-0">
                        {i + 1}
                      </span>
                      <span className="text-sm text-gray-800 dark:text-gray-100 truncate">{p.productName}</span>
                    </div>
                    <div className="flex items-center gap-4 shrink-0 tabular-nums">
                      <span className="text-xs text-gray-500 dark:text-gray-400">{p.unitsSold} sold</span>
                      <span className="w-20 text-right text-sm font-medium font-mono-num text-gray-800 dark:text-gray-100">
                        {formatCents(p.revenueCents)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* Section navigation — the front desk's doorways into each shop area.
          Prominent etched, drillable cards (NOT tiny text links). */}
      <p className="mb-3 text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">
        Manage your shop
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {sections.map((s) => (
          <SectionCard key={s.href} {...s} />
        ))}
      </div>

      {/* Catalog stats + storefront config */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-4 mb-6">
        <div className="grid grid-cols-2 gap-3">
          <KpiStat label="Products" value={stats.productCount} />
          <KpiStat
            label="Live"
            value={stats.activeCount}
            tone={stats.activeCount > 0 ? 'ok' : undefined}
            sub={stats.activeCount > 0 ? 'On your storefront' : undefined}
          />
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

      {/* Product catalog — the main working list */}
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <p className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">
          Product catalog
        </p>
        {products.length > 0 && (
          <ActionButton variant="ghost" size="sm" href="/shop/products/new">
            + Add product
          </ActionButton>
        )}
      </div>
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
                  onClick={async () => {
                    if (await confirm({ title: `Delete “${p.name}”?`, confirmLabel: 'Delete', danger: true }))
                      run(() => deleteProductAction(p.id), `${p.name} deleted.`)
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

interface SectionCardProps {
  href: string
  icon: string
  title: string
  /** Live stat line, rendered in mono numerals. */
  stat: string
  /** Tone for the stat (warn when it needs our action; ok when healthy). */
  statTone?: Tone
  description: string
}

/**
 * A doorway into a shop area. Etched, drillable card (hover-lift via
 * `.v2-card-interactive`); the whole card is the link. Icon + title + a live
 * mono-numeral stat + a one-line description — a deliberate destination, not a
 * footnote link.
 */
function SectionCard({ href, icon, title, stat, statTone, description }: SectionCardProps) {
  return (
    <Link href={href} className="block h-full group">
      <div className="v2-card-interactive p-4 h-full flex flex-col">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center justify-center w-9 h-9 rounded-[var(--r-sm)] bg-teal-500/10 text-teal-700 dark:text-teal-300">
            <NavIcon name={icon} className="shrink-0 fill-current w-5 h-5" />
          </span>
          <span
            className="text-gray-400 dark:text-gray-500 group-hover:text-teal-700 dark:group-hover:text-teal-300 transition-colors"
            aria-hidden
          >
            →
          </span>
        </div>
        <div className="mt-3 text-sm font-semibold text-gray-800 dark:text-gray-100">{title}</div>
        <div
          className={`mt-0.5 text-sm font-medium tabular-nums font-mono-num ${
            statTone ? TONE_TEXT[statTone] : 'text-gray-600 dark:text-gray-300'
          }`}
        >
          {stat}
        </div>
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400 leading-snug">{description}</p>
      </div>
    </Link>
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

/**
 * Restock nudge — active products that are out of / low on stock, derived from
 * the already-loaded catalog (lowStockProducts). Hidden when everything's
 * stocked or untracked. Each row links to the product editor to restock.
 */
function LowStockPanel({ products }: { products: ProductRow[] }) {
  const rows = lowStockProducts(products)
  if (rows.length === 0) return null
  const outCount = rows.filter((r) => r.state === 'out').length
  return (
    <div className="v2-panel mb-6 p-4 ring-1 ring-inset ring-amber-500/30 bg-amber-500/[0.04]">
      <p className="mb-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
        📦 Restock soon — {rows.length} {rows.length === 1 ? 'product needs' : 'products need'} attention
        {outCount > 0 && (
          <span className="text-rose-600 dark:text-rose-400"> · {outCount} out of stock</span>
        )}
      </p>
      <ul className="divide-y divide-[color:var(--color-hairline)]">
        {rows.slice(0, 8).map(({ product, state, lowestQty }) => (
          <li key={product.id} className="py-1.5 flex items-center justify-between gap-3">
            <Link
              href={`/shop/products/${product.id}`}
              className="text-sm text-gray-700 dark:text-gray-200 hover:underline truncate"
            >
              {product.name}
            </Link>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                state === 'out'
                  ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300'
                  : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
              }`}
            >
              {state === 'out' ? 'Out of stock' : `Low · ${lowestQty} left`}
            </span>
          </li>
        ))}
      </ul>
      {rows.length > 8 && (
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">…and {rows.length - 8} more</p>
      )}
    </div>
  )
}
