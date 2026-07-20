'use client'

import Link from 'next/link'
import { useMemo, useOptimistic, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  formatCents,
  ORDER_STATUS_LABELS,
  FULFILLMENT_STATUS_LABELS,
  type OrderRow,
  type OrderStatus,
  type FulfillmentStatus,
} from '@/lib/types/shop'
import { setOrderFulfillmentAction } from '../actions'
import { PageHeader } from '@/components/ui/page-header'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import { FilterChip } from '@/components/ui/filter-chip'
import { EncodingLegend } from '@/components/ui/encoding-legend'
import { EmptyState } from '@/components/ui/empty-state'
import { FlashToast } from '@/components/ui/flash-toast'
import { useFocusTrap } from '@/components/ui/use-focus-trap'
import type { PillLegendRow, Tone } from '@/lib/ui/encodings'

// Payment status → tone. `pending` is the ball in Stripe's court (info, not
// warn — we don't act on it); `paid` is done-good; cancelled/refunded are
// terminal (neutral).
const ORDER_STATUS_TONE: Record<OrderStatus, Tone> = {
  paid: 'ok',
  pending: 'info',
  cancelled: 'neutral',
  refunded: 'neutral',
}

// Fulfillment status → tone, with ball-in-court applied: `unfulfilled` is OUR
// move (warn); `ready_for_pickup` + `shipped` are in flight / in the patient's
// court (info); `picked_up` + `delivered` are done (ok).
const FULFILLMENT_TONE: Record<FulfillmentStatus, Tone> = {
  unfulfilled: 'warn',
  ready_for_pickup: 'info',
  shipped: 'info',
  picked_up: 'ok',
  delivered: 'ok',
}

// Fulfillment transitions offered per current state (paid orders only).
const NEXT_STEPS: Record<FulfillmentStatus, FulfillmentStatus[]> = {
  unfulfilled: ['ready_for_pickup', 'shipped'],
  ready_for_pickup: ['picked_up'],
  shipped: ['delivered'],
  picked_up: [],
  delivered: [],
}

const PILL_LEGEND: PillLegendRow[] = [
  { tone: ORDER_STATUS_TONE.paid, label: 'Paid', meaning: 'Payment captured by Stripe' },
  { tone: ORDER_STATUS_TONE.pending, label: 'Pending payment', meaning: 'Waiting on Stripe to finish checkout' },
  { tone: FULFILLMENT_TONE.unfulfilled, label: 'Unfulfilled', meaning: 'Paid — your move to fulfill it' },
  { tone: FULFILLMENT_TONE.ready_for_pickup, label: 'Ready for pickup', meaning: 'Set aside — waiting on the patient' },
  { tone: FULFILLMENT_TONE.shipped, label: 'Shipped', meaning: 'On its way to the patient' },
  { tone: FULFILLMENT_TONE.delivered, label: 'Picked up / Delivered', meaning: 'Order complete' },
]

/** The status chips the orders page offers (a subset of OrderStatus + "all"). */
// 'unfulfilled' is a virtual view (paid AND not yet fulfilled) — the hub's
// "To fulfill" tile deep-links it (?fulfillment=unfulfilled).
export type OrdersFilter = OrderStatus | 'all' | 'unfulfilled'

// Stable empty base for the optimistic fulfillment map (useOptimistic resets to it).
const EMPTY_FULFILLMENT: Record<string, FulfillmentStatus> = {}

