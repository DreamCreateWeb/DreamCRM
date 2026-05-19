import 'server-only'
import { and, asc, eq, gte, inArray, lte, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '@/lib/db'
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_STATUS_LABEL,
  type TaskPriority,
  type TaskStatus,
} from '@/lib/types/tasks'

export { TASK_PRIORITIES, TASK_STATUSES, TASK_STATUS_LABEL, type TaskPriority, type TaskStatus }

export const TaskInput = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  status: z.enum(TASK_STATUSES).default('todo'),
  priority: z.enum(TASK_PRIORITIES).default('medium'),
  assigneeId: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
})
export const TaskUpdate = TaskInput.partial()

/**
 * Built-in saved views the inbox-style filter bar exposes as quick chips.
 * URL-driven (`?view=overdue`); each one is a server-side filter recipe that
 * `listTasks` turns into a WHERE clause.
 */
export type SavedView = 'all' | 'today' | 'this_week' | 'overdue' | 'mine' | 'completed'

export interface TaskFilters {
  view?: SavedView
  search?: string
  status?: TaskStatus[]
  priority?: TaskPriority[]
  tag?: string
  assigneeId?: string | null
  /** "Mine" view scope-fills assigneeId/createdBy from the caller. */
  currentUserId?: string
}

/**
 * List tasks for the given organization, optionally narrowed by saved-view
 * + filter combination. Every task is org-scoped; cross-tenant reads are
 * impossible by design.
 */
export async function listTasks(organizationId: string, filters: TaskFilters = {}) {
  const conditions = [eq(schema.tasks.organizationId, organizationId)]

  // Saved-view shortcuts compose with explicit filters.
  if (filters.view === 'today') {
    const start = startOfDay(new Date())
    const end = endOfDay(new Date())
    conditions.push(gte(schema.tasks.dueDate, start))
    conditions.push(lte(schema.tasks.dueDate, end))
  } else if (filters.view === 'this_week') {
    const start = startOfDay(new Date())
    const end = endOfDay(addDays(new Date(), 7))
    conditions.push(gte(schema.tasks.dueDate, start))
    conditions.push(lte(schema.tasks.dueDate, end))
  } else if (filters.view === 'overdue') {
    conditions.push(lte(schema.tasks.dueDate, new Date()))
    // Don't show completed tasks as "overdue" — they're done.
    conditions.push(sql`${schema.tasks.status} <> 'completed'`)
  } else if (filters.view === 'completed') {
    conditions.push(eq(schema.tasks.status, 'completed'))
  } else if (filters.view === 'mine' && filters.currentUserId) {
    conditions.push(
      or(
        eq(schema.tasks.assigneeId, filters.currentUserId),
        eq(schema.tasks.createdBy, filters.currentUserId),
      )!,
    )
  }

  if (filters.search && filters.search.trim()) {
    const q = `%${filters.search.trim().toLowerCase()}%`
    conditions.push(
      or(
        sql`lower(${schema.tasks.title}) like ${q}`,
        sql`lower(coalesce(${schema.tasks.description}, '')) like ${q}`,
      )!,
    )
  }

  if (filters.status && filters.status.length) {
    conditions.push(inArray(schema.tasks.status, filters.status))
  }
  if (filters.priority && filters.priority.length) {
    conditions.push(inArray(schema.tasks.priority, filters.priority))
  }
  if (filters.tag) {
    // jsonb @> matches when the array contains the given element.
    conditions.push(sql`${schema.tasks.tags} @> ${JSON.stringify([filters.tag])}::jsonb`)
  }
  if (filters.assigneeId !== undefined && filters.assigneeId !== null) {
    conditions.push(eq(schema.tasks.assigneeId, filters.assigneeId))
  }

  return db
    .select()
    .from(schema.tasks)
    .where(and(...conditions))
    .orderBy(asc(schema.tasks.position), asc(schema.tasks.createdAt))
}

/**
 * Distinct tag list for an org — drives the filter-bar tag chips.
 */
