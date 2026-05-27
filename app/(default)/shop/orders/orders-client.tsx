'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  formatCents,
  ORDER_STATUS_LABELS,
  FULFILLMENT_STATUS_LABELS,
  type OrderRow,
  type OrderStatus,
  type FulfillmentStatus,
} from '@/lib/types/shop'
import { setOrderFulfillmentAction } from '../actions'

const ORDER_STATUS_STYLE: Record<OrderStatus, string> = {
  paid: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  cancelled: 'bg-stone-200 text-stone-500 dark:bg-stone-700 dark:text-stone-400',
  refunded: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
}

// Fulfillment transitions offered per current state (paid orders only).
const NEXT_STEPS: Record<FulfillmentStatus, FulfillmentStatus[]> = {
  unfulfilled: ['ready_for_pickup', 'shipped'],
  ready_for_pickup: ['picked_up'],
  shipped: ['delivered'],
  picked_up: [],
  delivered: [],
}

export default function OrdersClient({ orders }: { orders: OrderRow[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [filter, setFilter] = useState<OrderStatus | 'all'>('all')

  function run(fn: () => Promise<unknown>) {
    startTransition(async () => {
      await fn()
      router.refresh()
    })
  }

  const filtered = filter === 'all' ? orders : orders.filter((o) => o.status === filter)
  const counts = {
    all: orders.length,
    paid: orders.filter((o) => o.status === 'paid').length,
    pending: orders.filter((o) => o.status === 'pending').length,
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[80rem] mx-auto">
      <div className="mb-6">
        <Link href="/shop" className="text-[12px] text-stone-500 dark:text-stone-400 hover:underline">← Back to Shop</Link>
        <h1 className="text-2xl md:text-3xl font-bold text-stone-900 dark:text-stone-100 tracking-tight mt-1">Orders</h1>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {(['all', 'paid', 'pending'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-[12px] px-2.5 py-1 rounded-full border ${
              filter === f
                ? 'bg-stone-900 text-white border-stone-900 dark:bg-stone-100 dark:text-stone-900 dark:border-stone-100'
                : 'border-stone-200 text-stone-600 dark:border-stone-700 dark:text-stone-300'
            }`}
          >
            {f === 'all' ? 'All' : ORDER_STATUS_LABELS[f]} <span className="opacity-60">{counts[f]}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white dark:bg-stone-900 rounded-xl border border-dashed border-stone-300 dark:border-stone-700 p-8 text-center text-[13px] text-stone-400 dark:text-stone-500">
          No orders yet.
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((o) => (
            <div key={o.id} className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-stone-900 dark:text-stone-100">{o.name || o.email}</span>
                    <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${ORDER_STATUS_STYLE[o.status]}`}>{ORDER_STATUS_LABELS[o.status]}</span>
                    <span className="text-[11px] text-stone-500 dark:text-stone-400">
                      {o.fulfillmentType === 'pickup' ? 'Pickup' : 'Ship'} · {FULFILLMENT_STATUS_LABELS[o.fulfillmentStatus]}
                    </span>
                    {o.patientName && <span className="text-[11px] text-violet-600 dark:text-violet-400">· {o.patientName}</span>}
                  </div>
                  <p className="text-[12px] text-stone-500 dark:text-stone-400 mt-0.5">
                    {o.items.map((i) => `${i.quantity}× ${i.productName}${i.variantName ? ` (${i.variantName})` : ''}`).join(', ')}
                  </p>
                  {o.trackingNumber && <p className="text-[12px] text-stone-500 dark:text-stone-400 mt-0.5">Tracking: {o.trackingNumber}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold tabular-nums text-stone-900 dark:text-stone-100">{formatCents(o.totalCents)}</p>
                  <p className="text-[11px] text-stone-400">{o.ageHours < 24 ? `${o.ageHours}h ago` : `${Math.floor(o.ageHours / 24)}d ago`}</p>
                </div>
              </div>
              {o.status === 'paid' && NEXT_STEPS[o.fulfillmentStatus].length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-stone-100 dark:border-stone-700/40">
                  {NEXT_STEPS[o.fulfillmentStatus].map((s) => (
                    <button
                      key={s}
                      disabled={isPending}
                      onClick={() => run(() => setOrderFulfillmentAction(o.id, s))}
                      className="text-[12px] px-2.5 py-1 rounded-lg border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-800"
                    >
                      Mark {FULFILLMENT_STATUS_LABELS[s].toLowerCase()}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
