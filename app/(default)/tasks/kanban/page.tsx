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
import TasksGroups from './tasks-groups'
import TaskCard, { type TaskCardData } from './task-card'
import AddTaskButton from './add-task-button'
import FilterBar from '../_components/filter-bar'
import TaskListClient from '../list/task-list-client'

export const metadata = {
  title: 'Kanban - DreamCRM',
  description: 'Plan and track work across statuses',
}

export const dynamic = 'force-dynamic'

interface SP {
  view?: string
  q?: string
  priority?: string
  tag?: string
  t?: string
}

export default async function Kanban({ searchParams }: { searchParams: Promise<SP> }) {
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

  const byStatus: Record<TaskStatus, TaskCardData[]> = {
    todo: [],
    in_progress: [],
    completed: [],
    note: [],
  }
  for (const t of tasks) {
    byStatus[t.status].push({
      id: t.id,
      title: t.title,
      status: t.status,
      description: t.description,
      priority: t.priority,
      dueDate: t.dueDate ? t.dueDate.toISOString() : null,
      tags: t.tags,
      authorName: t.createdBy ? nameById.get(t.createdBy) ?? null : null,
    })
  }

  const selectedId = params.t ? Number(params.t) : null
  const selectedTask = selectedId ? tasks.find((t) => t.id === selectedId) : null
  const selectedSubtasks = selectedTask ? subsByTask.get(selectedTask.id) ?? [] : []

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 w-full max-w-[96rem] mx-auto">
      <div className="sm:flex sm:justify-between sm:items-center mb-4">
        <div className="mb-3 sm:mb-0">
          <h1 className="text-xl sm:text-2xl font-bold text-stone-900 dark:text-stone-100 tracking-tight">Tasks</h1>
        </div>
        <AddTaskButton label="Add Task" />
      </div>

      <div className="mb-4">
        <FilterBar total={tasks.length} tags={tags} layout="kanban" />
      </div>

      <div className="grid grid-cols-12 gap-x-3 gap-y-6">
        {TASK_STATUSES.map((status) => (
          <TasksGroups key={status} title={TASK_STATUS_LABEL[status]} status={status}>
            {byStatus[status].length === 0 ? (
              <div className="text-[11px] text-stone-400 dark:text-stone-500 italic px-1 py-1">
                No tasks
              </div>
            ) : (
              byStatus[status].map((task) => <TaskCard key={task.id} task={task} />)
            )}
          </TasksGroups>
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
