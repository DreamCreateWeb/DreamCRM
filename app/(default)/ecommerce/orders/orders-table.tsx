'use client'

import { useItemSelection } from '@/components/utils/use-item-selection'
import OrdersTableItem from './orders-table-item'

export interface OrderRow {
  id: number
  orderNumber: string
  date: string
  customer: string | null
  totalCents: number
  currency: string
  status: string
  itemCount: number
  location: string | null
  type: string
  description: string
}

export default function OrdersTable({ orders }: { orders: OrderRow[] }) {
  const { selectedItems, isAllSelected, handleCheckboxChange, handleSelectAllChange } =
    useItemSelection(orders)

  return (
    <div className="v2-card relative">
      <header className="px-5 py-4">
        <h2 className="font-semibold text-gray-800 dark:text-gray-100">
          All Orders <span className="text-gray-400 dark:text-gray-500 font-medium">{orders.length}</span>
        </h2>
      </header>
      <div>
        <div className="overflow-x-auto">
          <table className="table-auto w-full dark:text-gray-300 divide-y divide-gray-100 dark:divide-gray-700/60">
            <thead className="text-xs uppercase text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20 border-t border-gray-100 dark:border-gray-700/60">
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
                <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap"><div className="font-semibold text-left">Order</div></th>
                <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap"><div className="font-semibold text-left">Date</div></th>
                <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap"><div className="font-semibold text-left">Customer</div></th>
                <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap"><div className="font-semibold text-left">Total</div></th>
                <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap"><div className="font-semibold text-left">Status</div></th>
                <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap"><div className="font-semibold">Items</div></th>
                <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap"><div className="font-semibold text-left">Location</div></th>
                <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap"><div className="font-semibold text-left">Type</div></th>
                <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap"><span className="sr-only">Menu</span></th>
              </tr>
            </thead>
            {orders.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={10} className="px-5 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                    No orders yet.
                  </td>
                </tr>
              </tbody>
            ) : (
              orders.map((order) => (
                <OrdersTableItem
                  key={order.id}
                  order={order}
                  onCheckboxChange={handleCheckboxChange}
                  isSelected={selectedItems.includes(order.id)}
                />
              ))
            )}
          </table>
        </div>
      </div>
    </div>
  )
}
