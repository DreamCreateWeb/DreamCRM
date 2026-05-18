'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { INTENT_COLORS } from './intent-badge'

interface Props {
  intentCounts: Record<string, number>
  activeIntent: string | null
  unreadOnly: boolean
  starredOnly: boolean
  patientsOnly: boolean
  totalCount: number
  unreadCount: number
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
    <div className="px-4 pt-3 pb-2 border-b border-stone-100 dark:border-stone-700/40 space-y-2">
      {/* View toggles row */}
      <div className="flex items-center gap-1.5 text-[11px]">
        <Chip
          label="All"
          count={totalCount}
          active={!unreadOnly && !starredOnly && !patientsOnly}
          href={href({ view: null, patients: null })}
        />
        <Chip
          label="Unread"
          count={unreadCount}
          active={unreadOnly}
          href={href({ view: unreadOnly ? null : 'unread', patients: null })}
        />
        <Chip
          label="Starred"
          active={starredOnly}
          href={href({ view: starredOnly ? null : 'starred', patients: null })}
        />
        <Chip
          label="Patients"
          active={patientsOnly}
          href={href({ patients: patientsOnly ? null : '1', view: null })}
        />
      </div>

      {/* Intent row */}
      {Object.keys(intentCounts).length > 0 && (
        <div className="flex items-center gap-1.5 text-[11px] flex-wrap">
          {Object.entries(INTENT_COLORS).map(([key, c]) => {
            const count = intentCounts[key]
            if (!count) return null
            const active = activeIntent === key
            return (
              <Link
                key={key}
                href={href({ intent: active ? null : key })}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 transition-colors',
                  active
                    ? cn(c.bg, c.text, 'ring-1 ring-current/30')
                    : 'text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800',
                )}
              >
                <span className={cn('w-1.5 h-1.5 rounded-full', c.dot)} />
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

function Chip({ label, count, active, href }: { label: string; count?: number; active: boolean; href: string }) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium transition-colors',
        active
          ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'
          : 'text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800',
      )}
    >
      {label}
      {typeof count === 'number' && (
        <span className={cn('tabular-nums', active ? 'opacity-80' : 'opacity-60')}>{count}</span>
      )}
    </Link>
  )
}
