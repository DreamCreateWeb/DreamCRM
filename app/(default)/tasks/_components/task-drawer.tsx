'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import Drawer from '@/components/ui/drawer'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { TASK_STATUSES, TASK_STATUS_LABEL, TASK_PRIORITIES } from '@/lib/types/tasks'
import {
  addSubtaskAction,
  editTask,
  moveTask,
  removeTasks,
  toggleSubtaskDone,
} from '../actions'

export interface TaskDrawerData {
  id: number
  title: string
  description: string | null
  status: string
  priority: string
  dueDate: string | null
  tags: string[]
  subtasks: { id: number; title: string; done: boolean }[]
  authorName: string | null
  createdAt: string
}

interface Props {
  task: TaskDrawerData | null
  onClose: () => void
}

const PRIORITY_DOT: Record<string, string> = {
  high: 'bg-rose-500',
  medium: 'bg-amber-500',
  low: 'bg-stone-400',
}

/**
 * Right-side drawer with full edit capability for a single task. Replaces
 * the "list view is read-only, kanban only has drag-and-drop" UX with a
 * dense single-screen editor: title, description, status, priority, due
 * date, tags, subtasks. All field-level mutations save inline (no global
 * Save button) so the user can fiddle without losing changes.
 */
export default function TaskDrawer({ task, onClose }: Props) {
  const router = useRouter()
  const confirm = useConfirm()
  const [pending, startTransition] = useTransition()
  const [title, setTitle] = useState('')
  const [titleDirty, setTitleDirty] = useState(false)
  const [description, setDescription] = useState('')
  const [descDirty, setDescDirty] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const [subtaskInput, setSubtaskInput] = useState('')

  useEffect(() => {
    if (!task) return
    setTitle(task.title)
    setTitleDirty(false)
    setDescription(task.description ?? '')
    setDescDirty(false)
    setTagInput('')
    setSubtaskInput('')
  }, [task])

  if (!task) return <Drawer open={false} onClose={onClose}>{null}</Drawer>

  // Capture into a const so closures keep the narrowed (non-null) type —
  // TS doesn't carry narrowing across the early return otherwise.
  const t = task
  const id = t.id

  function commit(patch: Record<string, unknown>) {
    startTransition(async () => {
      await editTask(id, patch)
      router.refresh()
    })
  }

  function handleStatusChange(next: string) {
    startTransition(async () => {
      await moveTask(id, next)
      router.refresh()
    })
  }

  function handleAddTag() {
    const tag = tagInput.trim().toLowerCase()
    if (!tag) return
    if (t.tags.includes(tag)) { setTagInput(''); return }
    commit({ tags: [...t.tags, tag] })
    setTagInput('')
  }

  function handleRemoveTag(tag: string) {
    commit({ tags: t.tags.filter((t) => t !== tag) })
  }

  async function handleDelete() {
    if (!(await confirm({ title: 'Delete this task?', message: 'This cannot be undone.', confirmLabel: 'Delete', danger: true }))) return
    startTransition(async () => {
      await removeTasks([id])
      onClose()
      router.refresh()
    })
  }

  function handleAddSubtask() {
    const v = subtaskInput.trim()
    if (!v) return
    startTransition(async () => {
      await addSubtaskAction(id, v)
      setSubtaskInput('')
      router.refresh()
    })
  }

  function handleToggleSubtask(sid: number) {
    startTransition(async () => {
      await toggleSubtaskDone(sid)
      router.refresh()
    })
  }

  return (
    <Drawer
      open
      onClose={onClose}
      size="md"
      title={
        <input
          type="text"
          value={title}
          onChange={(e) => { setTitle(e.target.value); setTitleDirty(true) }}
          onBlur={() => { if (titleDirty && title.trim()) { commit({ title: title.trim() }); setTitleDirty(false) } }}
          placeholder="Untitled task"
          className="w-full bg-transparent border-0 focus:outline-none focus:ring-0 text-sm font-medium text-stone-900 dark:text-stone-100 placeholder:text-stone-400"
        />
      }
      actions={
        <button
          onClick={handleDelete}
          disabled={pending}
          className="px-2 py-1 text-xs font-medium rounded-md text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:text-rose-400 dark:hover:text-rose-300 dark:hover:bg-rose-500/10 disabled:opacity-50"
        >
          Delete
        </button>
      }
    >
      <div className="px-5 py-4 space-y-5">
        {/* Status + Priority + Due date row */}
        <div className="grid grid-cols-3 gap-3">
          <Field label="Status">
            <select
              value={t.status}
              onChange={(e) => handleStatusChange(e.target.value)}
              className={inputClass}
            >
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>{TASK_STATUS_LABEL[s]}</option>
              ))}
            </select>
          </Field>
          <Field label="Priority">
            <div className="flex items-center gap-1">
              {TASK_PRIORITIES.map((p) => {
                const active = t.priority === p
                return (
                  <button
                    key={p}
                    onClick={() => commit({ priority: p })}
                    className={cn(
                      'flex-1 inline-flex items-center justify-center gap-1 text-xs font-medium px-1.5 py-1 rounded transition-colors',
                      active
                        ? 'bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100 ring-1 ring-stone-300 dark:ring-stone-600'
                        : 'text-stone-500 hover:text-stone-800 hover:bg-stone-50 dark:text-stone-400 dark:hover:text-stone-200 dark:hover:bg-stone-800/60',
                    )}
                  >
                    <span className={cn('w-1.5 h-1.5 rounded-full', PRIORITY_DOT[p])} />
                    {p[0].toUpperCase() + p.slice(1)}
                  </button>
                )
              })}
            </div>
          </Field>
          <Field label="Due">
            <input
              type="date"
              value={t.dueDate ? new Date(t.dueDate).toISOString().slice(0, 10) : ''}
              onChange={(e) => commit({ dueDate: e.target.value || null })}
              className={inputClass}
            />
          </Field>
        </div>

        {/* Tags */}
        <Field label="Tags">
          <div className="flex items-center gap-1 flex-wrap">
            {t.tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300"
              >
                #{t}
                <button
                  onClick={() => handleRemoveTag(t)}
                  className="text-stone-400 hover:text-stone-700 dark:hover:text-stone-100"
                  title="Remove tag"
                >
                  <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M6 6l12 12M6 18L18 6" strokeLinecap="round" />
                  </svg>
                </button>
              </span>
            ))}
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); handleAddTag() }
              }}
              onBlur={handleAddTag}
              placeholder={t.tags.length ? '+ tag' : 'Add tag…'}
              className="text-xs px-1.5 py-0.5 bg-transparent border-0 focus:outline-none focus:ring-0 w-20"
            />
          </div>
        </Field>

        {/* Description */}
        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => { setDescription(e.target.value); setDescDirty(true) }}
            onBlur={() => { if (descDirty) { commit({ description: description || null }); setDescDirty(false) } }}
            rows={4}
            placeholder="Add details, links, acceptance criteria…"
            className={cn(inputClass, 'resize-none')}
          />
        </Field>

        {/* Subtasks */}
        <div>
          <div className="text-xs uppercase tracking-wider text-stone-500 dark:text-stone-500 mb-1.5">
            Subtasks {t.subtasks.length > 0 && (
              <span className="text-stone-500 dark:text-stone-400 normal-case tracking-normal tabular-nums">
                · {t.subtasks.filter((s) => s.done).length} of {t.subtasks.length} done
              </span>
            )}
          </div>
          <div className="space-y-1">
            {t.subtasks.map((s) => (
              <label key={s.id} className="flex items-center gap-2 group rounded px-1 py-1 hover:bg-stone-50 dark:hover:bg-stone-800/40">
                <input
                  type="checkbox"
                  checked={s.done}
                  onChange={() => handleToggleSubtask(s.id)}
                  className="accent-stone-900 dark:accent-stone-100"
                />
                <span className={cn('text-sm', s.done ? 'text-stone-500 dark:text-stone-400 line-through' : 'text-stone-800 dark:text-stone-200')}>
                  {s.title}
                </span>
              </label>
            ))}
            <div className="flex items-center gap-1 mt-1">
              <input
                type="text"
                value={subtaskInput}
                onChange={(e) => setSubtaskInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddSubtask() } }}
                placeholder="Add a subtask and press Enter"
                className="grow text-xs px-2 py-1 rounded border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/40 focus:bg-white dark:focus:bg-stone-900 focus:outline-none placeholder:text-stone-400"
              />
            </div>
          </div>
        </div>

        {/* Metadata footer */}
        <div className="pt-3 border-t border-stone-200/60 dark:border-stone-700/40 text-xs text-stone-500 dark:text-stone-500 space-y-0.5">
          <div>Created by {t.authorName ?? 'unknown'}</div>
          <div>Created {new Date(t.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
        </div>
      </div>
    </Drawer>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-wider text-stone-500 dark:text-stone-500 mb-1">{label}</div>
      {children}
    </label>
  )
}

const inputClass =
  'w-full px-2 py-1 text-xs rounded border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800/40 text-stone-800 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-stone-900/10 dark:focus:ring-stone-100/10'
