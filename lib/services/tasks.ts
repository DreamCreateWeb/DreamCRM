import 'server-only'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '@/lib/db'
import { TASK_STATUSES, TASK_STATUS_LABEL, type TaskStatus } from '@/lib/types/tasks'

export { TASK_STATUSES, TASK_STATUS_LABEL, type TaskStatus }

export const TaskInput = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  status: z.enum(TASK_STATUSES).default('todo'),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  assigneeId: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
})
export const TaskUpdate = TaskInput.partial()

export async function listTasks() {
  return db
    .select()
    .from(schema.tasks)
    .orderBy(asc(schema.tasks.position), asc(schema.tasks.createdAt))
}

export async function listSubtasks(taskIds: number[]) {
  if (!taskIds.length) return []
  return db
    .select()
    .from(schema.subtasks)
    .where(inArray(schema.subtasks.taskId, taskIds))
    .orderBy(asc(schema.subtasks.position))
}

export async function createTask(input: z.infer<typeof TaskInput>, userId: string) {
  const data = TaskInput.parse(input)
  const [{ maxPos }] = await db
    .select({ maxPos: sql<number>`coalesce(max(${schema.tasks.position}), 0)::int` })
    .from(schema.tasks)
    .where(eq(schema.tasks.status, data.status))

  const [row] = await db
    .insert(schema.tasks)
    .values({
      title: data.title,
      description: data.description ?? null,
      status: data.status,
      priority: data.priority,
      assigneeId: data.assigneeId ?? null,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      createdBy: userId,
      position: (maxPos ?? 0) + 1,
    })
    .returning()
  return row
}

export async function updateTaskStatus(id: number, status: TaskStatus) {
  const [row] = await db
    .update(schema.tasks)
    .set({ status, updatedAt: new Date() })
    .where(eq(schema.tasks.id, id))
    .returning()
  return row
}

export async function updateTask(id: number, input: z.infer<typeof TaskUpdate>) {
  const data = TaskUpdate.parse(input)
  const [row] = await db
    .update(schema.tasks)
    .set({
      ...data,
      dueDate: data.dueDate ? new Date(data.dueDate) : data.dueDate === null ? null : undefined,
      updatedAt: new Date(),
    })
    .where(eq(schema.tasks.id, id))
    .returning()
  return row
}

export async function toggleSubtask(id: number) {
  const [row] = await db
    .update(schema.subtasks)
    .set({ done: sql`not ${schema.subtasks.done}` })
    .where(eq(schema.subtasks.id, id))
    .returning()
  return row
}

export async function addSubtask(taskId: number, title: string) {
  const [row] = await db.insert(schema.subtasks).values({ taskId, title }).returning()
  return row
}

export async function deleteTasks(ids: number[]) {
  if (!ids.length) return { deleted: 0 }
  const rows = await db.delete(schema.tasks).where(inArray(schema.tasks.id, ids)).returning({ id: schema.tasks.id })
  return { deleted: rows.length }
}

export async function likeTask(id: number) {
  const [row] = await db
    .update(schema.tasks)
    .set({ likes: sql`${schema.tasks.likes} + 1` })
    .where(eq(schema.tasks.id, id))
    .returning({ id: schema.tasks.id, likes: schema.tasks.likes })
  return row
}
