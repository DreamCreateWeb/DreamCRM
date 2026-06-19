'use client'

import { useState, useTransition } from 'react'
import { TagChip } from '@/components/ui/tag-chip'
import AddTagPopover from '@/components/tags/add-tag-popover'
import type { PatientTagColor, PatientTagView } from '@/lib/types/patient-tags'
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
