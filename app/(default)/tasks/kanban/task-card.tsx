'use client'

import { useTransition } from 'react'
import { likeTaskAction, moveTask, removeTasks } from '../actions'
import { TASK_STATUSES, TASK_STATUS_LABEL, type TaskStatus } from '@/lib/services/tasks'

export interface TaskCardData {
  id: number
  title: string
  status: TaskStatus
  description: string | null
  priority: string
  likes: number
  comments: number
  attachments: number
  authorName: string | null
  refNumber: string
}

export default function TaskCard({ task }: { task: TaskCardData }) {
  const [pending, startTransition] = useTransition()

  function handleStatusChange(status: string) {
    startTransition(async () => {
      await moveTask(task.id, status)
    })
  }
  function handleLike() {
    startTransition(async () => {
      await likeTaskAction(task.id)
    })
  }
  function handleDelete() {
    if (!confirm(`Delete task "${task.title}"?`)) return
    startTransition(async () => {
      await removeTasks([task.id])
    })
  }

  return (
    <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-4">
      <div className="mb-3">
        <h2 className="font-semibold text-gray-800 dark:text-gray-100 mb-1">{task.title}</h2>
        {task.description && (
          <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2">{task.description}</p>
        )}
        <div className="text-sm mt-1">
          {task.refNumber}
          {task.authorName ? (
            <>
              {' '}created by <span className="font-medium text-gray-800 dark:text-gray-200">{task.authorName}</span>
            </>
          ) : null}
        </div>
      </div>
      <div className="flex items-center justify-between">
        <select
          className="text-xs form-select py-1 pr-7 pl-2"
          value={task.status}
          disabled={pending}
          onChange={(e) => handleStatusChange(e.target.value)}
        >
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s}>{TASK_STATUS_LABEL[s]}</option>
          ))}
        </select>
        <div className="flex items-center">
          <button
            onClick={handleLike}
            disabled={pending}
            className="flex items-center text-gray-400 dark:text-gray-500 hover:text-violet-500 ml-3 disabled:opacity-60"
          >
            <svg className="shrink-0 fill-current mr-1.5" width="16" height="16" viewBox="0 0 16 16">
              <path d="M14.682 2.318A4.485 4.485 0 0011.5 1 4.377 4.377 0 008 2.707 4.383 4.383 0 004.5 1a4.5 4.5 0 00-3.182 7.682L8 15l6.682-6.318a4.5 4.5 0 000-6.364zm-1.4 4.933L8 12.247l-5.285-5A2.5 2.5 0 014.5 3c1.437 0 2.312.681 3.5 2.625C9.187 3.681 10.062 3 11.5 3a2.5 2.5 0 011.785 4.251h-.003z" />
            </svg>
            <div className="text-sm text-gray-500 dark:text-gray-400">{task.likes}</div>
          </button>
          <div className="flex items-center text-gray-400 dark:text-gray-500 ml-3">
            <svg className="shrink-0 fill-current mr-1.5" width="16" height="16" viewBox="0 0 16 16">
              <path d="M8 0C3.6 0 0 3.1 0 7s3.6 7 8 7h.6l5.4 2v-4.4c1.2-1.2 2-2.8 2-4.6 0-3.9-3.6-7-8-7z" />
            </svg>
            <div className="text-sm">{task.comments}</div>
          </div>
          <button
            type="button"
            onClick={handleDelete}
            disabled={pending}
            title="Delete task"
            className="text-red-400 hover:text-red-500 ml-3 disabled:opacity-60"
          >
            <svg className="shrink-0 fill-current" width="16" height="16" viewBox="0 0 16 16">
              <path d="M5 7h6v6H5zM13 4h-3V2H6v2H3v1h10z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
