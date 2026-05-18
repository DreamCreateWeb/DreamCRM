'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { cn } from '@/lib/utils'
import { moveTask } from '../actions'
import type { TaskStatus } from '@/lib/types/tasks'
import DueDateChip from '../_components/due-date-chip'

interface Props {
  task: {
    id: number
    title: string
    status: TaskStatus
    priority: string
    dueDate: string | null
    tags: string[]
  }
}

const PRIORITY_DOT: Record<string, string> = {
  high: 'bg-rose-500',
  medium: 'bg-amber-500',
  low: 'bg-stone-400',
}

/**
 * Single row in the task list view. Click anywhere → opens the right
 * drawer for full edit. The checkbox short-circuits to a status toggle
 * without opening the drawer (most-frequent action, deserves to be cheap).
 */
export default function TaskListRow({ task }: Props) {
  const pathname = usePathname()
  const sp = useSearchParams()
  const [pending, startTransition] = useTransition()
  const isDone = task.status === 'completed'

  function toggleDone(e: React.MouseEvent | React.ChangeEvent) {
    e.stopPropagation()
    startTransition(async () => {
      await moveTask(task.id, isDone ? 'todo' : 'completed')
    })
  }

  const params = new URLSearchParams(sp.toString())
  params.set('t', String(task.id))
  const drawerHref = `${pathname}?${params.toString()}`

  return (
    <Link
      href={drawerHref}
      scroll={false}
      className={cn(
        'flex items-center gap-3 bg-white dark:bg-stone-900 rounded-lg border border-stone-200 dark:border-stone-700/60 px-3 py-2.5 hover:border-stone-300 dark:hover:border-stone-600 transition-colors',
      )}
    >
      <input
        type="checkbox"
        checked={isDone}
        disabled={pending}
        onClick={(e) => e.stopPropagation()}
        onChange={toggleDone}
        className="accent-stone-900 dark:accent-stone-100 w-4 h-4 shrink-0"
      />
      <span
        className={cn(
          'text-[13px] grow truncate',
          isDone
            ? 'text-stone-400 dark:text-stone-500 line-through'
            : 'text-stone-800 dark:text-stone-100',
        )}
      >
        {task.title}
      </span>
      <div className="flex items-center gap-1.5 shrink-0">
        {task.tags.slice(0, 2).map((t) => (
          <span
            key={t}
            className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300"
          >
            #{t}
          </span>
        ))}
        <span
          className={cn('w-1.5 h-1.5 rounded-full', PRIORITY_DOT[task.priority] ?? 'bg-stone-300')}
          title={`Priority: ${task.priority}`}
        />
        {task.dueDate && <DueDateChip dueDate={task.dueDate} completed={isDone} />}
      </div>
    </Link>
  )
}
