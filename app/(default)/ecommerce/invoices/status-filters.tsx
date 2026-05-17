'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

interface Counts {
  all: number
  paid: number
  pending: number
  overdue: number
}

const FILTERS: { key: 'all' | 'paid' | 'pending' | 'overdue'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'paid', label: 'Paid' },
  { key: 'pending', label: 'Due' },
  { key: 'overdue', label: 'Overdue' },
]

export default function StatusFilters({ counts }: { counts: Counts }) {
  const params = useSearchParams()
  const active = (params.get('status') ?? 'all') as keyof Counts

  return (
    <ul className="flex flex-wrap -m-1">
      {FILTERS.map((f) => {
        const isActive = active === f.key
        const href = f.key === 'all' ? '?' : `?status=${f.key}`
        return (
          <li key={f.key} className="m-1">
            <Link
              href={href}
              className={`inline-flex items-center justify-center text-sm font-medium leading-5 rounded-full px-3 py-1 border shadow-sm transition ${
                isActive
                  ? 'border-transparent bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-800'
                  : 'border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400'
              }`}
            >
              {f.label} <span className="ml-1 text-gray-400 dark:text-gray-500">{counts[f.key]}</span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
