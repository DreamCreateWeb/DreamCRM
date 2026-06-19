'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { formatMoney, relativeTime } from '@/lib/utils'
import {
  cancelSubscription,
  changePlan,
  toggleCancelAtPeriodEnd,
} from './admin-actions'
import type { AdminSubscription, AdminProduct } from '@/lib/services/stripe-admin'
import { type Tone } from '@/lib/ui/encodings'
import { StatusPill } from '@/components/ui/status-pill'
import { FilterChip } from '@/components/ui/filter-chip'
import { ActionButton } from '@/components/ui/action-button'
import { EmptyState } from '@/components/ui/empty-state'
import { useConfirm } from '@/components/ui/confirm-dialog'

interface Props {
  subscriptions: AdminSubscription[]
  products: AdminProduct[]
}

// Stripe status → semantic tone (the design-system contract).
const STATUS_TONE: Record<string, Tone> = {
  active: 'ok',
  trialing: 'info',
  past_due: 'urgent',
  unpaid: 'urgent',
  incomplete_expired: 'urgent',
  canceled: 'neutral',
  incomplete: 'neutral',
  paused: 'neutral',
}

type StatusFilter = 'all' | 'active' | 'trialing' | 'past_due' | 'canceled'

const STATUS_FILTERS: { id: StatusFilter; label: string; match: (s: AdminSubscription) => boolean }[] = [
  { id: 'all', label: 'All', match: () => true },
  { id: 'active', label: 'Active', match: (s) => s.status === 'active' },
  { id: 'trialing', label: 'Trialing', match: (s) => s.status === 'trialing' },
  { id: 'past_due', label: 'Past due', match: (s) => s.status === 'past_due' || s.status === 'unpaid' },
  { id: 'canceled', label: 'Canceled', match: (s) => s.status === 'canceled' || s.status === 'incomplete_expired' },
]

