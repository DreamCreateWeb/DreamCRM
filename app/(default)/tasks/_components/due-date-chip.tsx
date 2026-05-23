import { cn } from '@/lib/utils'

/**
 * Visual chip for a task due date. Color encodes urgency at a glance:
 * - overdue (past): rose
 * - today: amber
 * - within 3 days: stone (warm neutral)
 * - further out: cool stone
 *
 * Completed tasks short-circuit to a muted style so a long-overdue but
 * already-done task doesn't scream for attention.
 */
export default function DueDateChip({
  dueDate,
  completed,
  size = 'sm',
}: {
  dueDate: Date | string | null
  completed?: boolean
  size?: 'xs' | 'sm'
}) {
  if (!dueDate) return null
  const d = typeof dueDate === 'string' ? new Date(dueDate) : dueDate
  const status = computeStatus(d, !!completed)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap',
        size === 'xs' ? 'text-[10px] px-1.5 py-0.5' : 'text-[11px] px-2 py-0.5',
        STATUS_CLASS[status],
      )}
      suppressHydrationWarning
      title={d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
    >
      <svg className="w-2.5 h-2.5 opacity-80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 9h18M8 3v4M16 3v4" strokeLinecap="round" />
      </svg>
      {formatRelative(d, status)}
    </span>
  )
}

type Status = 'overdue' | 'today' | 'soon' | 'later' | 'done'

const STATUS_CLASS: Record<Status, string> = {
  overdue: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  today: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200',
  soon: 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300',
  later: 'bg-stone-50 text-stone-500 dark:bg-stone-800/60 dark:text-stone-400',
  done: 'bg-stone-50 text-stone-400 dark:bg-stone-800/40 dark:text-stone-500 line-through',
}

function computeStatus(d: Date, completed: boolean): Status {
  if (completed) return 'done'
  const now = new Date()
  const today0 = new Date(now); today0.setHours(0, 0, 0, 0)
  const tomorrow0 = new Date(today0); tomorrow0.setDate(tomorrow0.getDate() + 1)
  const threeDays = new Date(today0); threeDays.setDate(threeDays.getDate() + 3)
  if (d < today0) return 'overdue'
  if (d < tomorrow0) return 'today'
  if (d < threeDays) return 'soon'
  return 'later'
}

function formatRelative(d: Date, status: Status): string {
  if (status === 'today') return 'Today'
  if (status === 'overdue') {
    const days = Math.floor((Date.now() - d.getTime()) / 86_400_000)
    if (days <= 1) return 'Yesterday'
    if (days < 7) return `${days}d overdue`
    return `Overdue ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
  }
  if (status === 'soon') {
    const days = Math.ceil((d.getTime() - Date.now()) / 86_400_000)
    if (days <= 1) return 'Tomorrow'
    return `${days}d`
  }
  // later / done
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
