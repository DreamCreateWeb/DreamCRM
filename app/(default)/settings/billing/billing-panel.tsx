'use client'

import { useState, useEffect } from 'react'

interface Subscription {
  planName: string
  interval: string
  currentPeriodEnd: number
  cancelAtPeriodEnd: boolean
  card: { brand: string; last4: string } | null
}

interface Invoice {
  id: string
  number: string | null
  amount: string
  currency: string
  status: string | null
  periodStart: number
  periodEnd: number
  hostedUrl: string | null
  pdfUrl: string | null
  description: string
}

export default function BillingPanel() {
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [portalLoading, setPortalLoading] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/billing/subscription').then((r) => r.json()),
      fetch('/api/billing/invoices').then((r) => r.json()),
    ])
      .then(([subData, invData]) => {
        setSubscription(subData.subscription ?? null)
        setInvoices(invData.invoices ?? [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function openPortal() {
    setPortalLoading(true)
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        alert(data.error ?? 'Could not open billing portal')
      }
    } catch {
      alert('Could not connect to billing service')
    } finally {
      setPortalLoading(false)
    }
  }

  const renewalDate = subscription?.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd * 1000).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : null

  const cardLabel = subscription?.card
    ? `${subscription.card.brand.charAt(0).toUpperCase() + subscription.card.brand.slice(1)} ending ${subscription.card.last4}`
    : '—'

  return (
    <div className="grow">

      {/* Panel body */}
      <div className="p-6 space-y-6">
        <div>
          <h2 className="text-2xl text-gray-800 dark:text-gray-100 font-bold mb-4">Billing &amp; Invoices</h2>
          {loading ? (
            <div className="text-sm text-gray-400">Loading billing info…</div>
          ) : subscription ? (
            <div className="text-sm">
              Your <strong className="font-medium">{subscription.planName} Plan</strong> is set to{' '}
              <strong className="font-medium">
                {subscription.interval === 'year' ? 'renew annually' : 'renew monthly'}
              </strong>{' '}
              on <strong className="font-medium">{renewalDate}</strong>.
              {subscription.cancelAtPeriodEnd && (
                <span className="ml-2 text-red-500">(Cancels at period end)</span>
              )}
            </div>
          ) : (
            <div className="text-sm text-gray-500">No active subscription found.</div>
          )}
        </div>

        {/* Billing Information */}
        <section>
          <h3 className="text-xl leading-snug text-gray-800 dark:text-gray-100 font-bold mb-1">Billing Information</h3>
          <ul>
            <li className="md:flex md:justify-between md:items-center py-3 border-b border-gray-200 dark:border-gray-700/60">
              <div className="text-sm text-gray-800 dark:text-gray-100 font-medium">Payment Method</div>
              <div className="text-sm text-gray-600 dark:text-gray-400 ml-4">
                <span className="mr-3">{loading ? '—' : cardLabel}</span>
                <button
                  onClick={openPortal}
                  disabled={portalLoading}
                  className="font-medium text-violet-500 hover:text-violet-600 dark:hover:text-violet-400 disabled:opacity-50"
                >
                  {portalLoading ? 'Opening…' : 'Edit'}
                </button>
              </div>
            </li>
            <li className="md:flex md:justify-between md:items-center py-3 border-b border-gray-200 dark:border-gray-700/60">
              <div className="text-sm text-gray-800 dark:text-gray-100 font-medium">Billing Interval</div>
              <div className="text-sm text-gray-600 dark:text-gray-400 ml-4">
                <span className="mr-3">
                  {loading ? '—' : subscription?.interval === 'year' ? 'Annually' : subscription ? 'Monthly' : '—'}
                </span>
                <button
                  onClick={openPortal}
                  disabled={portalLoading}
                  className="font-medium text-violet-500 hover:text-violet-600 dark:hover:text-violet-400 disabled:opacity-50"
                >
                  Edit
                </button>
              </div>
            </li>
            <li className="md:flex md:justify-between md:items-center py-3 border-b border-gray-200 dark:border-gray-700/60">
              <div className="text-sm text-gray-800 dark:text-gray-100 font-medium">Plan</div>
              <div className="text-sm text-gray-600 dark:text-gray-400 ml-4">
                <span className="mr-3">{loading ? '—' : subscription?.planName ?? 'No active plan'}</span>
                <a href="/settings/plans" className="font-medium text-violet-500 hover:text-violet-600 dark:hover:text-violet-400">
                  Change
                </a>
              </div>
            </li>
            <li className="md:flex md:justify-between md:items-center py-3 border-b border-gray-200 dark:border-gray-700/60">
              <div className="text-sm text-gray-800 dark:text-gray-100 font-medium">Billing Address</div>
              <div className="text-sm text-gray-600 dark:text-gray-400 ml-4">
                <span className="mr-3">contact@dreamcreateweb.com</span>
                <button
                  onClick={openPortal}
                  disabled={portalLoading}
                  className="font-medium text-violet-500 hover:text-violet-600 dark:hover:text-violet-400 disabled:opacity-50"
                >
                  Edit
                </button>
              </div>
            </li>
          </ul>
        </section>

        {/* Invoices */}
        <section>
          <h3 className="text-xl leading-snug text-gray-800 dark:text-gray-100 font-bold mb-1">Invoices</h3>
          {loading ? (
            <div className="text-sm text-gray-400 py-4">Loading invoices…</div>
          ) : invoices.length === 0 ? (
            <div className="text-sm text-gray-500 py-4">No invoices yet.</div>
          ) : (
            <table className="table-auto w-full dark:text-gray-400">
              <thead className="text-xs uppercase text-gray-400 dark:text-gray-500">
                <tr className="flex flex-wrap md:table-row md:flex-no-wrap">
                  <th className="w-full block md:w-auto md:table-cell py-2">
                    <div className="font-semibold text-left">Period</div>
                  </th>
                  <th className="w-full hidden md:w-auto md:table-cell py-2">
                    <div className="font-semibold text-left">Description</div>
                  </th>
                  <th className="w-full hidden md:w-auto md:table-cell py-2">
                    <div className="font-semibold text-left">Amount</div>
                  </th>
                  <th className="w-full hidden md:w-auto md:table-cell py-2">
                    <div className="font-semibold text-left">Status</div>
                  </th>
                  <th className="w-full hidden md:w-auto md:table-cell py-2">
                    <div className="font-semibold text-right"></div>
                  </th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {invoices.map((inv) => {
                  const period = new Date(inv.periodStart * 1000).toLocaleDateString('en-US', {
                    month: 'short',
                    year: 'numeric',
                  })
                  const statusColor =
                    inv.status === 'paid'
                      ? 'text-green-600 bg-green-100 dark:bg-green-500/20 dark:text-green-400'
                      : inv.status === 'open'
                      ? 'text-yellow-600 bg-yellow-100 dark:bg-yellow-500/20 dark:text-yellow-400'
                      : 'text-gray-500 bg-gray-100 dark:bg-gray-700 dark:text-gray-400'

                  return (
                    <tr
                      key={inv.id}
                      className="flex flex-wrap md:table-row md:flex-no-wrap border-b border-gray-200 dark:border-gray-700/60 py-2 md:py-0"
                    >
                      <td className="w-full block md:w-auto md:table-cell py-0.5 md:py-2">
                        <div className="text-left font-medium text-gray-800 dark:text-gray-100">{period}</div>
                      </td>
                      <td className="w-full block md:w-auto md:table-cell py-0.5 md:py-2">
                        <div className="text-left text-gray-600 dark:text-gray-400 truncate max-w-xs">{inv.description || inv.number}</div>
                      </td>
                      <td className="w-full block md:w-auto md:table-cell py-0.5 md:py-2">
                        <div className="text-left font-medium">${inv.amount} {inv.currency}</div>
                      </td>
                      <td className="w-full block md:w-auto md:table-cell py-0.5 md:py-2">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${statusColor}`}>
                          {inv.status}
                        </span>
                      </td>
                      <td className="w-full block md:w-auto md:table-cell py-0.5 md:py-2">
                        <div className="text-right flex items-center md:justify-end gap-3">
                          {inv.hostedUrl && (
                            <a
                              className="font-medium text-violet-500 hover:text-violet-600 dark:hover:text-violet-400"
                              href={inv.hostedUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              View
                            </a>
                          )}
                          {inv.pdfUrl && (
                            <a
                              className="font-medium text-violet-500 hover:text-violet-600 dark:hover:text-violet-400"
                              href={inv.pdfUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              PDF
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </section>

        {/* Manage in Portal */}
        <section>
          <div className="px-5 py-3 bg-linear-to-r from-violet-500/[0.12] dark:from-violet-500/[0.24] to-violet-500/[0.04] rounded-lg text-center xl:text-left xl:flex xl:flex-wrap xl:justify-between xl:items-center">
            <div className="text-gray-800 dark:text-gray-100 font-semibold mb-2 xl:mb-0">Need to update your card, address, or cancel?</div>
            <button
              onClick={openPortal}
              disabled={portalLoading}
              className="btn bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white disabled:opacity-50"
            >
              {portalLoading ? 'Opening…' : 'Manage Billing'}
            </button>
          </div>
        </section>

      </div>
    </div>
  )
}
