'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { PipelineStage } from '@/lib/marketing/terminology'
import type { AudienceFilterT } from '@/lib/services/marketing'
import {
  createAudienceAction,
  deleteAudienceAction,
  previewAudienceAction,
  updateAudienceAction,
} from '../actions'

export interface AudienceRow {
  id: number
  name: string
  description: string | null
  filter: AudienceFilterT
  recipientCount: number
}

interface Props {
  initial: AudienceRow[]
  stages: PipelineStage[]
  sources: string[]
}

export default function AudiencesClient({ initial, stages, sources }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState<AudienceRow | 'new' | null>(null)
  const [pending, startTransition] = useTransition()

  function handleDelete(id: number) {
    if (!confirm('Delete this audience? Campaigns referencing it will lose their target list.')) return
    startTransition(async () => {
      await deleteAudienceAction(id)
      router.refresh()
    })
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <button
          onClick={() => setEditing('new')}
          className="text-sm font-medium px-3 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-white dark:bg-stone-100 dark:hover:bg-stone-200 dark:text-stone-900"
        >
          + New audience
        </button>
      </div>

      {initial.length === 0 ? (
        <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 p-10 text-center">
          <p className="text-sm text-stone-400 dark:text-stone-500 italic">
            No saved segments yet. Audiences let you slice the pipeline into reusable
            recipient lists for campaign sends.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {initial.map((a) => (
            <div
              key={a.id}
              className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 p-4"
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <h3 className="font-semibold text-sm text-stone-900 dark:text-stone-100">
                  {a.name}
                </h3>
                <span className="text-[11px] font-medium text-stone-500 dark:text-stone-400 shrink-0 tabular-nums">
                  {a.recipientCount} {a.recipientCount === 1 ? 'recipient' : 'recipients'}
                </span>
              </div>
              {a.description && (
                <p className="text-[12px] text-stone-500 dark:text-stone-400 mb-2">
                  {a.description}
                </p>
              )}
              <FilterChips filter={a.filter} stages={stages} />
              <div className="flex justify-end gap-2 mt-3 pt-3 border-t border-stone-100 dark:border-stone-700/40">
                <button
                  onClick={() => setEditing(a)}
                  className="text-[11px] font-medium px-2 py-1 rounded-md text-stone-600 hover:text-stone-900 hover:bg-stone-100 dark:text-stone-300 dark:hover:text-stone-100 dark:hover:bg-stone-700"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(a.id)}
                  disabled={pending}
                  className="text-[11px] font-medium px-2 py-1 rounded-md text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10 disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing !== null && (
        <AudienceEditor
          audience={editing === 'new' ? null : editing}
          stages={stages}
          sources={sources}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            router.refresh()
          }}
        />
      )}
    </>
  )
}

function FilterChips({ filter, stages }: { filter: AudienceFilterT; stages: PipelineStage[] }) {
  const chips: string[] = []
  if (filter.stages?.length) {
    chips.push(
      `Stage: ${filter.stages
        .map((k) => stages.find((s) => s.key === k)?.label ?? k)
        .join(', ')}`,
    )
  }
  if (filter.sources?.length) chips.push(`Source: ${filter.sources.join(', ')}`)
  if (filter.lifecycleStages?.length) chips.push(`Lifecycle: ${filter.lifecycleStages.join(', ')}`)
  if (filter.lastActivityWithinDays != null) {
    chips.push(
      filter.lastActivityWithinDays >= 0
        ? `Active last ${filter.lastActivityWithinDays}d`
        : `Inactive ≥ ${Math.abs(filter.lastActivityWithinDays)}d`,
    )
  }
  if (chips.length === 0) chips.push('All non-opted-out contacts')
  return (
    <div className="flex flex-wrap gap-1">
      {chips.map((c, i) => (
        <span
          key={i}
          className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300"
        >
          {c}
        </span>
      ))}
    </div>
  )
}

