'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { cn } from '@/lib/utils'
import { moveTask } from '../actions'
import { TASK_STATUSES, TASK_STATUS_LABEL, type TaskStatus } from '@/lib/types/tasks'
import DueDateChip from '../_components/due-date-chip'

export interface TaskCardData {
  id: number
  title: string
  status: TaskStatus
  description: string | null
  priority: string
  dueDate: string | null
  tags: string[]
  authorName: string | null
}

const PRIORITY_DOT: Record<string, string> = {
  high: 'bg-rose-500',
  medium: 'bg-amber-500',
  low: 'bg-stone-400',
}

/**
 * Kanban card. Click the card body → opens the right detail drawer for
 * full edit. The status dropdown short-circuits to a status change without
 * opening the drawer — most-frequent action in kanban view stays cheap.
 * isDragging is passed by the dnd-kit DragOverlay clone to suppress
 * pointer-affordance styling on the floating preview.
 */
export default function TaskCard({ task, isDragging }: { task: TaskCardData; isDragging?: boolean }) {
  const pathname = usePathname()
  const sp = useSearchParams()
  const [pending, startTransition] = useTransition()
  const isDone = task.status === 'completed'

  function handleStatusChange(status: string, e: React.ChangeEvent) {
    e.stopPropagation()
    startTransition(async () => { await moveTask(task.id, status) })
  }

  const params = new URLSearchParams(sp.toString())
  params.set('t', String(task.id))
  const drawerHref = `${pathname}?${params.toString()}`

  return (
    <Link
      href={drawerHref}
      scroll={false}
      onClick={(e) => {
        // While dragging, dnd-kit fires pointer events that look like
        // clicks — suppress navigation so the drawer doesn't open on drop.
        if (isDragging) e.preventDefault()
      }}
      className={cn(
        'block bg-white dark:bg-stone-900 rounded-lg border border-stone-200 dark:border-stone-700/60 p-3 transition-colors',
        isDragging ? 'cursor-grabbing' : 'hover:border-stone-300 dark:hover:border-stone-600 cursor-grab',
      )}
    >
      <div className="flex items-start gap-2 mb-2">
        <span
          className={cn('w-1.5 h-1.5 rounded-full mt-1.5 shrink-0', PRIORITY_DOT[task.priority] ?? 'bg-stone-300')}
          title={`Priority: ${task.priority}`}
        />
        <div className="min-w-0 grow">
          <h3 className={cn('font-medium text-[13px] leading-snug', isDone ? 'text-stone-400 dark:text-stone-500 line-through' : 'text-stone-900 dark:text-stone-100')}>
            {task.title}
          </h3>
          {task.description && (
            <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-1 line-clamp-2">{task.description}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {task.tags.slice(0, 3).map((t) => (
          <span
            key={t}
            className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300"
          >
            #{t}
          </span>
        ))}
        {task.dueDate && <DueDateChip dueDate={task.dueDate} completed={isDone} size="xs" />}
        <select
          className="ml-auto text-[10px] px-1 py-0.5 rounded border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-300 cursor-pointer hover:border-stone-300 dark:hover:border-stone-600"
          value={task.status}
          disabled={pending}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => handleStatusChange(e.target.value, e)}
          title="Change status"
        >
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s}>{TASK_STATUS_LABEL[s]}</option>
          ))}
        </select>
      </div>
    </Link>
  )
}
