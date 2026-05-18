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

/**
 * List tasks for the given organization. Every task is org-scoped;
 * cross-tenant reads are impossible by design. Pre-migration-0007 there
 * were legacy NULL-org rows — the data migration backfills them to the
 * platform org id.
 */
export async function listTasks(organizationId: string) {
  return db
    .select()
    .from(schema.tasks)
    .where(eq(schema.tasks.organizationId, organizationId))
    .orderBy(asc(schema.tasks.position), asc(schema.tasks.createdAt))
}

/**
 * List subtasks for a set of parent task ids. Org isolation comes from the
 * parent task — subtasks have no org id themselves (FK cascade handles
 * cleanup). Caller is responsible for ensuring `taskIds` belong to their
 * org; in practice callers feed in ids returned from `listTasks(orgId)`.
 */
export async function listSubtasks(taskIds: number[]) {
  if (!taskIds.length) return []
  return db
    .select()
    .from(schema.subtasks)
    .where(inArray(schema.subtasks.taskId, taskIds))
    .orderBy(asc(schema.subtasks.position))
}

export async function createTask(
  input: z.infer<typeof TaskInput>,
  opts: { userId: string; organizationId: string },
) {
  const data = TaskInput.parse(input)
  const [{ maxPos }] = await db
    .select({ maxPos: sql<number>`coalesce(max(${schema.tasks.position}), 0)::int` })
    .from(schema.tasks)
    .where(
      and(
        eq(schema.tasks.organizationId, opts.organizationId),
        eq(schema.tasks.status, data.status),
      ),
    )

  const [row] = await db
    .insert(schema.tasks)
    .values({
      title: data.title,
      description: data.description ?? null,
      status: data.status,
      priority: data.priority,
      assigneeId: data.assigneeId ?? null,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      createdBy: opts.userId,
      organizationId: opts.organizationId,
      position: (maxPos ?? 0) + 1,
    })
    .returning()
  return row
}

export async function updateTaskStatus(id: number, status: TaskStatus, organizationId: string) {
  const [row] = await db
    .update(schema.tasks)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(schema.tasks.id, id), eq(schema.tasks.organizationId, organizationId)))
    .returning()
  return row
}

export async function updateTask(id: number, input: z.infer<typeof TaskUpdate>, organizationId: string) {
  const data = TaskUpdate.parse(input)
  const [row] = await db
    .update(schema.tasks)
    .set({
      ...data,
      dueDate: data.dueDate ? new Date(data.dueDate) : data.dueDate === null ? null : undefined,
      updatedAt: new Date(),
    })
    .where(and(eq(schema.tasks.id, id), eq(schema.tasks.organizationId, organizationId)))
    .returning()
  return row
}

/**
 * Toggle a subtask done flag. Verifies the subtask's parent task belongs to
 * the given org before mutating, so a malicious client can't flip
 * cross-tenant subtasks by guessing ids.
 */
export async function toggleSubtask(id: number, organizationId: string) {
  const [parent] = await db
    .select({ taskId: schema.subtasks.taskId })
    .from(schema.subtasks)
    .innerJoin(schema.tasks, eq(schema.tasks.id, schema.subtasks.taskId))
    .where(and(eq(schema.subtasks.id, id), eq(schema.tasks.organizationId, organizationId)))
    .limit(1)
  if (!parent) return null
  const [row] = await db
    .update(schema.subtasks)
    .set({ done: sql`not ${schema.subtasks.done}` })
    .where(eq(schema.subtasks.id, id))
    .returning()
  return row
}

export async function addSubtask(taskId: number, title: string, organizationId: string) {
  // Verify parent task belongs to this org.
  const [parent] = await db
    .select({ id: schema.tasks.id })
    .from(schema.tasks)
    .where(and(eq(schema.tasks.id, taskId), eq(schema.tasks.organizationId, organizationId)))
    .limit(1)
  if (!parent) throw new Error('Task not found')
  const [row] = await db.insert(schema.subtasks).values({ taskId, title }).returning()
  return row
}

export async function deleteTasks(ids: number[], organizationId: string) {
  if (!ids.length) return { deleted: 0 }
  const rows = await db
    .delete(schema.tasks)
    .where(and(inArray(schema.tasks.id, ids), eq(schema.tasks.organizationId, organizationId)))
    .returning({ id: schema.tasks.id })
  return { deleted: rows.length }
}

export async function likeTask(id: number, organizationId: string) {
  const [row] = await db
    .update(schema.tasks)
    .set({ likes: sql`${schema.tasks.likes} + 1` })
    .where(and(eq(schema.tasks.id, id), eq(schema.tasks.organizationId, organizationId)))
    .returning({ id: schema.tasks.id, likes: schema.tasks.likes })
  return row
}