export default function SubscriptionsPanel({ subscriptions, products }: Props) {
  const recurringPriceOptions = useMemo(
    () =>
      products.flatMap((p) =>
        p.prices
          .filter((pr) => pr.active && pr.interval)
          .map((pr) => ({
            id: pr.id,
            label: `${p.name} — ${pr.interval === 'year' ? 'Annual' : 'Monthly'} (${formatMoney(pr.unitAmountCents ?? 0, pr.currency.toUpperCase())})`,
          })),
      ),
    [products],
  )

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [productFilter, setProductFilter] = useState<string>('all')
  const [search, setSearch] = useState('')

  const productOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const s of subscriptions) {
      if (s.productId && s.productName) seen.set(s.productId, s.productName)
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }))
  }, [subscriptions])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    const matcher = STATUS_FILTERS.find((f) => f.id === statusFilter)!.match
    return subscriptions.filter((s) => {
      if (!matcher(s)) return false
      if (productFilter !== 'all' && s.productId !== productFilter) return false
      if (term) {
        const haystack = [s.clinicName, s.customerName, s.customerEmail, s.id]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(term)) return false
      }
      return true
    })
  }, [subscriptions, statusFilter, productFilter, search])

  const counts = useMemo(() => {
    const out: Record<StatusFilter, number> = {
      all: subscriptions.length,
      active: 0,
      trialing: 0,
      past_due: 0,
      canceled: 0,
    }
    for (const s of subscriptions) {
      for (const f of STATUS_FILTERS) {
        if (f.id === 'all') continue
        if (f.match(s)) out[f.id]++
      }
    }
    return out
  }, [subscriptions])

  return (
    <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl">
      <header className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/60">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">
            Subscriptions{' '}
            <span className="text-gray-500 dark:text-gray-400 font-medium tabular-nums">
              {filtered.length} of {subscriptions.length}
            </span>
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search clinic, email, or sub ID…"
              aria-label="Search subscriptions"
              className="form-input text-sm py-1.5 w-56"
            />
            {productOptions.length > 0 && (
              <select
                aria-label="Filter by plan"
                value={productFilter}
                onChange={(e) => setProductFilter(e.target.value)}
                className="form-select text-sm py-1.5"
              >
                <option value="all">All plans</option>
                {productOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {STATUS_FILTERS.map((f) => (
            <FilterChip
              key={f.id}
              active={statusFilter === f.id}
              onClick={() => setStatusFilter(f.id)}
              count={counts[f.id]}
            >
              {f.label}
            </FilterChip>
          ))}
        </div>
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
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-0 py-0">
                  {subscriptions.length === 0 ? (
                    <EmptyState
                      icon="💳"
                      title="No subscriptions yet"
                      body="Once a clinic completes Stripe Checkout, it'll show up here."
                    />
                  ) : (
                    <EmptyState
                      title="No subscriptions match these filters"
                      body="Try a different status, plan, or search term."
                    />
                  )}
                </td>
              </tr>
            ) : (
              filtered.map((s) => (
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
  const confirm = useConfirm()

  async function handleCancelNow() {
    if (
      !(await confirm({
        title: `Cancel ${sub.customerName ?? sub.customerEmail ?? sub.id} immediately?`,
        message: 'This cannot be undone.',
        confirmLabel: 'Cancel subscription',
        danger: true,
      }))
    )
      return
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

  const displayName = sub.clinicName ?? sub.customerName ?? '—'

  return (
    <tr className={pending ? 'opacity-60' : ''}>
      <td className="px-5 py-3">
        {sub.clinicOrgId ? (
          <Link
            href={`/ecommerce/customers/${sub.clinicOrgId}`}
            className="font-medium text-gray-800 dark:text-gray-100 hover:text-violet-600 dark:hover:text-violet-400"
          >
            {displayName}
          </Link>
        ) : (
          <div className="font-medium text-gray-800 dark:text-gray-100">{displayName}</div>
        )}
        <div className="text-xs text-gray-500 dark:text-gray-400">{sub.customerEmail ?? '—'}</div>
        <div className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-0.5">{sub.id}</div>
        {error && <div className="text-xs text-rose-700 dark:text-rose-300 mt-1">{error}</div>}
      </td>
      <td className="px-2 py-3">
        <div className="font-medium">
          {sub.productName ?? '—'}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
          {sub.unitAmountCents != null
            ? `${formatMoney(sub.unitAmountCents, (sub.currency ?? 'USD').toUpperCase())} / ${sub.interval ?? 'mo'}`
            : '—'}
        </div>
      </td>
      <td className="px-2 py-3">
        <StatusPill tone={STATUS_TONE[sub.status] ?? 'neutral'} label={sub.status.replace('_', ' ')} />
        {sub.cancelAtPeriodEnd && (
          <div className="text-xs text-amber-700 dark:text-amber-300 mt-1">cancels at period end</div>
        )}
      </td>
      <td className="px-2 py-3 text-sm text-gray-600 dark:text-gray-400">{renewsLabel}</td>
      <td className="px-2 py-3 pr-5">
        <div className="flex flex-col items-end gap-1.5">
          {sub.status !== 'canceled' && (
            <>
              <select
                value={sub.priceId ?? ''}
                disabled={pending || priceOptions.length === 0}
                onChange={(e) => handleChangePlan(e.target.value)}
                className="form-select text-xs py-1 pr-7 pl-2 max-w-[14rem]"
                title="Change plan"
                aria-label="Change plan"
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
              <div className="flex gap-1.5">
                <ActionButton
                  variant="secondary"
                  size="sm"
                  onClick={handleToggleCancelAtPeriodEnd}
                  disabled={pending}
                >
                  {sub.cancelAtPeriodEnd ? 'Keep' : 'Cancel at period end'}
                </ActionButton>
                <ActionButton
                  variant="danger"
                  size="sm"
                  onClick={handleCancelNow}
                  disabled={pending}
                >
                  Cancel now
                </ActionButton>
              </div>
            </>
          )}
        </div>
      </td>
    </tr>
  )
}
