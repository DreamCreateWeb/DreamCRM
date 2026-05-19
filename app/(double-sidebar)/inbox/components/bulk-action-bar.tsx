'use client'

import { useTransition } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { bulkMessageAction } from '../mailbox-actions'
import { useSelection } from './selection-context'

interface Props {
  visibleIds: string[]
}

/**
 * Sticky toolbar that appears above the inbox when one or more messages
 * are selected via the row checkbox. Sits at the top of the viewport
 * floating over both the message list and the message detail pane.
 */
export default function BulkActionBar({ visibleIds }: Props) {
  const { selected, selectAll, clear, count } = useSelection()
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()

  if (count === 0) return null

  const ids = Array.from(selected)
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id))

  function run(action: 'archive' | 'trash' | 'mark_read' | 'mark_unread' | 'star' | 'unstar') {
    startTransition(async () => {
      try {
        await bulkMessageAction({ ids, action })
        // If the currently-open message was bulk-archived/trashed, drop the
        // m= param so the right pane doesn't try to render a stale message.
        const activeM = sp.get('m')
        if (activeM && (action === 'archive' || action === 'trash') && selected.has(activeM)) {
          const params = new URLSearchParams(sp.toString())
          params.delete('m')
          const qs = params.toString()
          router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
        }
        clear()
        router.refresh()
      } catch (err) {
        console.warn('[inbox] bulk action failed', err)
      }
    })
  }

  return (
    <div className="sticky top-16 z-30 px-3 pt-2">
      <div className="mx-auto max-w-7xl rounded-xl border border-stone-200 dark:border-stone-700/60 bg-white/95 dark:bg-stone-900/95 backdrop-blur shadow-sm flex items-center gap-1 px-2 py-1.5">
        <button
          type="button"
          onClick={clear}
          className="p-1.5 rounded-md text-stone-500 hover:text-stone-900 hover:bg-stone-100 dark:hover:bg-stone-800 dark:hover:text-stone-100"
          title="Clear selection (Esc)"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" />
          </svg>
        </button>
        <div className="text-[13px] font-medium text-stone-900 dark:text-stone-100 px-2 tabular-nums">
          {count} selected
        </div>
        <button
          type="button"
          onClick={() => selectAll(visibleIds)}
          className="text-[11px] font-medium text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100 px-2 py-1 rounded-md hover:bg-stone-100 dark:hover:bg-stone-800"
        >
          {allVisibleSelected ? 'Deselect all' : `Select all ${visibleIds.length}`}
        </button>
        <div className="w-px h-5 bg-stone-200 dark:bg-stone-700 mx-1" />
        <BarButton onClick={() => run('archive')} pending={pending} label="Archive">
          <svg className="w-[15px] h-[15px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <rect x="3" y="4" width="18" height="4" rx="1" />
            <path d="M5 8v11a1 1 0 001 1h12a1 1 0 001-1V8M10 12h4" strokeLinecap="round" />
          </svg>
        </BarButton>
        <BarButton onClick={() => run('trash')} pending={pending} label="Trash">
          <svg className="w-[15px] h-[15px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M4 7h16M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3M6 7l1 13a2 2 0 002 2h6a2 2 0 002-2l1-13" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </BarButton>
        <BarButton onClick={() => run('mark_read')} pending={pending} label="Read">
          <svg className="w-[15px] h-[15px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <circle cx="12" cy="12" r="3.5" />
            <path d="M3 8l9 6 9-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </BarButton>
        <BarButton onClick={() => run('mark_unread')} pending={pending} label="Unread">
          <svg className="w-[15px] h-[15px]" viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <circle cx="12" cy="12" r="4.5" />
          </svg>
        </BarButton>
        <BarButton onClick={() => run('star')} pending={pending} label="Star">
          <svg className="w-[15px] h-[15px] text-amber-500" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 17.3l-6.18 3.7 1.64-7.03L2 9.24l7.19-.61L12 2l2.81 6.63 7.19.61-5.46 4.73 1.64 7.03z" />
          </svg>
        </BarButton>
      </div>
    </div>
  )
}

function BarButton({
  children,
  onClick,
  pending,
  label,
}: {
  children: React.ReactNode
  onClick: () => void
  pending: boolean
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      title={label}
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] font-medium text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors',
        pending && 'opacity-50 cursor-wait',
      )}
    >
      {children}
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}
