'use client'

import { useState, useRef, useEffect, useTransition } from 'react'
import { TagChip } from '@/components/ui/tag-chip'
import {
  PATIENT_TAG_COLORS,
  TAG_DOT_CLASSES,
  MAX_TAG_NAME_LEN,
  type PatientTagColor,
  type PatientTagView,
} from '@/lib/types/patient-tags'
import {
  assignPatientTagAction,
  unassignPatientTagAction,
  createPatientTagAction,
} from '../actions'

/**
 * Tags editor on the patient detail (identity rail). Shows the patient's tags as
 * removable chips + an "Add tag" popover that picks an existing catalog tag or
 * creates a new one inline. Optimistic, with revert-on-error. Mirrors the
 * notes-panel server-action pattern.
 */
export default function TagsPanel({
  patientId,
  initialTags,
  catalog,
}: {
  patientId: string
  initialTags: PatientTagView[]
  catalog: PatientTagView[]
}) {
  const [tags, setTags] = useState<PatientTagView[]>(initialTags)
  const [allTags, setAllTags] = useState<PatientTagView[]>(catalog)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const tagIds = new Set(tags.map((t) => t.id))
  const available = allTags.filter((t) => !tagIds.has(t.id))

  function add(tag: PatientTagView) {
    setError(null)
    setTags((cur) => (cur.some((t) => t.id === tag.id) ? cur : [...cur, tag].sort(byName)))
    startTransition(async () => {
      const res = await assignPatientTagAction(patientId, tag.id)
      if (!res.ok) {
        setTags((cur) => cur.filter((t) => t.id !== tag.id))
        setError(res.error)
      }
    })
  }

  function remove(tagId: string) {
    setError(null)
    const prev = tags
    setTags((cur) => cur.filter((t) => t.id !== tagId))
    startTransition(async () => {
      const res = await unassignPatientTagAction(patientId, tagId)
      if (!res.ok) {
        setTags(prev)
        setError(res.error)
      }
    })
  }

  function createAndAdd(name: string, color: PatientTagColor) {
    setError(null)
    startTransition(async () => {
      const res = await createPatientTagAction(name, color)
      if (!res.ok) {
        setError(res.error)
        return
      }
      // Add to the catalog (dedupe — create is idempotent) then assign.
      setAllTags((cur) => (cur.some((t) => t.id === res.tag.id) ? cur : [...cur, res.tag].sort(byName)))
      add(res.tag)
      setOpen(false)
    })
  }

  return (
    <div className="v2-card px-4 py-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Tags</h2>
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="text-xs font-medium text-teal-700 hover:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300"
          >
            + Add
          </button>
          {open && (
            <AddTagPopover
              available={available}
              onPick={(t) => {
                add(t)
                setOpen(false)
              }}
              onCreate={createAndAdd}
              onClose={() => setOpen(false)}
            />
          )}
        </div>
      </div>

      {tags.length === 0 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          No tags yet. Use tags to group patients (VIP, anxious, follow-up) and target outreach.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <TagChip key={t.id} name={t.name} color={t.color} onRemove={() => remove(t.id)} />
          ))}
        </div>
      )}
      {error && <p className="mt-2 text-[11px] text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  )
}

function byName(a: PatientTagView, b: PatientTagView) {
  return a.name.toLowerCase().localeCompare(b.name.toLowerCase())
}

function AddTagPopover({
  available,
  onPick,
  onCreate,
  onClose,
}: {
  available: PatientTagView[]
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
      className="absolute right-0 z-20 mt-1 w-60 rounded-lg border border-[color:var(--color-hairline)] bg-white dark:bg-gray-800 shadow-lg p-2"
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
            {available.length === 0 ? 'No more tags to add.' : 'No match.'}
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
            Create “{query.trim()}”
          </button>
        </div>
      )}
    </div>
  )
}
