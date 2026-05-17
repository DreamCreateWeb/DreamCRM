'use client'

import { useState, useTransition } from 'react'
import { formatMoney, relativeTime } from '@/lib/utils'
import {
  cancelSubscription,
  changePlan,
  toggleCancelAtPeriodEnd,
} from './admin-actions'
import type { AdminSubscription, AdminProduct } from '@/lib/services/stripe-admin'

interface Props {
  subscriptions: AdminSubscription[]
  products: AdminProduct[]
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-500/20 text-green-700',
  trialing: 'bg-blue-500/20 text-blue-700',
  past_due: 'bg-yellow-500/20 text-yellow-700',
  unpaid: 'bg-yellow-500/20 text-yellow-700',
  canceled: 'bg-gray-200 dark:bg-gray-700 text-gray-500',
  incomplete: 'bg-gray-100 dark:bg-gray-700 text-gray-500',
  incomplete_expired: 'bg-red-500/20 text-red-700',
  paused: 'bg-gray-300 dark:bg-gray-600 text-gray-700',
}

export default function SubscriptionsPanel({ subscriptions, products }: Props) {
  // Flatten products → recurring prices for the change-plan picker.
  const recurringPriceOptions = products.flatMap((p) =>
    p.prices
      .filter((pr) => pr.active && pr.interval)
      .map((pr) => ({
        id: pr.id,
        label: `${p.name} — ${pr.interval === 'year' ? 'Annual' : 'Monthly'} (${formatMoney(pr.unitAmountCents ?? 0, pr.currency.toUpperCase())})`,
      }))
  )

  return (
    <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl">
      <header className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/60 flex items-center justify-between">
        <h2 className="font-semibold text-gray-800 dark:text-gray-100">
          Active subscriptions{' '}
          <span className="text-gray-400 dark:text-gray-500 font-medium">{subscriptions.length}</span>
        </h2>
      </header>
      <div className="overflow-x-auto">
        <table className="table-auto w-full dark:text-gray-300">
          <thead className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20">
            <tr>
              <th className="px-5 py-3 text-left">Customer</th>
              <th className="px-2 py-3 text-left">Plan</th>
              <th className="px-2 py-3 text-left">Status</th>
              <th className="px-2 py-3 text-left">Renews</th>
              <th className="px-2 py-3 text-right pr-5">Actions</th>
            </tr>
          </thead>
          <tbody className="text-sm divide-y divide-gray-100 dark:divide-gray-700/60">
            {subscriptions.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                  No subscriptions yet. Once a clinic completes Stripe Checkout, it&apos;ll show up here.
                </td>
              </tr>
            ) : (
              subscriptions.map((s) => (
                <SubscriptionRow
                  key={s.id}
                  sub={s}
                  priceOptions={recurringPriceOptions}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SubscriptionRow({
  sub,
  priceOptions,
}: {
  sub: AdminSubscription
  priceOptions: { id: string; label: string }[]
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleCancelNow() {
    if (!confirm(`Cancel ${sub.customerName ?? sub.customerEmail ?? sub.id} immediately? This cannot be undone.`)) return
    setError(null)
    startTransition(async () => {
      try {
        await cancelSubscription(sub.id)
      } catch (err) {
        setError((err as Error).message)
      }
    })
  }

  function handleToggleCancelAtPeriodEnd() {
    setError(null)
    startTransition(async () => {
      try {
        await toggleCancelAtPeriodEnd(sub.id, !sub.cancelAtPeriodEnd)
      } catch (err) {
        setError((err as Error).message)
      }
    })
  }

  function handleChangePlan(newPriceId: string) {
    if (!newPriceId || newPriceId === sub.priceId) return
    setError(null)
    startTransition(async () => {
      try {
        await changePlan(sub.id, newPriceId)
      } catch (err) {
        setError((err as Error).message)
      }
    })
  }

  const renewsLabel = sub.cancelAtPeriodEnd
    ? `Ends ${sub.currentPeriodEnd ? relativeTime(sub.currentPeriodEnd * 1000) : ''}`
    : sub.currentPeriodEnd
      ? `Renews ${relativeTime(sub.currentPeriodEnd * 1000)}`
      : '—'

  return (
    <tr className={pending ? 'opacity-60' : ''}>
      <td className="px-5 py-3">
        <div className="font-medium text-gray-800 dark:text-gray-100">
          {sub.clinicName ?? sub.customerName ?? '—'}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">{sub.customerEmail ?? '—'}</div>
        <div className="text-[10px] text-gray-400 font-mono mt-0.5">{sub.id}</div>
        {error && <div className="text-xs text-red-600 mt-1">{error}</div>}
      </td>
      <td className="px-2 py-3">
        <div className="font-medium">
          {sub.productName ?? '—'}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {sub.unitAmountCents != null
            ? `${formatMoney(sub.unitAmountCents, (sub.currency ?? 'USD').toUpperCase())} / ${sub.interval ?? 'mo'}`
            : '—'}
        </div>
      </td>
      <td className="px-2 py-3">
        <span
          className={`inline-flex font-medium rounded-full text-center px-2.5 py-0.5 ${
            STATUS_COLORS[sub.status] ?? STATUS_COLORS.canceled
          }`}
        >
          {sub.status.replace('_', ' ')}
        </span>
        {sub.cancelAtPeriodEnd && (
          <div className="text-[10px] text-yellow-600 mt-1">cancels at period end</div>
        )}
      </td>
      <td className="px-2 py-3 text-sm text-gray-600 dark:text-gray-400">{renewsLabel}</td>
      <td className="px-2 py-3 pr-5">
        <div className="flex flex-col items-end gap-1">
          {sub.status !== 'canceled' && (
            <>
              <select
                value={sub.priceId ?? ''}
                disabled={pending || priceOptions.length === 0}
                onChange={(e) => handleChangePlan(e.target.value)}
                className="form-select text-xs py-1 pr-7 pl-2 max-w-[14rem]"
                title="Change plan"
              >
                {priceOptions.find((p) => p.id === sub.priceId) === undefined && sub.priceId && (
                  <option value={sub.priceId}>
                    {sub.productName ?? 'Current'} ({sub.interval})
                  </option>
                )}
                {priceOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={handleToggleCancelAtPeriodEnd}
                  disabled={pending}
                  className="btn-xs border border-gray-200 dark:border-gray-700/60 text-gray-700 dark:text-gray-300 px-2 py-1 rounded disabled:opacity-60"
                >
                  {sub.cancelAtPeriodEnd ? 'Keep' : 'Cancel at period end'}
                </button>
                <button
                  type="button"
                  onClick={handleCancelNow}
                  disabled={pending}
                  className="btn-xs border border-red-200 dark:border-red-500/40 text-red-600 px-2 py-1 rounded disabled:opacity-60"
                >
                  Cancel now
                </button>
              </div>
            </>
          )}
        </div>
      </td>
    </tr>
  )
}
