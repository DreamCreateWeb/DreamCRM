export const TASK_STATUSES = ['todo', 'in_progress', 'completed', 'note'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "To Do's",
  in_progress: 'In Progress',
  completed: 'Completed',
  note: 'Notes',
}

// Priorities live here too (not server-only) so client components like the
// task drawer + filter bar can import without dragging in lib/services.
export const TASK_PRIORITIES = ['low', 'medium', 'high'] as const
export type TaskPriority = (typeof TASK_PRIORITIES)[number]