/** Render a stored shipping address (Stripe's snake_case keys) as display lines. */
function shippingAddressLines(a: Record<string, string>): string[] {
  const zip = a.postal_code ?? a.postalCode ?? ''
  const cityLine = [a.city, [a.state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  const country = a.country && a.country !== 'US' ? a.country : ''
  return [a.line1, a.line2, cityLine, country].filter((l): l is string => Boolean(l))
}

function fmtOrderDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function OrdersClient({
  orders,
  orgName = 'Your clinic',
  initialFilter = 'all',
  canExport = false,
}: {
  orders: OrderRow[]
  orgName?: string
  /** Pre-selected status chip (the Overview "Fulfill orders" card passes 'paid'). */
  initialFilter?: OrdersFilter
  /** Owner/admin: show the CSV export. */
  canExport?: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [filter, setFilter] = useState<OrdersFilter>(initialFilter)
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  // Fulfillment status flips instantly; the action + revalidation catch up.
  const [optimisticFulfillment, setOptimisticFulfillment] = useOptimistic<
    Record<string, FulfillmentStatus>,
    { id: string; status: FulfillmentStatus }
  >(EMPTY_FULFILLMENT, (current, { id, status }) => ({ ...current, [id]: status }))
  // Order detail drawer — surfaces the full breakdown (per-line pricing, cost
  // totals, shipping address, contact) that otherwise only lived in the CSV.
  const [selected, setSelected] = useState<OrderRow | null>(null)
  const drawerRef = useRef<HTMLDivElement>(null)
  useFocusTrap(selected !== null, drawerRef, { onEscape: () => setSelected(null) })
  // The live (optimistic-aware) fulfillment status the drawer should show.
  const selectedFulfillment = selected
    ? optimisticFulfillment[selected.id] ?? selected.fulfillmentStatus
    : null

  function run(fn: () => Promise<unknown>, done?: string) {
    startTransition(async () => {
      try {
        await fn()
        if (done) setToast(done)
        router.refresh()
      } catch (err) {
        // Surface the failure (and let the optimistic flip revert) instead of
        // swallowing it — otherwise the status snaps back with no explanation.
        setToast(err instanceof Error ? err.message : "Couldn't update the order — please try again.")
      }
    })
  }

  function changeFulfillment(o: OrderRow, next: FulfillmentStatus, label: string) {
    // Tracking prompt stays synchronous + up front (pre-existing); the optimistic
    // flip + action then run together in the transition.
    const tracking =
      next === 'shipped' ? window.prompt('Tracking number (optional):')?.trim() || undefined : undefined
    run(async () => {
      setOptimisticFulfillment({ id: o.id, status: next })
      await setOrderFulfillmentAction(o.id, next, tracking)
    }, `Marked ${label}.`)
  }

  // Search across patient name / order name / order email / product names.
  const filtered = useMemo(() => {
    const byStatus =
      filter === 'all'
        ? orders
        : filter === 'unfulfilled'
          ? orders.filter((o) => o.status === 'paid' && o.fulfillmentStatus === 'unfulfilled')
          : orders.filter((o) => o.status === filter)
    const q = search.trim().toLowerCase()
    if (!q) return byStatus
    return byStatus.filter((o) =>
      [o.patientName, o.name, o.email, ...o.items.map((i) => i.productName)]
        .some((v) => v?.toLowerCase().includes(q)),
    )
  }, [orders, filter, search])
  const counts = {
    all: orders.length,
    paid: orders.filter((o) => o.status === 'paid').length,
    unfulfilled: orders.filter((o) => o.status === 'paid' && o.fulfillmentStatus === 'unfulfilled').length,
    pending: orders.filter((o) => o.status === 'pending').length,
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[80rem] mx-auto">
      <PageHeader
        eyebrow={`Business · ${orgName}`}
        title="Orders"
        subtitle="Storefront orders and where each one is in fulfillment. Unfulfilled paid orders are waiting on you."
        legend={<EncodingLegend pills={PILL_LEGEND} />}
        actions={
          <div className="flex items-center gap-2">
            {canExport && (
              <ActionButton variant="ghost" size="sm" href="/shop/orders/export" target="_blank">
                Export CSV
              </ActionButton>
            )}
            <ActionButton variant="secondary" size="sm" href="/shop">
              ← Back to Shop
            </ActionButton>
          </div>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex flex-wrap gap-1.5">
          {(['all', 'paid', 'unfulfilled', 'pending'] as const).map((f) => (
            <FilterChip key={f} active={filter === f} count={counts[f]} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : f === 'unfulfilled' ? 'Unfulfilled' : ORDER_STATUS_LABELS[f]}
            </FilterChip>
          ))}
        </div>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search patient, email, or product…"
          aria-label="Search orders"
          className="form-input text-sm w-full sm:w-64"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon="📦"
          title={filter === 'all' ? 'No orders yet' : 'Nothing in this view'}
          body={
            filter === 'all'
              ? 'When a patient checks out on your storefront, the order lands here so you can fulfill it.'
              : 'No orders match this filter right now.'
          }
        />
      ) : (
        <div className="space-y-2.5">
          {filtered.map((o) => (
            <div
              key={o.id}
              className="v2-card p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-100">{o.name || o.email}</span>
                    <StatusPill tone={ORDER_STATUS_TONE[o.status]} label={ORDER_STATUS_LABELS[o.status]} />
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {o.fulfillmentType === 'pickup' ? 'Pickup' : 'Ship'}
                    </span>
                    {o.status === 'paid' && (
                      <StatusPill
                        tone={FULFILLMENT_TONE[(optimisticFulfillment[o.id] ?? o.fulfillmentStatus)]}
                        label={FULFILLMENT_STATUS_LABELS[(optimisticFulfillment[o.id] ?? o.fulfillmentStatus)]}
                        title={
                          (optimisticFulfillment[o.id] ?? o.fulfillmentStatus) === 'unfulfilled'
                            ? 'Your move — mark it ready or shipped'
                            : undefined
                        }
                      />
                    )}
                    {o.patientName &&
                      (o.patientId ? (
                        <Link
                          href={`/patients/${o.patientId}`}
                          className="text-xs text-teal-700 dark:text-teal-400 hover:underline"
                        >
                          · {o.patientName}
                        </Link>
                      ) : (
                        <span className="text-xs text-gray-600 dark:text-gray-300">· {o.patientName}</span>
                      ))}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {o.items
                      .map((i) => `${i.quantity}× ${i.productName}${i.variantName ? ` (${i.variantName})` : ''}`)
                      .join(', ')}
                  </p>
                  {o.trackingNumber && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Tracking: {o.trackingNumber}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold tabular-nums font-mono-num text-gray-800 dark:text-gray-100">
                    {formatCents(o.totalCents)}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 tabular-nums font-mono-num">
                    {o.ageHours < 24 ? `${o.ageHours}h ago` : `${Math.floor(o.ageHours / 24)}d ago`}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-[color:var(--color-hairline)]">
                <ActionButton variant="ghost" size="sm" onClick={() => setSelected(o)}>
                  Details
                </ActionButton>
                {o.status === 'paid' &&
                  NEXT_STEPS[(optimisticFulfillment[o.id] ?? o.fulfillmentStatus)].map((s, i) => {
                    // One primary per row — the most likely next move leads;
                    // the alternate (e.g. "Mark shipped" vs "Mark ready") is secondary.
                    const statusLabel = FULFILLMENT_STATUS_LABELS[s].toLowerCase()
                    return (
                      <ActionButton
                        key={s}
                        variant={i === 0 ? 'primary' : 'secondary'}
                        size="sm"
                        disabled={isPending}
                        onClick={() => changeFulfillment(o, s, statusLabel)}
                      >
                        Mark {statusLabel}
                      </ActionButton>
                    )
                  })}
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && selectedFulfillment && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30"
            onClick={() => setSelected(null)}
            aria-hidden="true"
          />
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label={`Order for ${selected.name || selected.email}`}
            className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto bg-surface-2 shadow-[var(--shadow-modal)]"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[color:var(--color-hairline)] bg-surface-2 px-5 py-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">
                  {selected.name || selected.email}
                </p>
                <p className="text-xs tabular-nums text-gray-500 dark:text-gray-400">
                  Placed {fmtOrderDate(selected.createdAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Close"
                className="shrink-0 rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700"
              >
                <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>
            </div>

            <div className="space-y-5 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone={ORDER_STATUS_TONE[selected.status]} label={ORDER_STATUS_LABELS[selected.status]} />
                {selected.status === 'paid' && (
                  <StatusPill tone={FULFILLMENT_TONE[selectedFulfillment]} label={FULFILLMENT_STATUS_LABELS[selectedFulfillment]} />
                )}
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {selected.fulfillmentType === 'pickup' ? 'In-office pickup' : 'Ship to patient'}
                </span>
              </div>

              <div className="space-y-1 text-sm">
                {selected.patientId ? (
                  <Link href={`/patients/${selected.patientId}`} className="font-medium text-teal-700 hover:underline dark:text-teal-400">
                    {selected.patientName ?? 'View patient'} →
                  </Link>
                ) : (
                  selected.patientName && <p className="font-medium text-gray-800 dark:text-gray-100">{selected.patientName}</p>
                )}
                <p className="text-gray-600 dark:text-gray-300">{selected.email}</p>
                {selected.phone && <p className="text-gray-600 dark:text-gray-300">{selected.phone}</p>}
              </div>

              {selected.fulfillmentType === 'ship' && selected.shippingAddress && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Ship to</p>
                  <address className="text-sm not-italic text-gray-700 dark:text-gray-200">
                    {shippingAddressLines(selected.shippingAddress).map((l, i) => (
                      <span key={i} className="block">{l}</span>
                    ))}
                  </address>
                </div>
              )}
              {selected.trackingNumber && (
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Tracking: <span className="font-mono-num">{selected.trackingNumber}</span>
                </p>
              )}

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Items</p>
                <ul className="divide-y divide-[color:var(--color-hairline)]">
                  {selected.items.map((it, i) => (
                    <li key={i} className="flex items-start justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm text-gray-800 dark:text-gray-100">
                          {it.productName}
                          {it.variantName ? ` · ${it.variantName}` : ''}
                        </p>
                        <p className="text-xs tabular-nums text-gray-500 dark:text-gray-400">
                          {formatCents(it.unitPriceCents)} × {it.quantity}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-medium tabular-nums font-mono-num text-gray-800 dark:text-gray-100">
                        {formatCents(it.unitPriceCents * it.quantity)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <dl className="space-y-1 border-t border-[color:var(--color-hairline)] pt-3 text-sm">
                <div className="flex justify-between text-gray-600 dark:text-gray-300">
                  <dt>Subtotal</dt>
                  <dd className="tabular-nums font-mono-num">{formatCents(selected.subtotalCents)}</dd>
                </div>
                {selected.shippingCents > 0 && (
                  <div className="flex justify-between text-gray-600 dark:text-gray-300">
                    <dt>Shipping</dt>
                    <dd className="tabular-nums font-mono-num">{formatCents(selected.shippingCents)}</dd>
                  </div>
                )}
                {selected.taxCents > 0 && (
                  <div className="flex justify-between text-gray-600 dark:text-gray-300">
                    <dt>Tax</dt>
                    <dd className="tabular-nums font-mono-num">{formatCents(selected.taxCents)}</dd>
                  </div>
                )}
                {selected.discountCents > 0 && (
                  <div className="flex justify-between text-emerald-700 dark:text-emerald-300">
                    <dt>Discount</dt>
                    <dd className="tabular-nums font-mono-num">−{formatCents(selected.discountCents)}</dd>
                  </div>
                )}
                <div className="flex justify-between border-t border-[color:var(--color-hairline)] pt-1.5 font-semibold text-gray-900 dark:text-gray-100">
                  <dt>Total</dt>
                  <dd className="tabular-nums font-mono-num">{formatCents(selected.totalCents)}</dd>
                </div>
                {selected.paidAt && (
                  <p className="pt-1 text-xs text-gray-500 dark:text-gray-400">Paid {fmtOrderDate(selected.paidAt)}</p>
                )}
              </dl>

              {selected.status === 'paid' && NEXT_STEPS[selectedFulfillment].length > 0 && (
                <div className="flex flex-wrap gap-1.5 border-t border-[color:var(--color-hairline)] pt-3">
                  {NEXT_STEPS[selectedFulfillment].map((s, i) => {
                    const statusLabel = FULFILLMENT_STATUS_LABELS[s].toLowerCase()
                    return (
                      <ActionButton
                        key={s}
                        variant={i === 0 ? 'primary' : 'secondary'}
                        size="sm"
                        disabled={isPending}
                        onClick={() => changeFulfillment(selected, s, statusLabel)}
                      >
                        Mark {statusLabel}
                      </ActionButton>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {toast && <FlashToast message={toast} onDone={() => setToast(null)} />}
    </div>
  )
}
