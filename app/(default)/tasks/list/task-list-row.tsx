'use client'

import { useTransition } from 'react'
import { likeTaskAction, moveTask, removeTasks } from '../actions'
import type { TaskStatus } from '@/lib/types/tasks'

interface Props {
  task: {
    id: number
    title: string
    status: TaskStatus
    likes: number
    comments: number
  }
}

export default function TaskListRow({ task }: Props) {
  const [pending, startTransition] = useTransition()
  const isDone = task.status === 'completed'

  function toggleDone() {
    startTransition(async () => {
      await moveTask(task.id, isDone ? 'todo' : 'completed')
    })
  }
  function handleLike() {
    startTransition(async () => {
      await likeTaskAction(task.id)
    })
  }
  function handleDelete() {
    if (!confirm(`Delete "${task.title}"?`)) return
    startTransition(async () => {
      await removeTasks([task.id])
    })
  }

  return (
    <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-4">
      <div className="sm:flex sm:justify-between sm:items-start">
        <div className="grow mt-0.5 mb-3 sm:mb-0 space-y-3">
          <label className="flex items-center">
            <input
              type="checkbox"
              className="form-checkbox w-5 h-5 rounded-full peer"
              checked={isDone}
              disabled={pending}
              onChange={toggleDone}
            />
            <span
              className={`font-medium ml-2 ${
                isDone
                  ? 'text-gray-400 line-through'
                  : 'text-gray-800 dark:text-gray-100'
              }`}
            >
              {task.title}
            </span>
          </label>
        </div>
        <div className="flex items-center justify-end space-x-3">
          <button
            onClick={handleLike}
            disabled={pending}
            className="flex items-center text-gray-400 dark:text-gray-500 hover:text-violet-500 disabled:opacity-60"
          >
            <svg className="shrink-0 fill-current mr-1.5" width="16" height="16" viewBox="0 0 16 16">
              <path d="M14.682 2.318A4.485 4.485 0 0011.5 1 4.377 4.377 0 008 2.707 4.383 4.383 0 004.5 1a4.5 4.5 0 00-3.182 7.682L8 15l6.682-6.318a4.5 4.5 0 000-6.364z" />
            </svg>
            <div className="text-sm">{task.likes}</div>
          </button>
          <div className="flex items-center text-gray-400 dark:text-gray-500">
            <svg className="shrink-0 fill-current mr-1.5" width="16" height="16" viewBox="0 0 16 16">
              <path d="M8 0C3.6 0 0 3.1 0 7s3.6 7 8 7h.6l5.4 2v-4.4c1.2-1.2 2-2.8 2-4.6 0-3.9-3.6-7-8-7z" />
            </svg>
            <div className="text-sm">{task.comments}</div>
          </div>
          <button
            onClick={handleDelete}
            disabled={pending}
            className="text-red-400 hover:text-red-500 disabled:opacity-60"
            title="Delete task"
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
