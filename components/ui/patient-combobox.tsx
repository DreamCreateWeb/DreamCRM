'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { searchPatientsAction } from '@/app/(default)/patients/search-actions'
import type { PatientOption } from '@/lib/services/patients'

const SEARCH_DEBOUNCE_MS = 200

/**
 * THE patient picker for a field (the "+ New booking" drawer keeps its own
 * list-first layout). Server-side search by name / email / phone digits, so a
 * practice with thousands of charts can find anyone — a `<select>` of the
 * first 500 could not. aria recipe = the insurance PayerPicker's: a combobox
 * input controlling a listbox, arrow keys + Enter, Escape closes.
 *
 * Controlled by `value` (the chosen patient, or null). Picking calls
 * `onPick(option)`; the clear button calls `onPick(null)`.
 */
export default function PatientCombobox({
  id,
  value,
  onPick,
  excludeId,
  placeholder = 'Search by name, phone or email…',
  clearLabel = 'Clear',
  search = searchPatientsAction,
}: {
  id: string
  value: { id: string; name: string } | null
  onPick: (option: { id: string; name: string } | null) => void
  /** A patient that must not be offered (the record's own id for a guardian). */
  excludeId?: string
  placeholder?: string
  clearLabel?: string
  search?: (query: string) => Promise<PatientOption[]>
}) {
  const listId = useId()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PatientOption[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [error, setError] = useState<string | null>(null)
  const seq = useRef(0)

  useEffect(() => {
    if (!open) return
    const mine = ++seq.current
    const t = setTimeout(
      () => {
        // Never bare-await a server action in a client component: a redeploy
        // makes Next THROW. Promise chain + catch; only the latest answer lands.
        search(query)
          .then((rows) => {
            if (seq.current !== mine) return
            setError(null)
            setResults(excludeId ? rows.filter((r) => r.id !== excludeId) : rows)
            setActive(-1)
          })
          .catch(() => {
            if (seq.current !== mine) return
            setError('Could not search your patients — refresh and try again.')
          })
      },
      query.trim() ? SEARCH_DEBOUNCE_MS : 0,
    )
    return () => clearTimeout(t)
  }, [query, open, excludeId, search])

  function choose(p: PatientOption) {
    setOpen(false)
    setQuery('')
    onPick({ id: p.id, name: p.name })
  }

  if (value) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-[var(--r-sm)] border border-[color:var(--color-hairline)] px-3 py-2 mt-1.5">
        <span className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{value.name}</span>
        <button type="button" onClick={() => onPick(null)} className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline shrink-0">
          {clearLabel}
        </button>
      </div>
    )
  }

  const showList = open && results.length > 0
  return (
    <div className="relative mt-1.5">
      <input
        id={id}
        className="form-input w-full text-sm"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && showList) {
            e.preventDefault()
            setActive((a) => Math.min(a + 1, results.length - 1))
          } else if (e.key === 'ArrowUp' && showList) {
            e.preventDefault()
            setActive((a) => Math.max(a - 1, 0))
          } else if (e.key === 'Enter' && showList && active >= 0) {
            e.preventDefault()
            choose(results[active])
          } else if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={showList}
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
      />
      {error && <p className="mt-1 text-xs text-rose-700 dark:text-rose-300">{error}</p>}
      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Matching patients"
          className="pop-in absolute z-20 mt-1 w-full max-h-64 overflow-auto rounded-[var(--r-lg)] bg-[color:var(--color-surface-1)] p-1 shadow-[var(--shadow-pop)] text-sm"
        >
          {results.map((p, i) => (
            <li key={p.id} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(p)}
                className={`w-full text-left px-3 py-2 rounded-[var(--r-sm)] hover:bg-teal-500/5 flex items-baseline justify-between gap-3 ${i === active ? 'bg-teal-500/5' : ''}`}
              >
                <span className="text-gray-800 dark:text-gray-100">{p.name}</span>
                {p.hint && <span className="text-xs text-gray-500 dark:text-gray-400 font-mono-num truncate">{p.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
