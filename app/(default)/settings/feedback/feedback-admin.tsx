'use client'

import { useMemo, useState } from 'react'
import { relativeTime } from '@/lib/utils'

export interface FeedbackEntry {
  id: number
  category: string
  rating: number | null
  message: string
  createdAt: string
  submitterName: string | null
  submitterEmail: string | null
  organizationName: string | null
  organizationType: 'platform' | 'clinic' | null
}

const TONE_BY_RATING: Record<number, string> = {
  1: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300',
  2: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300',
  3: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  4: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  5: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
}

export default function FeedbackAdmin({ entries }: { entries: FeedbackEntry[] }) {
  const [filter, setFilter] = useState<'all' | 'platform' | 'clinic' | 'unhappy'>('all')

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (filter === 'platform') return e.organizationType === 'platform'
      if (filter === 'clinic') return e.organizationType === 'clinic'
      if (filter === 'unhappy') return e.rating !== null && e.rating <= 2
      return true
    })
  }, [entries, filter])

  return (
    <section className="border-t border-gray-200 dark:border-gray-700/60 px-6 py-6">
      <div className="flex items-end justify-between mb-3 flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
            Recent submissions
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            All feedback submitted across DreamCRM. Visible only to platform admins.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {(['all', 'platform', 'clinic', 'unhappy'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={
                filter === f
                  ? 'text-[11px] font-medium px-2 py-1 rounded-md bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 capitalize'
                  : 'text-[11px] font-medium px-2 py-1 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 capitalize'
              }
            >
              {f === 'unhappy' ? 'Rating ≤ 2' : f}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-sm italic text-gray-400 dark:text-gray-500 py-8 text-center">
          {entries.length === 0
            ? 'No feedback has been submitted yet.'
            : 'No entries match this filter.'}
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((e) => (
            <li
              key={e.id}
              className="border border-gray-200 dark:border-gray-700/60 rounded-xl p-4 bg-white dark:bg-gray-800/60"
            >
              <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-gray-800 dark:text-gray-100">
                    {e.submitterName ?? 'Anonymous'}
                  </p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    {e.submitterEmail ?? '—'}
                    {e.organizationName && (
                      <>
                        {' · '}
                        <span className="capitalize">{e.organizationType ?? 'org'}</span>:{' '}
                        <strong>{e.organizationName}</strong>
                      </>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {e.rating != null && (
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${TONE_BY_RATING[e.rating] ?? ''}`}>
                      {e.rating}/5
                    </span>
                  )}
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums">
                    {relativeTime(e.createdAt)}
                  </span>
                </div>
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap leading-snug">
                {e.message}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