function AudienceEditor({
  audience,
  stages,
  sources,
  onClose,
  onSaved,
}: {
  audience: AudienceRow | null
  stages: PipelineStage[]
  sources: string[]
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(audience?.name ?? '')
  const [description, setDescription] = useState(audience?.description ?? '')
  const [filter, setFilter] = useState<AudienceFilterT>(audience?.filter ?? {})
  const [preview, setPreview] = useState<{ count: number; sample: { name: string; email: string }[] } | null>(null)
  const [pending, startTransition] = useTransition()

  function refreshPreview() {
    startTransition(async () => {
      const p = await previewAudienceAction(filter)
      setPreview(p)
    })
  }

  function toggleStage(key: string) {
    setFilter((f) => {
      const cur = new Set(f.stages ?? [])
      if (cur.has(key)) cur.delete(key)
      else cur.add(key)
      return { ...f, stages: Array.from(cur) }
    })
  }
  function toggleSource(key: string) {
    setFilter((f) => {
      const cur = new Set(f.sources ?? [])
      if (cur.has(key)) cur.delete(key)
      else cur.add(key)
      return { ...f, sources: Array.from(cur) }
    })
  }

  function save() {
    startTransition(async () => {
      if (audience) {
        await updateAudienceAction(audience.id, {
          name,
          description: description || null,
          filter,
        })
      } else {
        await createAudienceAction({ name, description: description || null, filter })
      }
      onSaved()
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-stone-900/40 dark:bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-stone-900 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-stone-200 dark:border-stone-700/60 sticky top-0 bg-white/95 dark:bg-stone-900/95 backdrop-blur">
          <h2 className="text-base font-semibold text-stone-800 dark:text-stone-100">
            {audience ? 'Edit audience' : 'New audience'}
          </h2>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400 block mb-1">
              Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Trial users week 1"
              className="w-full text-sm px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400 block mb-1">
              Description (optional)
            </label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this segment is used for"
              className="w-full text-sm px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800"
            />
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400 block mb-2">
              Pipeline stages
            </label>
            <div className="flex flex-wrap gap-1.5">
              {stages.map((s) => {
                const on = filter.stages?.includes(s.key) ?? false
                return (
                  <button
                    key={s.key}
                    onClick={() => toggleStage(s.key)}
                    className={
                      on
                        ? 'text-[11px] font-medium px-2 py-1 rounded-md bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'
                        : 'text-[11px] font-medium px-2 py-1 rounded-md bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700'
                    }
                  >
                    {s.label}
                  </button>
                )
              })}
            </div>
            <p className="text-[10px] text-stone-400 dark:text-stone-500 mt-1">
              Empty = all stages
            </p>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400 block mb-2">
              Sources
            </label>
            <div className="flex flex-wrap gap-1.5">
              {sources.map((s) => {
                const on = filter.sources?.includes(s) ?? false
                return (
                  <button
                    key={s}
                    onClick={() => toggleSource(s)}
                    className={
                      on
                        ? 'text-[11px] font-medium px-2 py-1 rounded-md bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'
                        : 'text-[11px] font-medium px-2 py-1 rounded-md bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700'
                    }
                  >
                    {s}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400 block mb-1">
              Activity window
            </label>
            <select
              value={filter.lastActivityWithinDays?.toString() ?? ''}
              onChange={(e) => {
                const v = e.target.value
                setFilter((f) => ({
                  ...f,
                  lastActivityWithinDays: v === '' ? undefined : Number(v),
                }))
              }}
              className="w-full text-sm px-2 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800"
            >
              <option value="">Any</option>
              <option value="7">Active in last 7 days</option>
              <option value="30">Active in last 30 days</option>
              <option value="90">Active in last 90 days</option>
              <option value="-30">Inactive ≥ 30 days</option>
              <option value="-90">Inactive ≥ 90 days</option>
            </select>
          </div>

          <div className="bg-stone-50 dark:bg-stone-800/50 rounded-lg p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[11px] font-semibold text-stone-700 dark:text-stone-200">
                Preview
              </span>
              <button
                onClick={refreshPreview}
                disabled={pending}
                className="text-[11px] font-medium px-2 py-1 rounded-md bg-white dark:bg-stone-700 text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-600 disabled:opacity-50"
              >
                Refresh
              </button>
            </div>
            {preview ? (
              <>
                <p className="text-[13px] font-semibold text-stone-800 dark:text-stone-100">
                  {preview.count} {preview.count === 1 ? 'recipient' : 'recipients'}
                </p>
                {preview.sample.length > 0 && (
                  <ul className="text-[11px] text-stone-500 dark:text-stone-400 mt-1 space-y-0.5">
                    {preview.sample.map((s, i) => (
                      <li key={i}>{s.name} · {s.email}</li>
                    ))}
                    {preview.count > preview.sample.length && (
                      <li className="text-stone-400 dark:text-stone-500 italic">
                        … and {preview.count - preview.sample.length} more
                      </li>
                    )}
                  </ul>
                )}
              </>
            ) : (
              <p className="text-[11px] text-stone-400 dark:text-stone-500 italic">
                Click Refresh to see who's in this audience.
              </p>
            )}
          </div>
        </div>
        <div className="px-5 py-3 border-t border-stone-200 dark:border-stone-700/60 flex justify-end gap-2 sticky bottom-0 bg-white dark:bg-stone-900">
          <button
            onClick={onClose}
            disabled={pending}
            className="text-sm font-medium px-3 py-1.5 rounded-lg text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-700"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={pending || !name.trim()}
            className="text-sm font-medium px-3 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-white dark:bg-stone-100 dark:hover:bg-stone-200 dark:text-stone-900 disabled:opacity-50"
          >
            {pending ? 'Saving…' : audience ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
