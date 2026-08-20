'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { FilterChip } from '@/components/ui/filter-chip'
import { TONE_PILL } from '@/lib/ui/encodings'
import type { InboxTerminology } from '@/lib/inbox-terminology'
import { INTENT_COLORS, INTENT_TONE } from './intent-badge'

interface Props {
  intentCounts: Record<string, number>
  activeIntent: string | null
  unreadOnly: boolean
  starredOnly: boolean
  patientsOnly: boolean
  totalCount: number
  unreadCount: number
  /**
   * Hide the intent row on non-Primary tabs (Promotions, Updates, Spam) —
   * intent buckets are designed around primary clinic email and aren't
   * meaningful in the marketing/automated tabs.
   */
  showIntents?: boolean
  terminology: InboxTerminology
}

/**
 * Triage filter chips that sit above the message list. Toggles the
 * `intent`, `view`, `patients` query params; selecting a chip is a soft
 * navigation that re-renders the list server-side.
 */
export default function FilterChips({
  intentCounts,
  activeIntent,
  unreadOnly,
  starredOnly,
  patientsOnly,
  totalCount,
  unreadCount,
  showIntents = true,
  terminology,
}: Props) {
  const pathname = usePathname()
  const sp = useSearchParams()

  function href(updates: Record<string, string | null>): string {
    const params = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(updates)) {
      if (v === null) params.delete(k)
      else params.set(k, v)
    }
    // Strip the message id on filter changes so we don't keep a stale selection.
    params.delete('m')
    const qs = params.toString()
    return qs ? `${pathname}?${qs}` : pathname
  }

  return (
    <div className="px-4 pt-3 pb-2 border-b border-gray-100 dark:border-gray-700/40 space-y-2">
      {/* View toggles row — the shared FilterChip (href mode), not a local
          pill recipe. The intent row below keeps its tone-colored chips on
          purpose (they encode the tone contract, not selection). */}
      <div className="flex items-center gap-1.5 text-xs">
        <FilterChip
          active={!unreadOnly && !starredOnly && !patientsOnly}
          href={href({ view: null, patients: null })}
          count={totalCount}
        >
          All
        </FilterChip>
        <FilterChip
          active={unreadOnly}
          href={href({ view: unreadOnly ? null : 'unread', patients: null })}
          count={unreadCount}
        >
          Unread
        </FilterChip>
        <FilterChip active={starredOnly} href={href({ view: starredOnly ? null : 'starred', patients: null })}>
          Starred
        </FilterChip>
        <FilterChip active={patientsOnly} href={href({ patients: patientsOnly ? null : '1', view: null })}>
          {terminology.Contacts}
        </FilterChip>
      </div>

      {/* Intent row — categories sourced from the tone contract */}
      {showIntents && Object.keys(intentCounts).length > 0 && (
        <div className="flex items-center gap-1.5 text-xs flex-wrap">
          {Object.entries(INTENT_COLORS).map(([key, c]) => {
            const count = intentCounts[key]
            if (!count) return null
            const active = activeIntent === key
            return (
              <Link
                key={key}
                href={href({ intent: active ? null : key })}
                aria-pressed={active}
                title={`Filter to ${c.label} (${count})`}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 transition-colors',
                  active
                    ? cn(TONE_PILL[INTENT_TONE[key] ?? 'neutral'], 'ring-1 ring-current/30')
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800',
                )}
              >
                <span className={cn('w-1.5 h-1.5 rounded-full', c.dot)} aria-hidden="true" />
                <span className="font-medium">{c.label}</span>
                <span className="tabular-nums opacity-70">{count}</span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

