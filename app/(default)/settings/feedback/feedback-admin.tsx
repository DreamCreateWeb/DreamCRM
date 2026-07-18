'use client'

import { useMemo, useState } from 'react'
import { relativeTime } from '@/lib/utils'
import { type Tone } from '@/lib/ui/encodings'
import { FilterChip } from '@/components/ui/filter-chip'
import { StatusPill } from '@/components/ui/status-pill'
import { EmptyState } from '@/components/ui/empty-state'
import { FEEDBACK_CATEGORIES, feedbackCategoryLabel } from './feedback-categories'

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

const SOURCE_LABELS: Record<'all' | 'platform' | 'clinic' | 'unhappy', string> = {
  all: 'All',
  platform: 'Platform',
  clinic: 'Clinic',
  unhappy: 'Rating ≤ 2',
}

export default function FeedbackAdmin({ entries }: { entries: FeedbackEntry[] }) {
  const [source, setSource] = useState<'all' | 'platform' | 'clinic' | 'unhappy'>('all')
  // Category filter is independent of source: 'all' = every topic. Only offer
  // categories that actually appear in the data (plus the known buckets), so
  // the chip row never advertises an empty filter.
  const [category, setCategory] = useState<string>('all')

  // Per-category counts (over the source-filtered set, so the badges track what
  // the category chips would actually narrow to).
  const sourceFiltered = useMemo(
    () =>
      entries.filter((e) => {
        if (source === 'platform') return e.organizationType === 'platform'
        if (source === 'clinic') return e.organizationType === 'clinic'
        if (source === 'unhappy') return e.rating !== null && e.rating <= 2
        return true
      }),
    [entries, source],
  )

  // Buckets to show: the known catalog entries that appear, then any extra
  // legacy ids present in the data (e.g. 'nps'/'general'), so nothing is
  // unfilterable.
  const categoryChips = useMemo(() => {
    const present = new Set(sourceFiltered.map((e) => e.category))
    const known = FEEDBACK_CATEGORIES.filter((c) => present.has(c.id)).map((c) => c.id)
    const extras = Array.from(present).filter((id) => !FEEDBACK_CATEGORIES.some((c) => c.id === id)).sort()
    return [...known, ...extras]
  }, [sourceFiltered])

  const countByCategory = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of sourceFiltered) m.set(e.category, (m.get(e.category) ?? 0) + 1)
    return m
  }, [sourceFiltered])

  const filtered = useMemo(
    () => (category === 'all' ? sourceFiltered : sourceFiltered.filter((e) => e.category === category)),
    [sourceFiltered, category],
  )

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
            <FilterChip key={f} active={source === f} onClick={() => setSource(f)}>
              {SOURCE_LABELS[f]}
            </FilterChip>
          ))}
        </div>
      </div>

      {/* Topic filter — reads feedback.category. Only shows when there's more
          than one topic to choose between. */}
      {categoryChips.length > 1 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 mr-0.5">Topic</span>
          <FilterChip active={category === 'all'} onClick={() => setCategory('all')} count={sourceFiltered.length}>
            All topics
          </FilterChip>
          {categoryChips.map((id) => (
            <FilterChip
              key={id}
              active={category === id}
              onClick={() => setCategory(id)}
              count={countByCategory.get(id) ?? 0}
            >
              {feedbackCategoryLabel(id)}
            </FilterChip>
          ))}
        </div>
      )}

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
              className="v2-card p-4"
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
                  <StatusPill tone="neutral" label={feedbackCategoryLabel(e.category)} />
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
