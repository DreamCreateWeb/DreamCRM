'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/session'
import {
  TaskInput,
  TaskUpdate,
  TASK_STATUSES,
  addSubtask,
  createTask,
  deleteTasks,
  likeTask,
  toggleSubtask,
  updateTask,
  updateTaskStatus,
  type TaskStatus,
} from '@/lib/services/tasks'

export async function addTask(input: unknown) {
  const user = await requireUser()
  const task = await createTask(TaskInput.parse(input), user.id)
  revalidatePath('/tasks/kanban')
  revalidatePath('/tasks/list')
  return task
}

export async function moveTask(id: number, status: string) {
  await requireUser()
  if (!TASK_STATUSES.includes(status as TaskStatus)) throw new Error('invalid status')
  const task = await updateTaskStatus(id, status as TaskStatus)
  revalidatePath('/tasks/kanban')
  revalidatePath('/tasks/list')
  return task
}

export async function editTask(id: number, input: unknown) {
  await requireUser()
  const task = await updateTask(id, TaskUpdate.parse(input))
  revalidatePath('/tasks/kanban')
  revalidatePath('/tasks/list')
  return task
}

export async function toggleSubtaskDone(id: number) {
  await requireUser()
  const sub = await toggleSubtask(id)
  revalidatePath('/tasks/list')
  return sub
}

export async function addSubtaskAction(taskId: number, title: string) {
  await requireUser()
  const sub = await addSubtask(taskId, title)
  revalidatePath('/tasks/list')
  return sub
}

export async function removeTasks(ids: number[]) {
  await requireUser()
  const result = await deleteTasks(ids.filter(Number.isInteger))
  revalidatePath('/tasks/kanban')
  revalidatePath('/tasks/list')
  return result
}

export async function likeTaskAction(id: number) {
  await requireUser()
  const result = await likeTask(id)
  revalidatePath('/tasks/kanban')
  return result
}
