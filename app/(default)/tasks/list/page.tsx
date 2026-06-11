import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { db, schema } from '@/lib/db'
import { inArray } from 'drizzle-orm'
import {
  listSubtasks,
  listTagsForOrg,
  listTasks,
  type SavedView,
  type TaskFilters,
  type TaskPriority,
} from '@/lib/services/tasks'
import AddTaskButton from '../kanban/add-task-button'
import FilterBar from '../_components/filter-bar'
import TaskListClient from './task-list-client'
import TasksTable, { type TasksTableRow } from './tasks-table'
import { PageHeader } from '@/components/ui/page-header'

export const metadata = {
  title: 'Tasks list - DreamCRM',
  description: 'Sortable, filterable task table',
}

export const dynamic = 'force-dynamic'

interface SP {
  view?: string
  q?: string
  priority?: string
  tag?: string
  t?: string
}

export default async function TasksList({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireTenant()
  // The generic Mosaic task list isn't part of the clinic nav — dental
  // followups live contextually across Overview/Patients/Appointments/Leads.
  // Send clinic tenants to the Overview; platform keeps the list. (/calendar.)
  if (ctx.tenantType === 'clinic') redirect('/')
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

  const rows: TasksTableRow[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    tags: t.tags,
    authorName: t.createdBy ? nameById.get(t.createdBy) ?? null : null,
    createdAt: t.createdAt.toISOString(),
  }))

  const selectedId = params.t ? Number(params.t) : null
  const selectedTask = selectedId ? tasks.find((t) => t.id === selectedId) : null
  const selectedSubtasks = selectedTask ? subsByTask.get(selectedTask.id) ?? [] : []

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 w-full max-w-[96rem] mx-auto">
      <PageHeader
        eyebrow="Platform · Dream Create"
        title="Tasks"
        subtitle="Plan and track work across statuses."
        actions={<AddTaskButton />}
      />

      <div className="mb-4">
        <FilterBar total={rows.length} tags={tags} layout="list" />
      </div>

      <TasksTable tasks={rows} />

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
