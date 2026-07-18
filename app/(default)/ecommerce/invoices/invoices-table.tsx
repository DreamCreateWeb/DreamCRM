'use client'

import { useItemSelection } from '@/components/utils/use-item-selection'
import InvoicesTableItem from './invoices-table-item'

export interface InvoiceRow {
  id: number
  invoice: string
  totalCents: number
  currency: string
  status: string
  customer: string | null
  issueddate: string
  paiddate: string
  type: string
}

export default function InvoicesTable({ invoices }: { invoices: InvoiceRow[] }) {
  const { selectedItems, isAllSelected, handleCheckboxChange, handleSelectAllChange } =
    useItemSelection(invoices)

  return (
    <div className="v2-card relative">
      <header className="px-5 py-4">
        <h2 className="font-semibold text-gray-800 dark:text-gray-100">
          Invoices <span className="text-gray-400 dark:text-gray-500 font-medium">{invoices.length}</span>
        </h2>
      </header>
      <div>
        <div className="overflow-x-auto">
          <table className="table-auto w-full dark:text-gray-300">
            <thead className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20 border-t border-b border-gray-100 dark:border-gray-700/60">
              <tr>
                <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap w-px">
                  <div className="flex items-center">
                    <label className="inline-flex">
                      <span className="sr-only">Select all</span>
                      <input
                        className="form-checkbox"
                        type="checkbox"
                        onChange={handleSelectAllChange}
                        checked={isAllSelected}
                      />
                    </label>
                  </div>
                </th>
                <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap"><div className="font-semibold text-left">Invoice</div></th>
                <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap"><div className="font-semibold text-left">Total</div></th>
                <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap"><div className="font-semibold text-left">Status</div></th>
                <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap"><div className="font-semibold text-left">Customer</div></th>
                <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap"><div className="font-semibold text-left">Issued on</div></th>
                <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap"><div className="font-semibold text-left">Paid on</div></th>
                <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap"><div className="font-semibold text-left">Type</div></th>
                <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap"><div className="font-semibold text-left">Actions</div></th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-gray-100 dark:divide-gray-700/60">
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                    No invoices yet.
                  </td>
                </tr>
              ) : (
                invoices.map((invoice) => (
                  <InvoicesTableItem
                    key={invoice.id}
                    invoice={invoice}
                    onCheckboxChange={handleCheckboxChange}
                    isSelected={selectedItems.includes(invoice.id)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
