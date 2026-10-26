'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { SearchInput } from '@/components/ui/search-input'

/**
 * Search-as-you-type over patient conversations. The server already filters
 * `listPatientThreads` by `?q=` (name / email / phone) — this is the input
 * that was missing to drive it. Debounced URL `replace` so a keystroke doesn't
 * stack history or fire a round-trip mid-word.
 *
 * It preserves EVERY active filter the page carries (`baseParams` is the
 * page's own searchParams, the same object `buildHref` spreads), and drops
 * exactly two keys on purpose: `thread` (the list refilters, so the open
 * conversation may no longer be in it) and `show` (a new search starts at page
 * one). The first cut rebuilt the URL from a hand-picked trio — status /
 * assignedTo / unread — so typing a name while on ★ Starred quietly navigated
 * to an unstarred list while the chip still looked active.
 */

/** Keys a fresh search never carries forward. */
const RESET_ON_SEARCH = new Set(['thread', 'show', 'q'])

export default function ThreadSearchInput({
  defaultQuery,
  baseParams,
}: {
  defaultQuery: string
  /** The page's current querystring (status / assignedTo / unread / starred /
   *  show / thread / q …). Everything but the reset keys is kept verbatim. */
  baseParams: Record<string, string | undefined>
}) {
  const router = useRouter()
  const [value, setValue] = useState(defaultQuery)
  const firstRun = useRef(true)
  // A stable key for the effect: the server hands a fresh object every render,
  // and depending on its identity would re-fire a navigation per render.
  const baseKey = JSON.stringify(
    Object.entries(baseParams)
      .filter(([k, v]) => !RESET_ON_SEARCH.has(k) && !!v)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  )

  useEffect(() => {
    // Don't navigate on mount — the URL already reflects defaultQuery.
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    const t = setTimeout(() => {
      const sp = new URLSearchParams()
      for (const [k, v] of JSON.parse(baseKey) as Array<[string, string]>) sp.set(k, v)
      const q = value.trim()
      if (q) sp.set('q', q)
      const qs = sp.toString()
      router.replace(`/messages${qs ? `?${qs}` : ''}`)
    }, 300)
    return () => clearTimeout(t)
  }, [value, baseKey, router])

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
