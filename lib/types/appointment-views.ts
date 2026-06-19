/**
 * Client-safe saved-view types + pure mappers for the APPOINTMENTS list — the
 * serializable subset of AppointmentListFilters a saved view captures, plus the
 * filters⇄query-string round-trip and a human description. Mirrors
 * lib/types/patient-views.ts; stored in the generic saved-views table under
 * surface='appointments'.
 */

export type ApptWindow = 'today' | 'tomorrow' | 'this_week' | 'next_14d' | 'all_upcoming' | 'past_30d'
export type ApptAttention =
  | 'unconfirmed'
  | 'needs_intake'
  | 'new_patients'
  | 'has_balance'
  | 'cancelled'
  | 'no_show'
  | 'lapsed_rebooking'
  | 'needs_rebooking'

const WINDOWS: ApptWindow[] = ['today', 'tomorrow', 'this_week', 'next_14d', 'all_upcoming', 'past_30d']
const ATTENTION: ApptAttention[] = [
  'unconfirmed',
  'needs_intake',
  'new_patients',
  'has_balance',
  'cancelled',
  'no_show',
  'lapsed_rebooking',
  'needs_rebooking',
]

/** `next_14d` is the page's default window, so a view that carries only it
 *  reads as "no window constraint" (and is dropped from the query). */
export const DEFAULT_APPT_WINDOW: ApptWindow = 'next_14d'

const WINDOW_LABEL: Record<ApptWindow, string> = {
  today: 'Today',
  tomorrow: 'Tomorrow',
  this_week: 'This week',
  next_14d: 'Next 14 days',
  all_upcoming: 'All upcoming',
  past_30d: 'Past 30 days',
}
const ATTENTION_LABEL: Record<ApptAttention, string> = {
  unconfirmed: 'unconfirmed',
  needs_intake: 'needs intake',
  new_patients: 'new patients',
  has_balance: 'has balance',
  cancelled: 'cancelled',
  no_show: 'no-show',
  lapsed_rebooking: 'lapsed rebooking',
  needs_rebooking: 'needs rebooking',
}

export interface AppointmentViewFilters {
  window?: ApptWindow
  attention?: ApptAttention[]
  providerId?: string
  source?: string
  search?: string
}

export interface AppointmentViewRow {
  id: string
  name: string
  filters: AppointmentViewFilters
  createdByName: string | null
}

export const MAX_APPT_VIEW_NAME_LEN = 60

function isWindow(v: unknown): v is ApptWindow {
  return typeof v === 'string' && (WINDOWS as string[]).includes(v)
}

/** Pull the saved subset out of a looser filter object (drops empties + junk). */
export function normalizeAppointmentViewFilters(input: Record<string, unknown>): AppointmentViewFilters {
  const out: AppointmentViewFilters = {}
  if (isWindow(input.window)) out.window = input.window
  if (Array.isArray(input.attention)) {
    const v = input.attention.filter((s): s is ApptAttention => typeof s === 'string' && (ATTENTION as string[]).includes(s))
    if (v.length) out.attention = v
  }
  if (typeof input.providerId === 'string' && input.providerId.trim()) out.providerId = input.providerId.trim()
  if (typeof input.source === 'string' && input.source.trim()) out.source = input.source.trim()
  if (typeof input.search === 'string' && input.search.trim()) out.search = input.search.trim()
  return out
}

/** True when a view carries no constraint beyond the default window. */
export function isEmptyAppointmentViewFilters(f: AppointmentViewFilters): boolean {
  return (
    (!f.window || f.window === DEFAULT_APPT_WINDOW) &&
    !f.attention?.length &&
    !f.providerId &&
    !f.source &&
    !f.search
  )
}

/** Serialize a saved view into an /appointments query string (sans leading "?"). */
export function appointmentViewFiltersToQuery(f: AppointmentViewFilters): string {
  const p = new URLSearchParams()
  if (f.window && f.window !== DEFAULT_APPT_WINDOW) p.set('window', f.window)
  if (f.attention?.length) p.set('attention', f.attention.join(','))
  if (f.providerId) p.set('provider', f.providerId)
  if (f.source) p.set('source', f.source)
  if (f.search) p.set('q', f.search)
  return p.toString()
}

/** A short human summary of what a view filters to, for tooltips/name prefill. */
export function describeAppointmentViewFilters(
  f: AppointmentViewFilters,
  providerNames?: Map<string, string>,
): string {
  const bits: string[] = []
  if (f.window && f.window !== DEFAULT_APPT_WINDOW) bits.push(WINDOW_LABEL[f.window])
  if (f.attention?.length) bits.push(f.attention.map((a) => ATTENTION_LABEL[a]).join(' + '))
  if (f.providerId) bits.push(`with ${providerNames?.get(f.providerId) ?? 'a provider'}`)
  if (f.source) bits.push(`via ${f.source.replace(/_/g, ' ')}`)
  if (f.search) bits.push(`“${f.search}”`)
  return bits.length ? bits.join(' · ') : 'All appointments'
}
