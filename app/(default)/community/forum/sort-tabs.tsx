'use client'

import Link from 'next/link'

const OPTIONS = [
  { key: 'popular', label: 'Popular' },
  { key: 'newest', label: 'Newest' },
  { key: 'following', label: 'Following' },
]

export default function SortTabs({ current }: { current: string }) {
  return (
    <div className="w-full flex flex-wrap -space-x-px max-w-md">
      {OPTIONS.map((o) => {
        const active = current === o.key
        return (
          <Link
            key={o.key}
            href={`?sort=${o.key}`}
            className={`btn grow rounded-none first:rounded-l-lg last:rounded-r-lg ${
              active
                ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 text-violet-500'
                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 hover:bg-gray-50 dark:hover:bg-gray-700/20 text-gray-600 dark:text-gray-300'
            }`}
          >
            {o.label}
          </Link>
        )
      })}
    </div>
  )
}
