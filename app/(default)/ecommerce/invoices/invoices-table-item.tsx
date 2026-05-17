'use client'

import { useTransition } from 'react'
import type { InvoiceRow } from './invoices-table'
import { InvoicesProperties } from './invoices-properties'
import { formatMoney } from '@/lib/utils'
import { changeInvoiceStatus, removeInvoices } from './actions'

interface InvoicesTableItemProps {
  invoice: InvoiceRow
  onCheckboxChange: (id: number, checked: boolean) => void
  isSelected: boolean
}

export default function InvoicesTableItem({ invoice, onCheckboxChange, isSelected }: InvoicesTableItemProps) {
  const { totalColor, statusColor, typeIcon } = InvoicesProperties()
  const [pending, startTransition] = useTransition()

  function handleMarkPaid() {
    startTransition(async () => {
      await changeInvoiceStatus(invoice.id, 'paid')
    })
  }
  function handleDelete() {
    if (!confirm(`Delete invoice ${invoice.invoice}?`)) return
    startTransition(async () => {
      await removeInvoices([invoice.id])
    })
  }

  const statusLabel = invoice.status[0].toUpperCase() + invoice.status.slice(1)

  return (
    <tr>
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap w-px">
        <div className="flex items-center">
          <label className="inline-flex">
            <span className="sr-only">Select</span>
            <input
              className="form-checkbox"
              type="checkbox"
              onChange={(e) => onCheckboxChange(invoice.id, e.target.checked)}
              checked={isSelected}
            />
          </label>
        </div>
      </td>
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
        <div className="font-medium text-sky-600">{invoice.invoice}</div>
      </td>
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
        <div className={`font-medium ${totalColor(statusLabel)}`}>{formatMoney(invoice.totalCents, invoice.currency)}</div>
      </td>
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
        <div className={`inline-flex font-medium rounded-full text-center px-2.5 py-0.5 ${statusColor(statusLabel)}`}>{statusLabel}</div>
      </td>
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
        <div className="font-medium text-gray-800 dark:text-gray-100">{invoice.customer ?? '—'}</div>
      </td>
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap"><div>{invoice.issueddate}</div></td>
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap"><div>{invoice.paiddate}</div></td>
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
        <div className="flex items-center">
          {typeIcon(invoice.type)}
          <div>{invoice.type}</div>
        </div>
      </td>
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap w-px">
        <div className="space-x-1">
          {invoice.status !== 'paid' && (
            <button
              onClick={handleMarkPaid}
              disabled={pending}
              title="Mark as paid"
              className="text-green-600 hover:text-green-700 rounded-full disabled:opacity-60"
            >
              <span className="sr-only">Mark paid</span>
              <svg className="w-8 h-8 fill-current" viewBox="0 0 32 32">
                <path d="M22.293 11.293L14 19.586l-4.293-4.293-1.414 1.414L14 22.414l9.707-9.707z" />
              </svg>
            </button>
          )}
          <button
            onClick={handleDelete}
            disabled={pending}
            className="text-red-500 hover:text-red-600 rounded-full disabled:opacity-60"
          >
            <span className="sr-only">Delete</span>
            <svg className="w-8 h-8 fill-current" viewBox="0 0 32 32">
              <path d="M13 15h2v6h-2zM17 15h2v6h-2z" />
              <path d="M20 9c0-.6-.4-1-1-1h-6c-.6 0-1 .4-1 1v2H8v2h1v10c0 .6.4 1 1 1h12c.6 0 1-.4 1-1V13h1v-2h-4V9zm-6 1h4v1h-4v-1zm7 3v9H11v-9h10z" />
            </svg>
          </button>
        </div>
      </td>
    </tr>
  )
}
