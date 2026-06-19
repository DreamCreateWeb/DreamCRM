'use client'

import { useState, useRef, useEffect } from 'react'
import {
  PATIENT_TAG_COLORS,
  TAG_DOT_CLASSES,
  MAX_TAG_NAME_LEN,
  type PatientTagColor,
  type PatientTagView,
} from '@/lib/types/patient-tags'

/**
 * Find-or-create tag picker popover. Shared by the patient-detail TagsPanel and
 * the drop-in PatientTagControl (appointment drawer, message thread) so "add a
 * tag" looks + behaves identically everywhere. Closes on outside-click.
 */
export default function AddTagPopover({
  available,
  loading = false,
  align = 'right',
  onPick,
  onCreate,
  onClose,
}: {
  available: PatientTagView[]
  /** Catalog still loading (lazy surfaces) — show a calm hint instead of "no match". */
  loading?: boolean
  align?: 'left' | 'right'
  onPick: (t: PatientTagView) => void
  onCreate: (name: string, color: PatientTagColor) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [color, setColor] = useState<PatientTagColor>('teal')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [onClose])

  const q = query.trim().toLowerCase()
  const matches = available.filter((t) => t.name.toLowerCase().includes(q))
  const exact = available.some((t) => t.name.toLowerCase() === q)
  const canCreate = q.length > 0 && !exact

  return (
    <div
      ref={ref}
      className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} z-20 mt-1 w-60 rounded-lg border border-[color:var(--color-hairline)] bg-white dark:bg-gray-800 shadow-lg p-2`}
    >
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value.slice(0, MAX_TAG_NAME_LEN))}
        placeholder="Find or create a tag…"
        className="w-full text-xs rounded-md border border-gray-200 dark:border-gray-700 bg-transparent px-2 py-1.5 outline-none focus:ring-1 focus:ring-teal-500/50"
      />

      <div className="mt-2 max-h-44 overflow-y-auto">
        {matches.length > 0 && (
          <ul className="space-y-0.5">
            {matches.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => onPick(t)}
                  className="w-full flex items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-gray-50 dark:hover:bg-gray-700/40"
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${TAG_DOT_CLASSES[t.color]}`} aria-hidden="true" />
                  <span className="text-xs text-gray-700 dark:text-gray-200 truncate">{t.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {matches.length === 0 && !canCreate && (
          <p className="px-1.5 py-2 text-[11px] text-gray-400 dark:text-gray-500">
            {loading ? 'Loading tags…' : available.length === 0 ? 'No more tags to add.' : 'No match.'}
          </p>
        )}
      </div>

      {canCreate && (
        <div className="mt-2 border-t border-[color:var(--color-hairline)] pt-2">
          <div className="flex items-center gap-1 mb-1.5">
            {PATIENT_TAG_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`${c} color`}
                onClick={() => setColor(c)}
                className={`h-4 w-4 rounded-full ${TAG_DOT_CLASSES[c]} ${
                  color === c ? 'ring-2 ring-offset-1 ring-gray-400 dark:ring-offset-gray-800' : ''
                }`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => onCreate(query.trim(), color)}
            className="w-full text-xs font-medium text-left rounded px-1.5 py-1 text-teal-700 hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-teal-950/40"
          >
            Create &ldquo;{query.trim()}&rdquo;
          </button>
        </div>
      )}
    </div>
  )
}
