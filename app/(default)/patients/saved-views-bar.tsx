'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { FlashToast } from '@/components/ui/flash-toast'
import {
  viewFiltersToQuery,
  isEmptyViewFilters,
  describeViewFilters,
  MAX_VIEW_NAME_LEN,
  type PatientViewRow,
  type SavedViewFilters,
} from '@/lib/types/patient-views'
import { addDaysYmd, todayYmd, MAX_FOLLOWUP_TITLE_LEN } from '@/lib/types/followups'
import type { PatientTagView } from '@/lib/types/patient-tags'
import {
  createPatientViewAction,
  deletePatientViewAction,
  promoteFiltersToAudienceAction,
  bulkFollowupForFilteredAction,
  bulkTagForFilteredAction,
} from './actions'

/**
 * Saved-views bar above the patient list. Each view is a one-click named filter
 * combo (shared across the team). When the current filters are active + unsaved,
 * a "Save view" affordance appears; a saved or current segment can be promoted
 * straight into a marketing audience (premium) → opens the campaign composer.
 */
export default function SavedViewsBar({
  views,
  current,
  tags,
  matchCount,
  canMarket,
}: {
  views: PatientViewRow[]
  current: SavedViewFilters
  /** Org tag catalog — for the chip descriptions + the "Tag all" picker. */
  tags: PatientTagView[]
  /** How many patients the current filter matches (the bulk-action scope). */
  matchCount: number
  canMarket: boolean
}) {
  const router = useRouter()
  const [list, setList] = useState<PatientViewRow[]>(views)
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [followingUp, setFollowingUp] = useState(false)
  const [pending, startTransition] = useTransition()

  const currentQuery = viewFiltersToQuery(current)
  const empty = isEmptyViewFilters(current)
  const activeView = list.find((v) => viewFiltersToQuery(v.filters) === currentQuery)
  const tagMap = new Map(tags.map((t) => [t.id, t.name]))

  function bulkTag(tagId: string) {
    if (!tagId) return
    startTransition(async () => {
      const res = await bulkTagForFilteredAction(current, tagId)
      if (!res.ok) { setToast(res.error); return }
      const tag = tags.find((t) => t.id === tagId)
      setToast(`Tagged ${res.assigned} ${res.assigned === 1 ? 'patient' : 'patients'}${tag ? ` · ${tag.name}` : ''}`)
      router.refresh()
    })
  }
  function bulkFollowup(title: string, dueDate: string) {
    if (!title.trim()) return
    startTransition(async () => {
      const res = await bulkFollowupForFilteredAction(current, { title, dueDate: dueDate || null })
      if (!res.ok) { setToast(res.error); return }
      setFollowingUp(false)
      setToast(`Added a follow-up for ${res.created} ${res.created === 1 ? 'patient' : 'patients'}`)
    })
  }

  function saveView() {
    const n = name.trim()
    if (!n) return
    startTransition(async () => {
      const res = await createPatientViewAction(n, current)
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

  function remove(v: PatientViewRow) {
    setList((cur) => cur.filter((x) => x.id !== v.id))
    startTransition(async () => {
      const res = await deletePatientViewAction(v.id)
      if (!res.ok) { setList(views); setToast(res.error) }
    })
  }

  function promote() {
    const suggested = activeView?.name ?? describeViewFilters(current, tagMap)
    const audienceName = window.prompt('Name this audience', suggested)?.trim()
    if (!audienceName) return
    startTransition(async () => {
      const res = await promoteFiltersToAudienceAction(audienceName, current)
      if (!res.ok) { setToast(res.error); return }
      const note = res.dropped.length ? ` (${res.dropped.join(' + ')} not applied)` : ''
      setToast(`Audience created${note} — opening composer…`)
      router.push(`/growth/campaigns?prefill_audience=${res.audienceId}`)
    })
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-medium text-gray-400 dark:text-gray-500 mr-0.5">Views:</span>

      <Link
        href="/patients"
        className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
          empty
            ? 'bg-teal-500/10 text-teal-700 ring-1 ring-inset ring-teal-500/40 dark:text-teal-300'
            : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
        }`}
      >
        All patients
      </Link>

      {list.map((v) => {
        const active = activeView?.id === v.id
        return (
          <span key={v.id} className="group relative inline-flex items-center">
            <Link
              href={`/patients?${viewFiltersToQuery(v.filters)}`}
              title={describeViewFilters(v.filters, tagMap)}
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

      {/* Save the current (unsaved, non-empty) filter combo */}
      {!empty && !activeView && (
        naming ? (
          <span className="inline-flex items-center gap-1">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, MAX_VIEW_NAME_LEN))}
              onKeyDown={(e) => { if (e.key === 'Enter') saveView(); if (e.key === 'Escape') setNaming(false) }}
              placeholder="Name this view"
              className="form-input text-xs py-0.5 w-36"
            />
            <button type="button" onClick={saveView} disabled={pending} className="text-xs font-medium text-teal-700 dark:text-teal-400">Save</button>
            <button type="button" onClick={() => setNaming(false)} className="text-xs text-gray-400">Cancel</button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => { setNaming(true); setName(describeViewFilters(current, tagMap).slice(0, MAX_VIEW_NAME_LEN)) }}
            className="rounded-full px-2.5 py-1 text-xs font-medium text-teal-700 ring-1 ring-inset ring-teal-500/40 hover:bg-teal-500/10 dark:text-teal-300"
          >
            + Save view
          </button>
        )
      )}

      {/* ── Launchpad: act on everyone matching the current view ──────── */}
      {!empty && matchCount > 0 && (
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {matchCount} {matchCount === 1 ? 'match' : 'matches'} ·
          </span>

          {/* Follow-up all */}
          {followingUp ? (
            <BulkFollowupInline
              count={matchCount}
              onSubmit={bulkFollowup}
              onCancel={() => setFollowingUp(false)}
              pending={pending}
            />
          ) : (
            <button
              type="button"
              onClick={() => setFollowingUp(true)}
              disabled={pending}
              className="rounded-full px-2.5 py-1 text-xs font-medium text-teal-700 ring-1 ring-inset ring-teal-500/40 hover:bg-teal-500/10 dark:text-teal-300"
            >
              ☑ Follow-up all
            </button>
          )}

          {/* Tag all */}
          {tags.length > 0 && !followingUp && (
            <select
              value=""
              onChange={(e) => { bulkTag(e.target.value); e.target.value = '' }}
              disabled={pending}
              aria-label="Tag everyone matching this view"
              className="form-select text-xs py-1 rounded-full"
            >
              <option value="">🏷 Tag all…</option>
              {tags.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          )}

          {/* Promote into a sendable audience (premium) */}
          {canMarket && !followingUp && (
            <button
              type="button"
              onClick={promote}
              disabled={pending}
              title="Create a marketing audience from these filters and open the campaign composer"
              className="rounded-full px-2.5 py-1 text-xs font-medium text-violet-700 ring-1 ring-inset ring-violet-400/50 hover:bg-violet-500/10 dark:text-violet-300"
            >
              ✦ Send a campaign
            </button>
          )}
        </div>
      )}

      {toast && <FlashToast message={toast} onDone={() => setToast(null)} />}
    </div>
  )
}

function BulkFollowupInline({
  count,
  onSubmit,
  onCancel,
  pending,
}: {
  count: number
  onSubmit: (title: string, dueDate: string) => void
  onCancel: () => void
  pending: boolean
}) {
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState(addDaysYmd(todayYmd(), 3))
  return (
    <span className="inline-flex items-center gap-1 rounded-lg border border-teal-500/40 bg-teal-500/[0.03] px-1.5 py-1">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value.slice(0, MAX_FOLLOWUP_TITLE_LEN))}
        onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(title, dueDate); if (e.key === 'Escape') onCancel() }}
        placeholder={`Follow-up for all ${count}…`}
        className="form-input text-xs py-0.5 w-44"
      />
      <input
        type="date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        className="form-input text-xs py-0.5"
        aria-label="Due date"
      />
      <button type="button" onClick={() => onSubmit(title, dueDate)} disabled={pending} className="text-xs font-medium text-teal-700 dark:text-teal-400 px-1">Add</button>
      <button type="button" onClick={onCancel} className="text-xs text-gray-400 px-0.5">Cancel</button>
    </span>
  )
}
