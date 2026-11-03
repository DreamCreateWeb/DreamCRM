/**
 * Client-safe follow-up types + pure due-state helpers. The detail/list/overview
 * components import these without pulling the server service into the bundle.
 */

export type FollowupStatus = 'open' | 'done'

/** WHY a follow-up exists. Each kind knows its glyph and its DOOR — where the
 *  person goes to actually do the thing. */
export type FollowupKind =
  | 'generic'
  | 'rebook'
  | 'recall'
  | 'balance'
  | 'insurance'
  | 'message'
  | 'intake'
  | 'review'
  | 'feedback'

export interface FollowupKindDef {
  id: FollowupKind
  label: string
  symbol: string
  /** Where to go do it. Always an in-app path (never external). */
  door: (patientId: string) => string
  doorLabel: string
}

const q = encodeURIComponent

export const FOLLOWUP_KINDS: Record<FollowupKind, FollowupKindDef> = {
  generic: { id: 'generic', label: 'General', symbol: '•', door: (id) => `/patients/${id}`, doorLabel: 'Open record' },
  rebook: { id: 'rebook', label: 'Rebook', symbol: '↻', door: (id) => `/appointments/new?patient=${q(id)}`, doorLabel: 'Book a visit' },
  recall: { id: 'recall', label: 'Check-up reminder', symbol: '↻', door: (id) => `/appointments/new?patient=${q(id)}`, doorLabel: 'Book a visit' },
  balance: { id: 'balance', label: 'Balance', symbol: '$', door: (id) => `/payments?patient=${q(id)}`, doorLabel: 'Open payments' },
  insurance: { id: 'insurance', label: 'Insurance', symbol: '✚', door: (id) => `/insurance?patient=${q(id)}`, doorLabel: 'Open insurance' },
  message: { id: 'message', label: 'Message', symbol: '✉', door: (id) => `/messages?patient=${q(id)}`, doorLabel: 'Open messages' },
  intake: { id: 'intake', label: 'Intake forms', symbol: '☰', door: (id) => `/intake-forms?patient=${q(id)}`, doorLabel: 'Open intake forms' },
  review: { id: 'review', label: 'Review', symbol: '★', door: () => '/growth/reviews', doorLabel: 'Open reviews' },
  // ML-21: a 1–2★ private note or a detractor survey files "Call <first>
  // about their visit". The door is the patient's record — the phone
  // number, the visit, and the very follow-up the bell pointed at — never
  // the public review lane.
  feedback: { id: 'feedback', label: 'Feedback', symbol: '♡', door: (id) => `/patients/${id}`, doorLabel: 'Open record' },
}

export const FOLLOWUP_KIND_IDS = Object.keys(FOLLOWUP_KINDS) as FollowupKind[]

/** Unknown / legacy values read as 'generic' (the column is free text). */
export function normalizeFollowupKind(v: string | null | undefined): FollowupKind {
  return v && v in FOLLOWUP_KINDS ? (v as FollowupKind) : 'generic'
}

/** How a follow-up ended — "How did it go?" (one tap, skippable). */
export type FollowupOutcome = 'reached' | 'booked' | 'no_answer' | 'declined' | 'not_needed'

export const FOLLOWUP_OUTCOMES: Record<FollowupOutcome, { label: string; phrase: string }> = {
  reached: { label: 'Reached them', phrase: 'reached' },
  booked: { label: 'Booked a visit', phrase: 'booked a visit' },
  no_answer: { label: 'No answer', phrase: 'no answer' },
  declined: { label: 'Not interested', phrase: 'declined' },
  not_needed: { label: 'No longer needed', phrase: 'no longer needed' },
}

export function normalizeFollowupOutcome(v: string | null | undefined): FollowupOutcome | null {
  return v && v in FOLLOWUP_OUTCOMES ? (v as FollowupOutcome) : null
}

/** Snooze presets. The server turns a preset into a clinic-local day. */
export type SnoozePreset = 'tomorrow' | 'three_days' | 'next_week'
export const SNOOZE_PRESETS: Record<SnoozePreset, { label: string; days: number }> = {
  tomorrow: { label: 'Tomorrow', days: 1 },
  three_days: { label: 'In 3 days', days: 3 },
  next_week: { label: 'Next week', days: 7 },
}

/** Is this row hidden by a snooze as of clinic-local `today`? */
export function isSnoozed(snoozedUntil: string | null | undefined, today: string): boolean {
  return !!snoozedUntil && snoozedUntil > today
}

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
  kind: FollowupKind
  /** Clinic-local 'YYYY-MM-DD' the row is snoozed until, or null. */
  snoozedUntil: string | null
  outcome: FollowupOutcome | null
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
  // NO `timeZone` HERE, deliberately (D17). A due date is a CALENDAR DATE,
  // not an instant: it is constructed in the runtime's own zone from its
  // Y-M-D parts and rendered in that same zone, so the two agree and the
  // label is always the date that was stored. Passing a clinic zone would
  // reinterpret a local midnight as an instant and render the day BEFORE.
  const nice = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const state = followupDueState(dueDate, today)
  if (state === 'today') return 'Today'
  if (dueDate === addDaysYmd(today, 1)) return 'Tomorrow'
  if (state === 'overdue') return `Overdue · ${nice}`
  return nice
}
