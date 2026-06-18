/**
 * Client-safe follow-up types + pure due-state helpers. The detail/list/overview
 * components import these without pulling the server service into the bundle.
 */

export type FollowupStatus = 'open' | 'done'

/** A follow-up as surfaced to the UI (joined with patient + people names). */
export interface PatientFollowupView {
  id: string
  patientId: string
  patientName: string
  title: string
  dueDate: string | null
  assignedUserId: string | null
  assigneeName: string | null
  status: FollowupStatus
  createdByName: string | null
  completedAt: Date | null
  createdAt: Date
}

export type FollowupDueState = 'overdue' | 'today' | 'soon' | 'later' | 'none'

export const MAX_FOLLOWUP_TITLE_LEN = 140

/** Local calendar day as `YYYY-MM-DD` (the same shape due dates are stored in). */
export function todayYmd(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Add N days to a `YYYY-MM-DD` string (used for "due in 3 days" defaults). */
export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + days)
  return todayYmd(dt)
}

/**
 * Classify a due date relative to today (string compare — both are YYYY-MM-DD,
 * which sorts lexicographically as dates). Drives the aging color + grouping.
 */
export function followupDueState(dueDate: string | null, today: string = todayYmd()): FollowupDueState {
  if (!dueDate) return 'none'
  if (dueDate < today) return 'overdue'
  if (dueDate === today) return 'today'
  const soon = addDaysYmd(today, 7)
  if (dueDate <= soon) return 'soon'
  return 'later'
}

/** A human label for a due date ("Today", "Tomorrow", "Mar 14", "Overdue · Mar 2"). */
export function formatDueLabel(dueDate: string | null, today: string = todayYmd()): string {
  if (!dueDate) return 'No due date'
  const [y, m, d] = dueDate.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  const nice = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const state = followupDueState(dueDate, today)
  if (state === 'today') return 'Today'
  if (dueDate === addDaysYmd(today, 1)) return 'Tomorrow'
  if (state === 'overdue') return `Overdue · ${nice}`
  return nice
}
