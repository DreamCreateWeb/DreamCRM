'use client'

import Link from 'next/link'
import { useMemo, useOptimistic, useState, useTransition } from 'react'
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
export type OrdersFilter = OrderStatus | 'all'

// Stable empty base for the optimistic fulfillment map (useOptimistic resets to it).
const EMPTY_FULFILLMENT: Record<string, FulfillmentStatus> = {}

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

  function run(fn: () => Promise<unknown>, done?: string) {
    startTransition(async () => {
      await fn()
      if (done) setToast(done)
      router.refresh()
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
    const byStatus = filter === 'all' ? orders : orders.filter((o) => o.status === filter)
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
          {(['all', 'paid', 'pending'] as const).map((f) => (
            <FilterChip key={f} active={filter === f} count={counts[f]} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : ORDER_STATUS_LABELS[f]}
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
              {o.status === 'paid' && NEXT_STEPS[(optimisticFulfillment[o.id] ?? o.fulfillmentStatus)].length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-[color:var(--color-hairline)]">
                  {NEXT_STEPS[(optimisticFulfillment[o.id] ?? o.fulfillmentStatus)].map((s, i) => {
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
              )}
            </div>
          ))}
        </div>
      )}

      {toast && <FlashToast message={toast} onDone={() => setToast(null)} />}
    </div>
  )
}
