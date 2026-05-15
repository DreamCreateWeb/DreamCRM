import AddTaskButton from './add-task-button'
import type { TaskStatus } from '@/lib/services/tasks'

export default function TasksGroups({
  children,
  title,
  status,
}: {
  children: React.ReactNode
  title: string
  status: TaskStatus
}) {
  return (
    <div className="col-span-full sm:col-span-6 xl:col-span-3">
      <header>
        <div className="flex items-center justify-between mb-2">
          <h2 className="grow font-semibold text-gray-800 dark:text-gray-100 truncate">{title}</h2>
          <AddTaskButton defaultStatus={status} variant="column" />
        </div>
        <div className="grid gap-2">{children}</div>
      </header>
    </div>
  )
}
