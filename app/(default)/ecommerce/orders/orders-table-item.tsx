'use client'

import { useTransition } from 'react'
import type { OrderRow } from './orders-table'
import { OrdersProperties } from './orders-properties'
import { formatMoney } from '@/lib/utils'
import { setOrderStatus } from './actions'

interface OrdersTableItemProps {
  order: OrderRow
  onCheckboxChange: (id: number, checked: boolean) => void
  isSelected: boolean
}

const STATUSES = ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded']

export default function OrdersTableItem({ order, onCheckboxChange, isSelected }: OrdersTableItemProps) {
  const { descriptionOpen, setDescriptionOpen, statusColor, typeIcon } = OrdersProperties()
  const [pending, startTransition] = useTransition()

  function handleStatusChange(status: string) {
    startTransition(async () => {
      await setOrderStatus(order.id, status)
    })
  }

  return (
    <tbody className="text-sm">
      <tr>
        <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap w-px">
          <div className="flex items-center">
            <label className="inline-flex">
              <span className="sr-only">Select</span>
              <input
                className="form-checkbox"
                type="checkbox"
                onChange={(e) => onCheckboxChange(order.id, e.target.checked)}
                checked={isSelected}
              />
            </label>
          </div>
        </td>
        <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
          <div className="flex items-center text-gray-800">
            <div className="w-10 h-10 shrink-0 flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded-full mr-2 sm:mr-3">
              <svg className="fill-current text-gray-400 dark:text-gray-500" width="16" height="16" viewBox="0 0 16 16">
                <path d="M5 7h6v2H5zM14 0H2C.9 0 0 .9 0 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V2c0-1.1-.9-2-2-2zM2 14V2h12v12H2z" />
              </svg>
            </div>
            <div className="font-medium text-sky-600">{order.orderNumber}</div>
          </div>
        </td>
        <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap"><div>{order.date}</div></td>
        <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
          <div className="font-medium text-gray-800 dark:text-gray-100">{order.customer ?? '—'}</div>
        </td>
        <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
          <div className="text-left font-medium text-green-600">{formatMoney(order.totalCents, order.currency)}</div>
        </td>
        <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
          <select
            value={order.status}
            disabled={pending}
            onChange={(e) => handleStatusChange(e.target.value)}
            className={`inline-flex font-medium rounded-full text-center px-2.5 py-0.5 text-xs border-none ${statusColor(order.status)} disabled:opacity-60`}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </td>
        <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap"><div className="text-center">{order.itemCount}</div></td>
        <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap"><div className="text-left">{order.location ?? '—'}</div></td>
        <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
          <div className="flex items-center">
            {typeIcon(order.type)}
            <div>{order.type}</div>
          </div>
        </td>
        <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap w-px">
          <div className="flex items-center">
            <button
              className={`text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400 ${descriptionOpen && 'rotate-180'}`}
              aria-expanded={descriptionOpen}
              onClick={() => setDescriptionOpen(!descriptionOpen)}
              aria-controls={`description-${order.id}`}
            >
              <span className="sr-only">Menu</span>
              <svg className="w-8 h-8 fill-current" viewBox="0 0 32 32">
                <path d="M16 20l-5.4-5.4 1.4-1.4 4 4 4-4 1.4 1.4z" />
              </svg>
            </button>
          </div>
        </td>
      </tr>
      <tr id={`description-${order.id}`} role="region" className={`${!descriptionOpen && 'hidden'}`}>
        <td colSpan={10} className="px-2 first:pl-5 last:pr-5 py-3">
          <div className="flex items-center bg-gray-50 dark:bg-gray-950/[0.15] dark:text-gray-400 p-3 -mt-3">
            <svg className="shrink-0 fill-current text-gray-400 dark:text-gray-500 mr-2" width="16" height="16">
              <path d="M1 16h3c.3 0 .5-.1.7-.3l11-11c.4-.4.4-1 0-1.4l-3-3c-.4-.4-1-.4-1.4 0l-11 11c-.2.2-.3.4-.3.7v3c0 .6.4 1 1 1zm1-3.6l10-10L13.6 4l-10 10H2v-1.6z" />
            </svg>
            <div className="italic">{order.description}</div>
          </div>
        </td>
      </tr>
    </tbody>
  )
}
