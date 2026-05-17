export const TASK_STATUSES = ['todo', 'in_progress', 'completed', 'note'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "To Do's",
  in_progress: 'In Progress',
  completed: 'Completed',
  note: 'Notes',
}
