'use client'

import Link from 'next/link'
import { usePathname, useSearchParams, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  total: number
  tags: string[]
  /** Layout switcher between kanban and list views — purely cosmetic, points
   *  at the sibling /tasks/list and /tasks/kanban routes. */
  layout: 'kanban' | 'list'
}

const SAVED_VIEWS = [
  { key: '', label: 'All' },
  { key: 'today', label: 'Today' },
  { key: 'this_week', label: 'This week' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'mine', label: 'My tasks' },
  { key: 'completed', label: 'Completed' },
] as const

const PRIORITIES = [
  { key: 'high', label: 'High', dot: 'bg-rose-500' },
  { key: 'medium', label: 'Med', dot: 'bg-amber-500' },
  { key: 'low', label: 'Low', dot: 'bg-stone-400' },
] as const

/**
 * Sticky filter bar that sits above both kanban and list views. URL-driven
 * — all selections become query params on the same page so links remain
 * shareable + back/forward works. Search is debounced 300ms.
 */
export default function FilterBar({ total, tags, layout }: Props) {
  const pathname = usePathname()
  const sp = useSearchParams()
  const router = useRouter()
  const [searchInput, setSearchInput] = useState(sp.get('q') ?? '')

  // Debounce search → URL.
  useEffect(() => {
    const initial = sp.get('q') ?? ''
    if (searchInput === initial) return
    const id = setTimeout(() => {
      router.replace(updateUrl(pathname, sp, { q: searchInput || null }), { scroll: false })
    }, 300)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput])

  const view = sp.get('view') ?? ''
  const priority = sp.get('priority') ?? ''
  const activeTag = sp.get('tag') ?? ''

  return (
    <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 p-3 space-y-2.5">
      {/* Row 1: saved views + layout switcher */}
      <div className="flex items-center gap-1 flex-wrap">
        {SAVED_VIEWS.map((v) => {
          const isActive = view === v.key
          return (
            <Link
              key={v.key}
              href={updateUrl(pathname, sp, { view: v.key || null })}
              className={cn(
                'text-xs font-medium px-2.5 py-1 rounded-md transition-colors',
                isActive
                  ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100 dark:text-stone-300 dark:hover:text-stone-100 dark:hover:bg-stone-800',
              )}
            >
              {v.label}
            </Link>
          )
        })}
        <span className="ml-1 text-xs text-stone-500 dark:text-stone-400 tabular-nums">{total}</span>
        <div className="ml-auto flex items-center rounded-md border border-stone-200 dark:border-stone-700 p-0.5">
          <Link
            href={`/tasks/kanban${searchAndFilterQs(sp)}`}
            className={cn(
              'text-xs font-medium px-2 py-1 rounded',
              layout === 'kanban'
                ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'
                : 'text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800',
            )}
          >
            Board
          </Link>
          <Link
            href={`/tasks/list${searchAndFilterQs(sp)}`}
            className={cn(
              'text-xs font-medium px-2 py-1 rounded',
              layout === 'list'
                ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'
                : 'text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800',
            )}
          >
            List
          </Link>
        </div>
      </div>

      {/* Row 2: search + priority + tags */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative grow min-w-[14rem] max-w-md">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search tasks…"
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/40 focus:bg-white dark:focus:bg-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10 dark:focus:ring-stone-100/10 placeholder:text-stone-400"
          />
        </div>

        <div className="flex items-center gap-1">
          {PRIORITIES.map((p) => {
            const active = priority === p.key
            return (
              <Link
                key={p.key}
                href={updateUrl(pathname, sp, { priority: active ? null : p.key })}
                className={cn(
                  'inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md transition-colors',
                  active
                    ? 'bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100 ring-1 ring-stone-300 dark:ring-stone-600'
                    : 'text-stone-500 hover:text-stone-800 hover:bg-stone-50 dark:text-stone-400 dark:hover:text-stone-200 dark:hover:bg-stone-800',
                )}
              >
                <span className={cn('w-1.5 h-1.5 rounded-full', p.dot)} />
                {p.label}
              </Link>
            )
          })}
        </div>

        {tags.length > 0 && (
          <>
            <div className="w-px h-4 bg-stone-200 dark:bg-stone-700" />
            <div className="flex items-center gap-1 flex-wrap">
              {tags.slice(0, 8).map((tag) => {
                const active = activeTag === tag
                return (
                  <Link
                    key={tag}
                    href={updateUrl(pathname, sp, { tag: active ? null : tag })}
                    className={cn(
                      'text-xs font-medium px-1.5 py-0.5 rounded transition-colors',
                      active
                        ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'
                        : 'text-stone-500 hover:text-stone-800 hover:bg-stone-100 dark:text-stone-400 dark:hover:text-stone-200 dark:hover:bg-stone-800',
                    )}
                  >
                    #{tag}
                  </Link>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function updateUrl(pathname: string, sp: URLSearchParams, updates: Record<string, string | null>): string {
  const params = new URLSearchParams(sp.toString())
  for (const [k, v] of Object.entries(updates)) {
    if (v === null || v === '') params.delete(k)
    else params.set(k, v)
  }
  const qs = params.toString()
  return qs ? `${pathname}?${qs}` : pathname
}

function searchAndFilterQs(sp: URLSearchParams): string {
  // Preserve search/view/priority/tag when switching between Board ↔ List.
  const keep = new URLSearchParams()
  for (const k of ['q', 'view', 'priority', 'tag']) {
    const v = sp.get(k)
    if (v) keep.set(k, v)
  }
  const qs = keep.toString()
  return qs ? `?${qs}` : ''
}
