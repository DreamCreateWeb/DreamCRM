import Image from 'next/image'
import { formatMoney } from '@/lib/utils'
import type { CustomerRow } from './customers-table'

interface CustomersTableItemProps {
  customer: CustomerRow
  onCheckboxChange: (id: number, checked: boolean) => void
  isSelected: boolean
  onToggleFav: (id: number) => void
  pendingFav: boolean
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export default function CustomersTableItem({
  customer,
  onCheckboxChange,
  isSelected,
  onToggleFav,
  pendingFav,
}: CustomersTableItemProps) {
  return (
    <tr>
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap w-px">
        <div className="flex items-center">
          <label className="inline-flex">
            <span className="sr-only">Select</span>
            <input
              className="form-checkbox"
              type="checkbox"
              onChange={(e) => onCheckboxChange(customer.id, e.target.checked)}
              checked={isSelected}
            />
          </label>
        </div>
      </td>
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap w-px">
        <div className="flex items-center relative">
          <button
            type="button"
            disabled={pendingFav}
            onClick={() => onToggleFav(customer.id)}
            aria-label={customer.fav ? 'Unfavorite' : 'Favorite'}
          >
            <svg
              className={`shrink-0 fill-current ${customer.fav ? 'text-yellow-500' : 'text-gray-300 dark:text-gray-600'}`}
              width="16"
              height="16"
              viewBox="0 0 16 16"
            >
              <path d="M8 0L6 5.934H0l4.89 3.954L2.968 16 8 12.223 13.032 16 11.11 9.888 16 5.934h-6L8 0z" />
            </svg>
          </button>
        </div>
      </td>
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
        <div className="flex items-center">
          <div className="w-10 h-10 shrink-0 mr-2 sm:mr-3 rounded-full overflow-hidden bg-violet-100 dark:bg-violet-500/20 flex items-center justify-center">
            {customer.imageUrl ? (
              <Image
                className="rounded-full"
                src={customer.imageUrl}
                width={40}
                height={40}
                alt={customer.name}
                unoptimized
              />
            ) : (
              <span className="text-xs font-semibold text-violet-700 dark:text-violet-200">
                {initials(customer.name)}
              </span>
            )}
          </div>
          <div className="font-medium text-gray-800 dark:text-gray-100">{customer.name}</div>
        </div>
      </td>
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
        <div className="text-left">{customer.email}</div>
      </td>
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
        <div className="text-left">{customer.location ?? '—'}</div>
      </td>
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
        <div className="text-center">{customer.orderCount}</div>
      </td>
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
        <div className="text-left font-medium text-sky-600">
          {customer.lastOrderNumber ?? '—'}
        </div>
      </td>
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
        <div className="text-left font-medium text-green-600">
          {formatMoney(customer.totalSpentCents)}
        </div>
      </td>
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
        <div className="text-center">{customer.refunds || '—'}</div>
      </td>
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap w-px">
        <button className="text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400 rounded-full">
          <span className="sr-only">Menu</span>
          <svg className="w-8 h-8 fill-current" viewBox="0 0 32 32">
            <circle cx="16" cy="16" r="2" />
            <circle cx="10" cy="16" r="2" />
            <circle cx="22" cy="16" r="2" />
          </svg>
        </button>
      </td>
    </tr>
  )
}
