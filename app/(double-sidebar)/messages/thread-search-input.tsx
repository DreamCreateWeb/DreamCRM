'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

/**
 * Search-as-you-type over patient conversations. The server already filters
 * `listPatientThreads` by `?q=` (name / email / phone) — this is the input
 * that was missing to drive it. Debounced URL `replace` so a keystroke doesn't
 * stack history or fire a round-trip mid-word; preserves the active status /
 * assignment / unread filters and clears the open thread so the list refilters.
 */
export default function ThreadSearchInput({
  defaultQuery,
  status,
  assignedTo,
  unread,
}: {
  defaultQuery: string
  status?: string
  assignedTo?: string
  unread?: string
}) {
  const router = useRouter()
  const [value, setValue] = useState(defaultQuery)
  const firstRun = useRef(true)

  useEffect(() => {
    // Don't navigate on mount — the URL already reflects defaultQuery.
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    const t = setTimeout(() => {
      const sp = new URLSearchParams()
      if (status) sp.set('status', status)
      if (assignedTo) sp.set('assignedTo', assignedTo)
      if (unread) sp.set('unread', unread)
      const q = value.trim()
      if (q) sp.set('q', q)
      const qs = sp.toString()
      router.replace(`/messages${qs ? `?${qs}` : ''}`)
    }, 300)
    return () => clearTimeout(t)
  }, [value, status, assignedTo, unread, router])

  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.4-3.4" />
        </svg>
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search patients…"
        aria-label="Search patient conversations"
        className="w-full rounded-[var(--r-sm)] bg-[color:var(--color-surface-sunk)] py-1.5 pl-8 pr-7 text-sm text-gray-800 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 shadow-[inset_0_0_0_1px_var(--color-hairline)] transition-shadow focus:outline-none focus:shadow-[inset_0_0_0_1px_rgb(40_179_173/0.5)]"
      />
      {value && (
        <button
          type="button"
          onClick={() => setValue('')}
          aria-label="Clear search"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 transition-colors hover:text-gray-700 dark:hover:text-gray-200"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      )}
    </div>
  )
}
