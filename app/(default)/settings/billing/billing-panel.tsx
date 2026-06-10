'use client'

import { useState, useTransition } from 'react'
import { formatMoney, formatShortDate } from '@/lib/utils'
import { openBillingPortal, saveBilling } from '../actions'
import { ActionButton } from '@/components/ui/action-button'

interface BillingInitial {
  plan: 'free' | 'pro' | 'team' | 'enterprise'
  cardLast4: string | null
  cardBrand: string | null
  cardExpMonth: number | null
  cardExpYear: number | null
  billingEmail: string | null
  billingAddress: string | null
  renewsAt: string | null
  hasStripeCustomer: boolean
}

interface PastInvoice {
  id: number
  year: number
  invoiceNumber: string
  totalCents: number
  currency: string
}

const PLAN_PRICES: Record<BillingInitial['plan'], number> = {
  free: 0,
  pro: 1900,
  team: 4900,
  enterprise: 19900,
}

export default function BillingPanel({
  initial,
  pastInvoices,
}: {
  initial: BillingInitial
  pastInvoices: PastInvoice[]
}) {
  const [billingEmail, setBillingEmail] = useState(initial.billingEmail ?? '')
  const [billingAddress, setBillingAddress] = useState(initial.billingAddress ?? '')
  const [cardBrand, setCardBrand] = useState(initial.cardBrand ?? '')
  const [cardLast4, setCardLast4] = useState(initial.cardLast4 ?? '')
  const [cardExpMonth, setCardExpMonth] = useState(initial.cardExpMonth?.toString() ?? '')
  const [cardExpYear, setCardExpYear] = useState(initial.cardExpYear?.toString() ?? '')
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ ok?: string; error?: string } | null>(null)

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFeedback(null)
    startTransition(async () => {
      try {
        await saveBilling({
          billingEmail: billingEmail || null,
          billingAddress: billingAddress || null,
          cardBrand: cardBrand || null,
          cardLast4: cardLast4 || null,
          cardExpMonth: cardExpMonth ? Number(cardExpMonth) : null,
          cardExpYear: cardExpYear ? Number(cardExpYear) : null,
        })
        setFeedback({ ok: 'Billing details saved' })
      } catch (err) {
        setFeedback({ error: (err as Error).message })
      }
    })
  }

  function handlePortal() {
    setFeedback(null)
    startTransition(async () => {
      try {
        await openBillingPortal()
      } catch (err) {
        setFeedback({ error: (err as Error).message })
      }
    })
  }

  const planLabel = initial.plan[0].toUpperCase() + initial.plan.slice(1)
  const monthly = PLAN_PRICES[initial.plan]

  return (
    <div className="grow">
      <form onSubmit={onSubmit}>
        <div className="p-6 space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl text-gray-800 dark:text-gray-100 font-bold mb-4">Billing & Invoices</h2>
              <div className="text-sm text-gray-600 dark:text-gray-300">
                Current plan: <strong className="font-medium text-gray-800 dark:text-gray-100">{planLabel}</strong>
                {monthly > 0 ? (
                  <>
                    {' '}— <strong className="font-medium">{formatMoney(monthly)}</strong> / month
                  </>
                ) : (
                  ' — free tier'
                )}
                {initial.renewsAt ? (
                  <>
                    {' '}· renews on{' '}
                    <strong className="font-medium">{formatShortDate(initial.renewsAt)}</strong>
                  </>
                ) : null}
                .
              </div>
            </div>
            {initial.hasStripeCustomer && (
              <ActionButton variant="secondary" size="sm" onClick={handlePortal} disabled={pending}>
                Manage in Stripe →
              </ActionButton>
            )}
          </div>

          <section>
            <h3 className="text-xl leading-snug text-gray-800 dark:text-gray-100 font-bold mb-3">Payment Method</h3>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Brand</label>
                <input className="form-input w-full" value={cardBrand} onChange={(e) => setCardBrand(e.target.value)} placeholder="Visa" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Last 4</label>
                <input className="form-input w-full" value={cardLast4} maxLength={4} onChange={(e) => setCardLast4(e.target.value.replace(/\D/g, ''))} placeholder="4242" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Exp month</label>
                <input className="form-input w-full" inputMode="numeric" value={cardExpMonth} onChange={(e) => setCardExpMonth(e.target.value.replace(/\D/g, ''))} placeholder="12" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Exp year</label>
                <input className="form-input w-full" inputMode="numeric" value={cardExpYear} onChange={(e) => setCardExpYear(e.target.value.replace(/\D/g, ''))} placeholder="2029" />
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-xl leading-snug text-gray-800 dark:text-gray-100 font-bold mb-3">Billing Information</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Billing email</label>
                <input type="email" className="form-input w-full sm:w-1/2" value={billingEmail} onChange={(e) => setBillingEmail(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Billing address</label>
                <textarea className="form-textarea w-full sm:w-2/3" rows={2} value={billingAddress} onChange={(e) => setBillingAddress(e.target.value)} />
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-xl leading-snug text-gray-800 dark:text-gray-100 font-bold mb-1">Invoices</h3>
            {pastInvoices.length === 0 ? (
              <div className="text-sm text-gray-500 dark:text-gray-400 mt-2">No paid invoices yet.</div>
            ) : (
              <table className="table-auto w-full dark:text-gray-400 mt-2">
                <thead className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  <tr>
                    <th className="py-2 text-left">Year</th>
                    <th className="py-2 text-left">Invoice</th>
                    <th className="py-2 text-left">Amount</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {pastInvoices.map((inv) => (
                    <tr key={inv.id} className="border-b border-gray-200 dark:border-gray-700/60">
                      <td className="py-2 font-medium text-gray-800 dark:text-gray-100 tabular-nums">{inv.year}</td>
                      <td className="py-2">{inv.invoiceNumber}</td>
                      <td className="py-2 font-medium tabular-nums">{formatMoney(inv.totalCents, inv.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>

        <footer>
          <div className="flex flex-col px-6 py-5 border-t border-gray-200 dark:border-gray-700/60">
            {feedback?.error && (
              <div className="mb-3 text-sm text-rose-700 dark:text-rose-300 bg-rose-500/10 px-3 py-2 rounded">{feedback.error}</div>
            )}
            {feedback?.ok && (
              <div className="mb-3 text-sm text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 px-3 py-2 rounded">{feedback.ok}</div>
            )}
            <div className="flex self-end gap-3">
              <ActionButton variant="secondary" type="reset">Cancel</ActionButton>
              <ActionButton variant="primary" type="submit" disabled={pending}>
                {pending ? 'Saving…' : 'Save Changes'}
              </ActionButton>
            </div>
          </div>
        </footer>
      </form>
    </div>
  )
}
