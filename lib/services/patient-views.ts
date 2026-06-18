import 'server-only'
import { randomBytes } from 'crypto'
import { and, asc, eq, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import {
  MAX_VIEW_NAME_LEN,
  normalizeViewFilters,
  type PatientViewRow,
  type SavedViewFilters,
} from '@/lib/types/patient-views'
import type { PatientAudienceFilterT } from '@/lib/services/marketing'

export type { PatientViewRow }

/**
 * Saved patient-list views — a named filter combo shared across the clinic
 * team, re-opened in one click and promotable into a marketing audience.
 */

function newId(): string {
  return `pview_${randomBytes(8).toString('hex')}`
}
function cleanName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, MAX_VIEW_NAME_LEN)
}

export async function listPatientViews(organizationId: string): Promise<PatientViewRow[]> {
  const rows = await db
    .select({
      id: schema.patientView.id,
      name: schema.patientView.name,
      filters: schema.patientView.filters,
      createdByName: schema.user.name,
    })
    .from(schema.patientView)
    .leftJoin(schema.user, eq(schema.user.id, schema.patientView.createdBy))
    .where(eq(schema.patientView.organizationId, organizationId))
    .orderBy(asc(schema.patientView.sortOrder), asc(sql`lower(${schema.patientView.name})`))
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    filters: (r.filters ?? {}) as SavedViewFilters,
    createdByName: r.createdByName ?? null,
  }))
}

export async function createPatientView(
  organizationId: string,
  name: string,
  rawFilters: Record<string, unknown>,
  userId: string | null,
): Promise<PatientViewRow> {
  const clean = cleanName(name)
  if (!clean) throw new Error('Give the view a name.')
  const filters = normalizeViewFilters(rawFilters)

  // Dedupe by case-insensitive name — overwrite the existing view's filters so
  // "Save view" with the same name updates it rather than erroring.
  const [existing] = await db
    .select({ id: schema.patientView.id })
    .from(schema.patientView)
    .where(
      and(
        eq(schema.patientView.organizationId, organizationId),
        sql`lower(${schema.patientView.name}) = lower(${clean})`,
      ),
    )
    .limit(1)
  if (existing) {
    await db
      .update(schema.patientView)
      .set({ filters, updatedAt: new Date() })
      .where(eq(schema.patientView.id, existing.id))
    return { id: existing.id, name: clean, filters, createdByName: null }
  }

  const id = newId()
  try {
    await db.insert(schema.patientView).values({ id, organizationId, name: clean, filters, createdBy: userId })
  } catch (err) {
    // Lost a unique-name race — update the winner instead.
    if (isUniqueViolation(err)) {
      await db
        .update(schema.patientView)
        .set({ filters, updatedAt: new Date() })
        .where(
          and(
            eq(schema.patientView.organizationId, organizationId),
            sql`lower(${schema.patientView.name}) = lower(${clean})`,
          ),
        )
      return { id, name: clean, filters, createdByName: null }
    }
    throw err
  }
  return { id, name: clean, filters, createdByName: null }
}

export async function deletePatientView(organizationId: string, id: string): Promise<void> {
  await db
    .delete(schema.patientView)
    .where(and(eq(schema.patientView.id, id), eq(schema.patientView.organizationId, organizationId)))
}

export async function getPatientView(organizationId: string, id: string): Promise<PatientViewRow | null> {
  const [row] = await db
    .select({ id: schema.patientView.id, name: schema.patientView.name, filters: schema.patientView.filters })
    .from(schema.patientView)
    .where(and(eq(schema.patientView.id, id), eq(schema.patientView.organizationId, organizationId)))
    .limit(1)
  return row ? { id: row.id, name: row.name, filters: (row.filters ?? {}) as SavedViewFilters, createdByName: null } : null
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
