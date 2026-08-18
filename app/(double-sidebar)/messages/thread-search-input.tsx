'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { SearchInput } from '@/components/ui/search-input'

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

  // Renders the shared primitive (this file's markup was the recipe it was
  // extracted from); the debounced URL-replace stays here.
  return (
    <SearchInput
      value={value}
      onChange={setValue}
      onClear={() => setValue('')}
      placeholder="Search patients…"
      ariaLabel="Search patient conversations"
    />
  )
}
