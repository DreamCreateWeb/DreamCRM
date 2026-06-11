'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { formatMoney, formatShortDate } from '@/lib/utils'
import { openBillingPortal } from '../actions'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import { EmptyState } from '@/components/ui/empty-state'
import { PLANS, type BillingInterval, type PlanId } from '@/lib/stripe-config'
import { subscriptionStatusMeta } from '@/lib/billing-status'

interface OrgInvoice {
  id: string
  number: string | null
  amountPaidCents: number
  currency: string
  status: string | null
  createdAt: string
  hostedInvoiceUrl: string | null
}

interface Props {
  planTier: PlanId
  subscriptionStatus: string | null
  interval: BillingInterval | null
  renewsAt: string | null
  cancelAtPeriodEnd: boolean
  invoices: OrgInvoice[]
}

export default function BillingPanel({
  planTier,
  subscriptionStatus,
  interval,
  renewsAt,
  cancelAtPeriodEnd,
  invoices,
}: Props) {
  const [pending, startTransition] = useTransition()

  const plan = PLANS.find((p) => p.id === planTier)
  const status = subscriptionStatusMeta(subscriptionStatus)
  const price = plan ? (interval === 'annual' ? plan.annualPrice : plan.price) : null
  const priceLabel = price != null ? `$${price}/${interval === 'annual' ? 'yr' : 'mo'}` : null

  function handlePortal() {
    startTransition(async () => {
      try {
        await openBillingPortal()
      } catch {
        // openBillingPortal redirects on success; failure leaves the page as-is.
      }
    })
  }

  return (
    <div className="grow">
      <div className="p-6 space-y-8">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl text-gray-800 dark:text-gray-100 font-bold mb-2">Billing</h2>
            <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
              <span>
                You&apos;re on the{' '}
                <strong className="font-medium text-gray-800 dark:text-gray-100">{plan?.name ?? planTier}</strong> plan
                {priceLabel && <span className="tabular-nums"> · {priceLabel}</span>}.
              </span>
              {status.label && <StatusPill tone={status.tone} label={status.label} title={status.description} />}
            </div>
            {renewsAt && (
              <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {cancelAtPeriodEnd ? 'Access ends' : 'Renews'} on{' '}
                <strong className="font-medium text-gray-700 dark:text-gray-200">{formatShortDate(renewsAt)}</strong>.
              </div>
            )}
            {(status.severity === 'urgent' || status.severity === 'warn') && (
              <div className="mt-2 text-sm text-rose-700 dark:text-rose-300">
                {status.description} Update your card to keep your features.
              </div>
            )}
          </div>
          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            <ActionButton variant="primary" size="sm" onClick={handlePortal} disabled={pending}>
              {pending ? 'Opening…' : 'Manage billing in Stripe →'}
            </ActionButton>
            <Link href="/settings/plans" className="text-xs text-teal-600 dark:text-teal-400 hover:underline text-center sm:text-right">
              Change plan
            </Link>
          </div>
        </header>

        <p className="text-sm text-gray-500 dark:text-gray-400 -mt-4">
          Update your card, download receipts, or cancel anytime in the secure Stripe billing portal.
        </p>

        <section>
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-3">Recent invoices</h3>
          {invoices.length === 0 ? (
            <EmptyState
              title="No invoices yet"
              body="Once your first payment clears, your receipts appear here. Your full history always lives in the Stripe portal."
              action={
                <ActionButton variant="secondary" size="sm" onClick={handlePortal} disabled={pending}>
                  Open billing portal →
                </ActionButton>
              }
            />
          ) : (
            <table className="table-auto w-full dark:text-gray-400">
              <thead className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="py-2 text-left">Date</th>
                  <th className="py-2 text-left">Invoice</th>
                  <th className="py-2 text-left">Status</th>
                  <th className="py-2 text-left">Amount</th>
                  <th className="py-2 text-right">Receipt</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {invoices.map((inv) => {
                  const paid = inv.status === 'paid'
                  return (
                    <tr key={inv.id} className="border-b border-gray-200 dark:border-gray-700/60">
                      <td className="py-2 font-medium text-gray-800 dark:text-gray-100 tabular-nums whitespace-nowrap">
                        {formatShortDate(inv.createdAt)}
                      </td>
                      <td className="py-2">{inv.number ?? '—'}</td>
                      <td className="py-2">
                        <StatusPill
                          tone={paid ? 'ok' : inv.status === 'open' ? 'warn' : 'neutral'}
                          label={inv.status ? inv.status.replace(/_/g, ' ') : 'unknown'}
                        />
                      </td>
                      <td className="py-2 font-medium tabular-nums">{formatMoney(inv.amountPaidCents, inv.currency)}</td>
                      <td className="py-2 text-right">
                        {inv.hostedInvoiceUrl ? (
                          <a
                            href={inv.hostedInvoiceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-teal-600 dark:text-teal-400 hover:underline"
                          >
                            View →
                          </a>
                        ) : (
                          <span className="text-gray-400 dark:text-gray-500">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  )
}
