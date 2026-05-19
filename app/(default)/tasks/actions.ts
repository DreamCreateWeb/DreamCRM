'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import {
  TaskInput,
  TaskUpdate,
  TASK_STATUSES,
  addSubtask,
  createTask,
  deleteTasks,
  likeTask,
  reorderTask,
  toggleSubtask,
  updateTask,
  updateTaskStatus,
  type TaskStatus,
} from '@/lib/services/tasks'

export async function addTask(input: unknown) {
  const ctx = await requireTenant()
  const task = await createTask(TaskInput.parse(input), {
    userId: ctx.userId,
    organizationId: ctx.organizationId,
  })
  revalidatePath('/tasks/kanban')
  revalidatePath('/tasks/list')
  return task
}

export async function moveTask(id: number, status: string) {
  const ctx = await requireTenant()
  if (!TASK_STATUSES.includes(status as TaskStatus)) throw new Error('invalid status')
  const task = await updateTaskStatus(id, status as TaskStatus, ctx.organizationId)
  revalidatePath('/tasks/kanban')
  revalidatePath('/tasks/list')
  return task
}

export async function reorderTaskAction(id: number, newStatus: string, newIndex: number) {
  const ctx = await requireTenant()
  if (!TASK_STATUSES.includes(newStatus as TaskStatus)) throw new Error('invalid status')
  if (!Number.isInteger(newIndex) || newIndex < 0) throw new Error('invalid index')
  await reorderTask(id, newStatus as TaskStatus, newIndex, ctx.organizationId)
  revalidatePath('/tasks/kanban')
  revalidatePath('/tasks/list')
  return { ok: true }
}

export async function editTask(id: number, input: unknown) {
  const ctx = await requireTenant()
  const task = await updateTask(id, TaskUpdate.parse(input), ctx.organizationId)
  revalidatePath('/tasks/kanban')
  revalidatePath('/tasks/list')
  return task
}

export async function toggleSubtaskDone(id: number) {
  const ctx = await requireTenant()
  const sub = await toggleSubtask(id, ctx.organizationId)
  revalidatePath('/tasks/list')
  return sub
}

export async function addSubtaskAction(taskId: number, title: string) {
  const ctx = await requireTenant()
  const sub = await addSubtask(taskId, title, ctx.organizationId)
  revalidatePath('/tasks/list')
  return sub
}

export async function removeTasks(ids: number[]) {
  const ctx = await requireTenant()
  const result = await deleteTasks(ids.filter(Number.isInteger), ctx.organizationId)
  revalidatePath('/tasks/kanban')
  revalidatePath('/tasks/list')
  return result
}

export async function likeTaskAction(id: number) {
  const ctx = await requireTenant()
  const result = await likeTask(id, ctx.organizationId)
  revalidatePath('/tasks/kanban')
  return result
}
