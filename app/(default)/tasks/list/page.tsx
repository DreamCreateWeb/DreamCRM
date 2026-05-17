import { requireUser } from '@/lib/session'
import { listTasks, TASK_STATUSES, TASK_STATUS_LABEL, type TaskStatus } from '@/lib/services/tasks'
import AddTaskButton from '../kanban/add-task-button'
import TaskListRow from './task-list-row'

export const metadata = {
  title: 'Tasks list - DreamCRM',
  description: 'Linear task list grouped by status',
}

export const dynamic = 'force-dynamic'

export default async function TasksList() {
  await requireUser()
  const tasks = await listTasks()

  const grouped: Record<TaskStatus, typeof tasks> = {
    todo: [],
    in_progress: [],
    completed: [],
    note: [],
  }
  for (const t of tasks) grouped[t.status].push(t)

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <div className="max-w-3xl mx-auto">
        <div className="sm:flex sm:justify-between sm:items-center mb-8">
          <div className="mb-4 sm:mb-0">
            <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">Tasks</h1>
          </div>
          <div className="grid grid-flow-col sm:auto-cols-max justify-start sm:justify-end gap-4">
            <AddTaskButton />
          </div>
        </div>

        <div className="space-y-6">
          {TASK_STATUSES.map((status) => (
            <div key={status}>
              <h2 className="grow font-semibold text-gray-800 dark:text-gray-100 truncate mb-4">
                {TASK_STATUS_LABEL[status]}{' '}
                <span className="text-gray-400 dark:text-gray-500 font-medium">{grouped[status].length}</span>
              </h2>
              <div className="space-y-2">
                {grouped[status].length === 0 ? (
                  <div className="bg-white dark:bg-gray-800 rounded-xl p-4 text-sm text-gray-500 dark:text-gray-400 italic">
                    No tasks
                  </div>
                ) : (
                  grouped[status].map((task) => (
                    <TaskListRow
                      key={task.id}
                      task={{
                        id: task.id,
                        title: task.title,
                        status: task.status,
                        likes: task.likes,
                        comments: task.comments,
                      }}
                    />
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
