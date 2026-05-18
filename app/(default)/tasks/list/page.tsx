import { requireTenant } from '@/lib/auth/context'
import { db, schema } from '@/lib/db'
import { inArray } from 'drizzle-orm'
import {
  listSubtasks,
  listTagsForOrg,
  listTasks,
  TASK_STATUSES,
  TASK_STATUS_LABEL,
  type SavedView,
  type TaskFilters,
  type TaskPriority,
  type TaskStatus,
} from '@/lib/services/tasks'
import AddTaskButton from '../kanban/add-task-button'
import FilterBar from '../_components/filter-bar'
import TaskListRow from './task-list-row'
import TaskListClient from './task-list-client'

export const metadata = {
  title: 'Tasks list - DreamCRM',
  description: 'Linear task list grouped by status',
}

export const dynamic = 'force-dynamic'

interface SP {
  view?: string
  q?: string
  priority?: string
  tag?: string
  t?: string // selected task id
}

export default async function TasksList({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireTenant()
  const params = await searchParams

  const filters: TaskFilters = {
    view: (params.view as SavedView) || undefined,
    search: params.q,
    priority: params.priority ? [params.priority as TaskPriority] : undefined,
    tag: params.tag,
    currentUserId: ctx.userId,
  }

  const [tasks, tags] = await Promise.all([
    listTasks(ctx.organizationId, filters),
    listTagsForOrg(ctx.organizationId),
  ])
  const subtasks = await listSubtasks(tasks.map((t) => t.id))

  // Build per-task author name (most rows share the platform admin).
  const authorIds = Array.from(new Set(tasks.map((t) => t.createdBy).filter(Boolean) as string[]))
  const nameById = new Map<string, string>([[ctx.userId, ctx.userName ?? ctx.userEmail]])
  if (authorIds.length) {
    const users = await db
      .select({ id: schema.user.id, name: schema.user.name })
      .from(schema.user)
      .where(inArray(schema.user.id, authorIds))
    for (const u of users) nameById.set(u.id, u.name)
  }

  const subsByTask = new Map<number, typeof subtasks>()
  for (const s of subtasks) {
    const arr = subsByTask.get(s.taskId) ?? []
    arr.push(s)
    subsByTask.set(s.taskId, arr)
  }

  const grouped: Record<TaskStatus, typeof tasks> = {
    todo: [],
    in_progress: [],
    completed: [],
    note: [],
  }
  for (const t of tasks) grouped[t.status].push(t)

  // Build the full task payload the drawer needs for whichever task the URL
  // points at — done server-side so the drawer renders with content on
  // first paint instead of flashing empty.
  const selectedId = params.t ? Number(params.t) : null
  const selectedTask = selectedId ? tasks.find((t) => t.id === selectedId) : null
  const selectedSubtasks = selectedTask ? subsByTask.get(selectedTask.id) ?? [] : []

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 w-full max-w-[96rem] mx-auto">
      <div className="sm:flex sm:justify-between sm:items-center mb-4">
        <div className="mb-3 sm:mb-0">
          <h1 className="text-xl sm:text-2xl font-bold text-stone-900 dark:text-stone-100 tracking-tight">Tasks</h1>
        </div>
        <AddTaskButton />
      </div>

      <div className="mb-4">
        <FilterBar total={tasks.length} tags={tags} layout="list" />
      </div>

      <div className="space-y-5">
        {TASK_STATUSES.map((status) => (
          <div key={status}>
            <h2 className="text-[12px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400 mb-2 px-1">
              {TASK_STATUS_LABEL[status]}{' '}
              <span className="text-stone-400 dark:text-stone-500 ml-1 tabular-nums">{grouped[status].length}</span>
            </h2>
            <div className="space-y-1">
              {grouped[status].length === 0 ? (
                <div className="bg-white dark:bg-stone-900 rounded-lg border border-stone-200 dark:border-stone-700/60 p-3 text-[12px] text-stone-400 dark:text-stone-500 italic">
                  Nothing here
                </div>
              ) : (
                grouped[status].map((task) => (
                  <TaskListRow
                    key={task.id}
                    task={{
                      id: task.id,
                      title: task.title,
                      status: task.status,
                      priority: task.priority,
                      dueDate: task.dueDate ? task.dueDate.toISOString() : null,
                      tags: task.tags,
                    }}
                  />
                ))
              )}
            </div>
          </div>
        ))}
      </div>

      <TaskListClient
        task={
          selectedTask
            ? {
                id: selectedTask.id,
                title: selectedTask.title,
                description: selectedTask.description,
                status: selectedTask.status,
                priority: selectedTask.priority,
                dueDate: selectedTask.dueDate ? selectedTask.dueDate.toISOString() : null,
                tags: selectedTask.tags,
                subtasks: selectedSubtasks.map((s) => ({ id: s.id, title: s.title, done: s.done })),
                authorName: selectedTask.createdBy ? nameById.get(selectedTask.createdBy) ?? null : null,
                createdAt: selectedTask.createdAt.toISOString(),
              }
            : null
        }
      />
    </div>
  )
}
