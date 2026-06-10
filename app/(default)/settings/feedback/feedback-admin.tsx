'use client'

import { useMemo, useState } from 'react'
import { relativeTime } from '@/lib/utils'
import { type Tone } from '@/lib/ui/encodings'
import { FilterChip } from '@/components/ui/filter-chip'
import { StatusPill } from '@/components/ui/status-pill'
import { EmptyState } from '@/components/ui/empty-state'

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

// Rating → tone: low scores are a problem (rose), 3 is a nudge (amber),
// 4–5 are healthy (emerald).
const TONE_BY_RATING: Record<number, Tone> = {
  1: 'urgent',
  2: 'urgent',
  3: 'warn',
  4: 'ok',
  5: 'ok',
}

const FILTER_LABELS: Record<'all' | 'platform' | 'clinic' | 'unhappy', string> = {
  all: 'All',
  platform: 'Platform',
  clinic: 'Clinic',
  unhappy: 'Rating ≤ 2',
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
        <div className="flex flex-wrap items-center gap-2">
          {(['all', 'platform', 'clinic', 'unhappy'] as const).map((f) => (
            <FilterChip key={f} active={filter === f} onClick={() => setFilter(f)}>
              {FILTER_LABELS[f]}
            </FilterChip>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        entries.length === 0 ? (
          <EmptyState
            title="No feedback yet"
            body="Submissions from clinics and platform users will land here."
          />
        ) : (
          <EmptyState
            title="No entries match this filter"
            body="Try a different filter."
          />
        )
      ) : (
        <ul className="space-y-3">
          {filtered.map((e) => (
            <li
              key={e.id}
              className="border border-gray-200 dark:border-gray-700/60 rounded-xl p-4 bg-white dark:bg-gray-800/60"
            >
              <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
                    {e.submitterName ?? 'Anonymous'}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
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
                    <StatusPill tone={TONE_BY_RATING[e.rating] ?? 'neutral'} label={`${e.rating}/5`} />
                  )}
                  <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
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
