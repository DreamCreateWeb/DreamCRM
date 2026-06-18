/**
 * Client-safe saved-view types + pure mappers between the patient-list filter
 * shape, a URL query string, and a marketing audience filter.
 */

/** The serializable subset of PatientListFilters a saved view captures. */
export interface SavedViewFilters {
  status?: 'all' | 'new' | 'recall_due' | 'inactive' | 'archived'
  hasBalance?: boolean
  missingIntake?: boolean
  birthdayThisMonth?: boolean
  sources?: string[]
  tagIds?: string[]
  search?: string
}

export interface PatientViewRow {
  id: string
  name: string
  filters: SavedViewFilters
  createdByName: string | null
}

export const MAX_VIEW_NAME_LEN = 60

/** Pull the saved subset out of a looser filter object (drops empties). */
export function normalizeViewFilters(input: Record<string, unknown>): SavedViewFilters {
  const out: SavedViewFilters = {}
  const status = input.status
  if (status === 'new' || status === 'recall_due' || status === 'inactive' || status === 'archived') {
    out.status = status
  }
  if (input.hasBalance) out.hasBalance = true
  if (input.missingIntake) out.missingIntake = true
  if (input.birthdayThisMonth) out.birthdayThisMonth = true
  if (Array.isArray(input.sources)) {
    const v = input.sources.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    if (v.length) out.sources = v
  }
  if (Array.isArray(input.tagIds)) {
    const v = input.tagIds.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    if (v.length) out.tagIds = v
  }
  if (typeof input.search === 'string' && input.search.trim()) out.search = input.search.trim()
  return out
}

/** True when a view carries no constraints (so "Save view" can be disabled). */
export function isEmptyViewFilters(f: SavedViewFilters): boolean {
  return (
    (!f.status || f.status === 'all') &&
    !f.hasBalance &&
    !f.missingIntake &&
    !f.birthdayThisMonth &&
    !f.sources?.length &&
    !f.tagIds?.length &&
    !f.search
  )
}

/** Serialize a saved view into a /patients query string (sans leading "?"). */
export function viewFiltersToQuery(f: SavedViewFilters): string {
  const p = new URLSearchParams()
  if (f.status && f.status !== 'all') p.set('status', f.status)
  if (f.hasBalance) p.set('balance', '1')
  if (f.missingIntake) p.set('intake', '1')
  if (f.birthdayThisMonth) p.set('birthday', '1')
  if (f.sources?.length) p.set('source', f.sources.join(','))
  if (f.tagIds?.length) p.set('tags', f.tagIds.join(','))
  if (f.search) p.set('q', f.search)
  return p.toString()
}

/** A short human summary of what a view filters to, for tooltips/chips. */
export function describeViewFilters(f: SavedViewFilters, tagNames?: Map<string, string>): string {
  const bits: string[] = []
  if (f.status && f.status !== 'all') bits.push(f.status.replace('_', ' '))
  if (f.hasBalance) bits.push('has balance')
  if (f.missingIntake) bits.push('missing intake')
  if (f.birthdayThisMonth) bits.push('birthday this month')
  if (f.sources?.length) bits.push(`from ${f.sources.join('/')}`)
  if (f.tagIds?.length) {
    const names = tagNames ? f.tagIds.map((id) => tagNames.get(id) ?? '…') : []
    bits.push(names.length ? `tagged ${names.join('/')}` : `${f.tagIds.length} tag${f.tagIds.length === 1 ? '' : 's'}`)
  }
  if (f.search) bits.push(`“${f.search}”`)
  return bits.length ? bits.join(' · ') : 'All patients'
}
