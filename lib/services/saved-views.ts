import 'server-only'
import { randomBytes } from 'crypto'
import { and, asc, eq, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'

/**
 * Generic saved-list-views storage, shared by every list surface (patients /
 * appointments / leads) via a `surface` discriminator on the `patient_view`
 * table. The per-surface filter SHAPE lives in client-safe type modules
 * (lib/types/*-views.ts); this layer just persists a name + an opaque filter
 * blob per (org, surface, name). Patients keep their richer service
 * (lib/services/patient-views.ts, audience promotion etc.), which now delegates
 * its CRUD here.
 */

export type SavedViewSurface = 'patients' | 'appointments' | 'leads'

export interface SavedViewRow {
  id: string
  name: string
  filters: Record<string, unknown>
  createdByName: string | null
}

const MAX_VIEW_NAME_LEN = 60

function newId(): string {
  return `pview_${randomBytes(8).toString('hex')}`
}
function cleanName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, MAX_VIEW_NAME_LEN)
}
function isUniqueViolation(err: unknown): boolean {
  return !!err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === '23505'
}

export async function listSavedViews(
  organizationId: string,
  surface: SavedViewSurface,
): Promise<SavedViewRow[]> {
  const rows = await db
    .select({
      id: schema.patientView.id,
      name: schema.patientView.name,
      filters: schema.patientView.filters,
      createdByName: schema.user.name,
    })
    .from(schema.patientView)
    .leftJoin(schema.user, eq(schema.user.id, schema.patientView.createdBy))
    .where(and(eq(schema.patientView.organizationId, organizationId), eq(schema.patientView.surface, surface)))
    .orderBy(asc(schema.patientView.sortOrder), asc(sql`lower(${schema.patientView.name})`))
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    filters: (r.filters ?? {}) as Record<string, unknown>,
    createdByName: r.createdByName ?? null,
  }))
}

/**
 * Create (or, on a name collision, overwrite the filters of) a saved view.
 * Filters are stored as given — callers normalize per surface first. Dedup is
 * by case-insensitive name within (org, surface), so "Save view" with an
 * existing name updates it instead of erroring.
 */
export async function createSavedView(
  organizationId: string,
  surface: SavedViewSurface,
  name: string,
  filters: Record<string, unknown>,
  userId: string | null,
): Promise<SavedViewRow> {
  const clean = cleanName(name)
  if (!clean) throw new Error('Give the view a name.')

  const [existing] = await db
    .select({ id: schema.patientView.id })
    .from(schema.patientView)
    .where(
      and(
        eq(schema.patientView.organizationId, organizationId),
        eq(schema.patientView.surface, surface),
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
    await db.insert(schema.patientView).values({ id, organizationId, surface, name: clean, filters, createdBy: userId })
  } catch (err) {
    // Lost a unique-name race — update the winner instead.
    if (isUniqueViolation(err)) {
      await db
        .update(schema.patientView)
        .set({ filters, updatedAt: new Date() })
        .where(
          and(
            eq(schema.patientView.organizationId, organizationId),
            eq(schema.patientView.surface, surface),
            sql`lower(${schema.patientView.name}) = lower(${clean})`,
          ),
        )
      return { id, name: clean, filters, createdByName: null }
    }
    throw err
  }
  return { id, name: clean, filters, createdByName: null }
}

/** Delete a saved view (org-scoped). Surface-agnostic — the id is unique. */
export async function deleteSavedView(organizationId: string, id: string): Promise<void> {
  await db
    .delete(schema.patientView)
    .where(and(eq(schema.patientView.id, id), eq(schema.patientView.organizationId, organizationId)))
}