export async function listTagsForOrg(organizationId: string): Promise<string[]> {
  const rows = await db.execute<{ tag: string }>(sql`
    SELECT DISTINCT jsonb_array_elements_text(tags) AS tag
    FROM tasks
    WHERE organization_id = ${organizationId}
    ORDER BY tag
  `)
  const list = Array.isArray(rows) ? rows : (rows as { rows?: { tag: string }[] }).rows ?? []
  return list.map((r) => r.tag).filter(Boolean)
}

function startOfDay(d: Date): Date {
  const r = new Date(d); r.setHours(0, 0, 0, 0); return r
}
function endOfDay(d: Date): Date {
  const r = new Date(d); r.setHours(23, 59, 59, 999); return r
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r
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
      tags: data.tags ?? [],
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

/**
 * Move a task to `newStatus` at `newIndex` and renumber positions in the
 * affected column(s). Used by the kanban drag-and-drop:
 *
 * - Cross-column drag: rewrites the source column's positions (after
 *   removal) and the destination column's positions (after insertion).
 * - Within-column drag: rewrites just that column.
 *
 * Simpler than fractional indices and totally fine for the realistic
 * column sizes (< a few hundred). Idempotent — drop-on-self is a no-op.
 */
export async function reorderTask(
  id: number,
  newStatus: TaskStatus,
  newIndex: number,
  organizationId: string,
) {
  // Load the moved task to learn its current status.
  const [moved] = await db
    .select({ id: schema.tasks.id, status: schema.tasks.status })
    .from(schema.tasks)
    .where(and(eq(schema.tasks.id, id), eq(schema.tasks.organizationId, organizationId)))
    .limit(1)
  if (!moved) throw new Error('Task not found')

  const oldStatus = moved.status
  const crossColumn = oldStatus !== newStatus

  // Helper: fetch the ordered ids of a status column for this org.
  async function orderedIds(status: TaskStatus): Promise<number[]> {
    const rows = await db
      .select({ id: schema.tasks.id })
      .from(schema.tasks)
      .where(
        and(
          eq(schema.tasks.organizationId, organizationId),
          eq(schema.tasks.status, status),
        ),
      )
      .orderBy(asc(schema.tasks.position), asc(schema.tasks.createdAt))
    return rows.map((r) => r.id)
  }

  // Build the destination column's new ordering.
  let destIds = await orderedIds(newStatus)
  destIds = destIds.filter((tid) => tid !== id) // remove if already present
  const clampedIndex = Math.max(0, Math.min(newIndex, destIds.length))
  destIds.splice(clampedIndex, 0, id)

  // Write the destination column.
  await db.transaction(async (tx) => {
    if (crossColumn) {
      // Update the moved task's status.
      await tx
        .update(schema.tasks)
        .set({ status: newStatus, updatedAt: new Date() })
        .where(and(eq(schema.tasks.id, id), eq(schema.tasks.organizationId, organizationId)))

      // Renumber the source column.
      const sourceIds = (await orderedIds(oldStatus)).filter((tid) => tid !== id)
      for (let i = 0; i < sourceIds.length; i++) {
        await tx
          .update(schema.tasks)
          .set({ position: i })
          .where(eq(schema.tasks.id, sourceIds[i]))
      }
    }
    // Renumber the destination column.
    for (let i = 0; i < destIds.length; i++) {
      await tx
        .update(schema.tasks)
        .set({ position: i })
        .where(eq(schema.tasks.id, destIds[i]))
    }
  })
}

export async function updateTask(id: number, input: z.infer<typeof TaskUpdate>, organizationId: string) {
  const data = TaskUpdate.parse(input)
  const patch: Record<string, unknown> = { updatedAt: new Date() }
  if (data.title !== undefined) patch.title = data.title
  if (data.description !== undefined) patch.description = data.description
  if (data.status !== undefined) patch.status = data.status
  if (data.priority !== undefined) patch.priority = data.priority
  if (data.assigneeId !== undefined) patch.assigneeId = data.assigneeId
  if (data.tags !== undefined) patch.tags = data.tags
  if (data.dueDate !== undefined) {
    patch.dueDate = data.dueDate ? new Date(data.dueDate) : null
  }
  const [row] = await db
    .update(schema.tasks)
    .set(patch)
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
