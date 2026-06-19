'use client'

import { useState, useTransition } from 'react'
import { TagChip } from '@/components/ui/tag-chip'
import AddTagPopover from '@/components/tags/add-tag-popover'
import type { PatientTagColor, PatientTagView } from '@/lib/types/patient-tags'
import {
  listTagCatalogAction,
  assignPatientTagAction,
  unassignPatientTagAction,
  createPatientTagAction,
} from '@/app/(default)/patients/actions'

/**
 * Drop-in "tags for this patient" control — the tag analogue of FollowupQuickAdd.
 * Shows the patient's tags as removable chips plus a "+ Tag" find-or-create
 * picker, so any patient-scoped surface (appointment drawer, message thread, …)
 * can apply a tag without navigating to the patient record. The catalog is
 * lazy-loaded the first time the picker opens, so hosts pass only the patient's
 * current tags (which they usually already have). Optimistic; reverts on error.
 *
 * Tags applied here flow straight into the targeting loop already wired:
 * list filter → saved view → audience → campaign.
 */
export default function PatientTagControl({
  patientId,
  initialTags,
  size = 'xs',
  triggerLabel = '+ Tag',
  onChanged,
}: {
  patientId: string
  initialTags: PatientTagView[]
  size?: 'xs' | 'sm'
  triggerLabel?: string
  /** Notified with the new tag list after any add/remove (host sync). */
  onChanged?: (tags: PatientTagView[]) => void
}) {
  const [tags, setTags] = useState<PatientTagView[]>(initialTags)
  const [catalog, setCatalog] = useState<PatientTagView[] | null>(null)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const tagIds = new Set(tags.map((t) => t.id))
  const available = (catalog ?? []).filter((t) => !tagIds.has(t.id))

  function sync(next: PatientTagView[]) {
    setTags(next)
    onChanged?.(next)
  }

  function openPicker() {
    setError(null)
    setOpen(true)
    // Lazy-load the catalog the first time the picker opens.
    if (catalog === null) {
      startTransition(async () => {
        try {
          setCatalog(await listTagCatalogAction())
        } catch {
          setCatalog([])
        }
      })
    }
  }

  function add(tag: PatientTagView) {
    setError(null)
    if (tagIds.has(tag.id)) return
    const next = [...tags, tag].sort(byName)
    sync(next)
    startTransition(async () => {
      const res = await assignPatientTagAction(patientId, tag.id)
      if (!res.ok) { sync(tags); setError(res.error) }
    })
  }

  function remove(tagId: string) {
    setError(null)
    const prev = tags
    sync(tags.filter((t) => t.id !== tagId))
    startTransition(async () => {
      const res = await unassignPatientTagAction(patientId, tagId)
      if (!res.ok) { sync(prev); setError(res.error) }
    })
  }

  function createAndAdd(name: string, color: PatientTagColor) {
    setError(null)
    startTransition(async () => {
      const res = await createPatientTagAction(name, color)
      if (!res.ok) { setError(res.error); return }
      setCatalog((cur) => {
        const list = cur ?? []
        return list.some((t) => t.id === res.tag.id) ? list : [...list, res.tag].sort(byName)
      })
      add(res.tag)
      setOpen(false)
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((t) => (
        <TagChip key={t.id} name={t.name} color={t.color} size={size} onRemove={() => remove(t.id)} />
      ))}
      <div className="relative">
        <button
          type="button"
          onClick={() => (open ? setOpen(false) : openPicker())}
          aria-expanded={open}
          className="rounded-md px-1.5 py-0.5 text-xs font-medium text-teal-700 hover:bg-teal-500/10 dark:text-teal-400"
        >
          {triggerLabel}
        </button>
        {open && (
          <AddTagPopover
            available={available}
            loading={catalog === null}
            align="left"
            onPick={(t) => { add(t); setOpen(false) }}
            onCreate={createAndAdd}
            onClose={() => setOpen(false)}
          />
        )}
      </div>
      {error && <span className="text-[11px] text-rose-600 dark:text-rose-400">{error}</span>}
    </div>
  )
}

function byName(a: PatientTagView, b: PatientTagView) {
  return a.name.toLowerCase().localeCompare(b.name.toLowerCase())
}
