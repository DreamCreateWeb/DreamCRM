'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { FlashToast } from '@/components/ui/flash-toast'

/** A saved view reduced to what the bar needs: a name + the query string that
 *  re-opens it (the host maps its surface's filter blob via that surface's
 *  `viewFiltersToQuery`). */
export interface SavedViewChip {
  id: string
  name: string
  query: string
}

const MAX_NAME_LEN = 60

/**
 * Generic saved-views bar for any list surface (appointments, leads, …). Renders
 * the saved views as one-click pills (active when their query matches the
 * current one), a delete affordance per pill, and a "Save view" control that
 * appears when the current filters are non-empty + unsaved. The host owns
 * persistence via the `onSave` / `onDelete` server actions; this is pure UI.
 *
 * The patients list keeps its own richer bar (tags / audience promotion); this
 * is the lean shared one for surfaces that just save + reopen filter combos.
 */
export default function SavedViewsBar({
  basePath,
  allLabel,
  views,
  currentQuery,
  isEmpty,
  isActiveSaved,
  suggestedName,
  onSave,
  onDelete,
}: {
  basePath: string
  allLabel: string
  views: SavedViewChip[]
  /** The current filters serialized to a query string (no leading "?"). */
  currentQuery: string
  /** Whether the current filters carry no constraint (hide "Save view"). */
  isEmpty: boolean
  /** True when the current query already matches a saved view (hide "Save"). */
  isActiveSaved: boolean
  /** Prefill for the name input (a description of the current filters). */
  suggestedName: string
  onSave: (name: string) => Promise<{ ok: true; view: SavedViewChip } | { ok: false; error: string }>
  onDelete: (id: string) => Promise<{ ok: true } | { ok: false; error: string }>
}) {
  const [list, setList] = useState<SavedViewChip[]>(views)
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function save() {
    const n = name.trim()
    if (!n) return
    startTransition(async () => {
      const res = await onSave(n)
      if (res.ok) {
        setList((cur) => {
          const rest = cur.filter((v) => v.id !== res.view.id && v.name.toLowerCase() !== res.view.name.toLowerCase())
          return [...rest, res.view].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
        })
        setNaming(false)
        setName('')
        setToast(`Saved “${res.view.name}”`)
      } else setToast(res.error)
    })
  }

  function remove(v: SavedViewChip) {
    const prev = list
    setList((cur) => cur.filter((x) => x.id !== v.id))
    startTransition(async () => {
      const res = await onDelete(v.id)
      if (!res.ok) { setList(prev); setToast(res.error) }
    })
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-medium text-gray-400 dark:text-gray-500 mr-0.5">Views:</span>

      <Link
        href={basePath}
        className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
          isEmpty
            ? 'bg-teal-500/10 text-teal-700 ring-1 ring-inset ring-teal-500/40 dark:text-teal-300'
            : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
        }`}
      >
        {allLabel}
      </Link>

      {list.map((v) => {
        const active = !isEmpty && v.query === currentQuery
        return (
          <span key={v.id} className="group relative inline-flex items-center">
            <Link
              href={v.query ? `${basePath}?${v.query}` : basePath}
              className={`rounded-full pl-2.5 pr-5 py-1 text-xs font-medium transition-colors ${
                active
                  ? 'bg-teal-500/10 text-teal-700 ring-1 ring-inset ring-teal-500/40 dark:text-teal-300'
                  : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
              }`}
            >
              {v.name}
            </Link>
            <button
              type="button"
              onClick={() => remove(v)}
              aria-label={`Delete view ${v.name}`}
              className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-300 opacity-0 group-hover:opacity-100 hover:text-rose-600 dark:text-gray-600 dark:hover:text-rose-400"
            >
              <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" /></svg>
            </button>
          </span>
        )
      })}

      {!isEmpty && !isActiveSaved && (
        naming ? (
          <span className="inline-flex items-center gap-1">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, MAX_NAME_LEN))}
              onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setNaming(false) }}
              placeholder="Name this view"
              className="form-input text-xs py-0.5 w-36"
            />
            <button type="button" onClick={save} disabled={pending} className="text-xs font-medium text-teal-700 dark:text-teal-400">Save</button>
            <button type="button" onClick={() => setNaming(false)} className="text-xs text-gray-400">Cancel</button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => { setNaming(true); setName(suggestedName.slice(0, MAX_NAME_LEN)) }}
            className="rounded-full px-2.5 py-1 text-xs font-medium text-teal-700 ring-1 ring-inset ring-teal-500/40 hover:bg-teal-500/10 dark:text-teal-300"
          >
            + Save view
          </button>
        )
      )}

      {toast && <FlashToast message={toast} onDone={() => setToast(null)} />}
    </div>
  )
}
