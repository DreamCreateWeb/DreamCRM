'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { setMessageCategoryAction } from '../mailbox-actions'
import type { EmailCategory } from '@/lib/db/schema/email'

interface Props {
  messageId: string
  currentCategory: string | null
}

const CATEGORIES: Array<{
  value: EmailCategory
  label: string
  hint: string
  color: string
}> = [
  { value: 'primary', label: 'Primary', hint: 'Real correspondence', color: 'text-emerald-600' },
  { value: 'updates', label: 'Updates', hint: 'Automated / transactional', color: 'text-sky-600' },
  { value: 'promotions', label: 'Promotions', hint: 'Marketing / newsletters', color: 'text-amber-600' },
  { value: 'spam', label: 'Spam', hint: 'Junk / phishing', color: 'text-rose-600' },
]

/**
 * Toolbar dropdown that lets the user reclassify a thread into any
 * category. The choice is sticky — applies to the whole thread and
 * future replies inherit it. Hides the option that matches the
 * current category since "move to current" is a no-op.
 */
export default function MoveToMenu({ messageId, currentCategory }: Props) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  function move(category: EmailCategory) {
    setOpen(false)
    startTransition(async () => {
      try {
        await setMessageCategoryAction({ messageId, category })
        // Drop the active message id since the thread is no longer in
        // whatever tab we were just viewing — the sidebar list won't
        // include it and the right pane shouldn't pretend it's open.
        const params = new URLSearchParams(sp.toString())
        params.delete('m')
        const qs = params.toString()
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
        router.refresh()
      } catch (err) {
        console.warn('[inbox] move-to failed', err)
      }
    })
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] font-medium transition-colors text-stone-600 hover:text-stone-900 hover:bg-stone-100 dark:text-stone-300 dark:hover:text-stone-100 dark:hover:bg-stone-800',
          pending && 'opacity-50 cursor-wait',
        )}
        title="Move to a different category"
      >
        <svg className="w-[15px] h-[15px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M3 7l4-4h10a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M9 13l3 3 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Move
        <svg className="w-3 h-3 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 mt-1.5 w-64 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 shadow-lg z-30 overflow-hidden">
          <div className="px-3 py-2 text-[11px] uppercase tracking-wider text-stone-400 dark:text-stone-500 border-b border-stone-100 dark:border-stone-700/60">
            Move thread to
          </div>
          {CATEGORIES.map((c) => {
            const isCurrent = currentCategory === c.value
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => move(c.value)}
                disabled={isCurrent}
                className={cn(
                  'w-full text-left px-3 py-2 flex items-start gap-2.5 transition-colors',
                  isCurrent
                    ? 'opacity-50 cursor-default'
                    : 'hover:bg-stone-50 dark:hover:bg-stone-800/60',
                )}
              >
                <span className={cn('mt-0.5 w-2 h-2 rounded-full shrink-0 mt-1.5', c.color.replace('text-', 'bg-'))} />
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-stone-900 dark:text-stone-100">
                    {c.label}
                    {isCurrent && (
                      <span className="ml-1.5 text-[10px] font-normal text-stone-400 dark:text-stone-500">(current)</span>
                    )}
                  </div>
                  <div className="text-[11px] text-stone-500 dark:text-stone-400 leading-tight">
                    {c.hint}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
