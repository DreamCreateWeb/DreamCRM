import 'server-only'
import { normalizeViewFilters, type PatientViewRow, type SavedViewFilters } from '@/lib/types/patient-views'
import { listSavedViews, createSavedView, deleteSavedView } from '@/lib/services/saved-views'
import type { PatientAudienceFilterT } from '@/lib/services/marketing'

export type { PatientViewRow }

/**
 * Saved patient-list views — a named filter combo shared across the clinic
 * team, re-opened in one click and promotable into a marketing audience. CRUD
 * delegates to the generic saved-views store (surface='patients'); the
 * patient-specific bits (normalization, audience promotion) stay here.
 */

export async function listPatientViews(organizationId: string): Promise<PatientViewRow[]> {
  const rows = await listSavedViews(organizationId, 'patients')
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    filters: (r.filters ?? {}) as SavedViewFilters,
    createdByName: r.createdByName,
  }))
}

export async function createPatientView(
  organizationId: string,
  name: string,
  rawFilters: Record<string, unknown>,
  userId: string | null,
): Promise<PatientViewRow> {
  const filters = normalizeViewFilters(rawFilters)
  const row = await createSavedView(organizationId, 'patients', name, filters as Record<string, unknown>, userId)
  return { id: row.id, name: row.name, filters: row.filters as SavedViewFilters, createdByName: row.createdByName }
}

export async function deletePatientView(organizationId: string, id: string): Promise<void> {
  await deleteSavedView(organizationId, id)
}

/**
 * Map the saved-view filter shape onto a marketing patient-audience filter — the
 * bridge that promotes a list segment into a sendable audience. Filters that
 * have no audience equivalent (missing-intake, free-text search) are dropped;
 * the rest map cleanly. Returns the audience filter + whether anything was
 * dropped (so the UI can be honest about it).
 */
export function patientFiltersToAudienceFilter(
  f: SavedViewFilters,
): { filter: PatientAudienceFilterT; dropped: string[] } {
  const filter: PatientAudienceFilterT = {
    requireEmailOptIn: true,
    requireSmsOptIn: false,
    includeArchived: f.status === 'archived',
  }
  if (f.status === 'new') filter.lifecycles = ['new']
  else if (f.status === 'inactive') filter.lifecycles = ['lapsed']
  else if (f.status === 'archived') filter.lifecycles = ['archived']
  if (f.status === 'recall_due') filter.recallStatuses = ['due', 'overdue']
  if (f.hasBalance) filter.hasOutstandingBalance = true
  if (f.birthdayThisMonth) filter.birthdayThisMonth = true
  if (f.sources?.length) filter.sources = f.sources
  if (f.tagIds?.length) filter.tagIds = f.tagIds

  const dropped: string[] = []
  if (f.missingIntake) dropped.push('missing intake')
  if (f.search) dropped.push('search text')
  return { filter, dropped }
}

function isUniqueViolation(err: unknown): boolean {
  return !!err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === '23505'
}
