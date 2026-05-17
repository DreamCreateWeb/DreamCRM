import { requireUser } from '@/lib/session'
import { db, schema } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { listTasks, TASK_STATUSES, TASK_STATUS_LABEL, type TaskStatus } from '@/lib/services/tasks'
import TasksGroups from './tasks-groups'
import TaskCard, { type TaskCardData } from './task-card'
import AddTaskButton from './add-task-button'

export const metadata = {
  title: 'Kanban - DreamCRM',
  description: 'Plan and track work across statuses',
}

export const dynamic = 'force-dynamic'

export default async function Kanban() {
  const me = await requireUser()
  const tasks = await listTasks()

  // resolve assignee names (single query keyed by id)
  const authorIds = Array.from(new Set(tasks.map((t) => t.createdBy).filter(Boolean) as string[]))
  let nameById = new Map<string, string>([[me.id, me.name ?? me.email]])
  if (authorIds.length) {
    const users = await db
      .select({ id: schema.user.id, name: schema.user.name })
      .from(schema.user)
    for (const u of users) nameById.set(u.id, u.name)
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
      likes: t.likes,
      comments: t.comments,
      attachments: t.attachments,
      authorName: t.createdBy ? nameById.get(t.createdBy) ?? null : null,
      refNumber: `#${t.id}`,
    })
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <div className="sm:flex sm:justify-between sm:items-center mb-8">
        <div className="mb-4 sm:mb-0">
          <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">Tasks</h1>
        </div>
        <div className="grid grid-flow-col sm:auto-cols-max justify-start sm:justify-end gap-2">
          <AddTaskButton label="Add Task" />
        </div>
      </div>

      <div className="grid grid-cols-12 gap-x-4 gap-y-8">
        {TASK_STATUSES.map((status) => (
          <TasksGroups key={status} title={TASK_STATUS_LABEL[status]} status={status}>
            {byStatus[status].length === 0 ? (
              <div className="text-xs text-gray-400 dark:text-gray-500 italic px-2 py-1">
                No tasks
              </div>
            ) : (
              byStatus[status].map((task) => <TaskCard key={task.id} task={task} />)
            )}
          </TasksGroups>
        ))}
      </div>
    </div>
  )
}
