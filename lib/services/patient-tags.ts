import 'server-only'
import { randomBytes } from 'crypto'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { coerceTagColor, MAX_TAG_NAME_LEN, type PatientTagColor, type PatientTagView } from '@/lib/types/patient-tags'

/**
 * Patient tags — an org-scoped catalog of reusable labels + their per-patient
 * assignments. CRM-side organization ("VIP", "Anxious", "Pediatric"), NOT
 * clinical coding. Mirrors the patient-notes service shape: every read/write is
 * org-scoped, and patient ownership is verified before an assignment write so a
 * foreign/stale id can't create an orphan row.
 */

export function newPatientTagId(): string {
  return `ptag_${randomBytes(8).toString('hex')}`
}

function cleanName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, MAX_TAG_NAME_LEN)
}

// ── Catalog ───────────────────────────────────────────────────────────────

/**
 * List the org's tag catalog with a usage count per tag (patients carrying it).
 * Sorted by name. The count drives the management UI ("VIP · 4").
 */
export async function listPatientTags(organizationId: string): Promise<PatientTagView[]> {
  const rows = await db
    .select({
      id: schema.patientTag.id,
      name: schema.patientTag.name,
      color: schema.patientTag.color,
      patientCount: sql<number>`count(${schema.patientTagAssignment.patientId})::int`,
    })
    .from(schema.patientTag)
    .leftJoin(
      schema.patientTagAssignment,
      eq(schema.patientTagAssignment.tagId, schema.patientTag.id),
    )
    .where(eq(schema.patientTag.organizationId, organizationId))
    .groupBy(schema.patientTag.id, schema.patientTag.name, schema.patientTag.color)
    .orderBy(sql`lower(${schema.patientTag.name})`)
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    color: coerceTagColor(r.color),
    patientCount: Number(r.patientCount ?? 0),
  }))
}

/**
 * Create a tag. Dedupes case-insensitively by name within the org — returns the
 * EXISTING tag (idempotent) rather than throwing, so an inline "create tag" in
 * the detail editor never errors on a name that already exists.
 */
export async function createPatientTag(
  organizationId: string,
  input: { name: string; color?: PatientTagColor },
  userId: string | null,
): Promise<PatientTagView> {
  const name = cleanName(input.name)
  if (!name) throw new Error('Tag name is required')
  const color = coerceTagColor(input.color)

  const existing = await findTagByName(organizationId, name)
  if (existing) return existing

  const id = newPatientTagId()
  try {
    await db.insert(schema.patientTag).values({
      id,
      organizationId,
      name,
      color,
      createdBy: userId,
    })
  } catch (err) {
    // Lost a race on the unique (org, lower(name)) index — return the winner.
    if (isUniqueViolation(err)) {
      const winner = await findTagByName(organizationId, name)
      if (winner) return winner
    }
    throw err
  }
  return { id, name, color, patientCount: 0 }
}

async function findTagByName(organizationId: string, name: string): Promise<PatientTagView | null> {
  const [row] = await db
    .select({ id: schema.patientTag.id, name: schema.patientTag.name, color: schema.patientTag.color })
    .from(schema.patientTag)
    .where(
      and(
        eq(schema.patientTag.organizationId, organizationId),
        sql`lower(${schema.patientTag.name}) = lower(${name})`,
      ),
    )
    .limit(1)
  return row ? { id: row.id, name: row.name, color: coerceTagColor(row.color) } : null
}

/** Rename + recolor a tag. Both optional; rejects a name that collides with a
 *  DIFFERENT existing tag. */
export async function updatePatientTag(
  organizationId: string,
  tagId: string,
  patch: { name?: string; color?: PatientTagColor },
): Promise<void> {
  const set: Record<string, unknown> = { updatedAt: new Date() }
  if (patch.name !== undefined) {
    const name = cleanName(patch.name)
    if (!name) throw new Error('Tag name is required')
    const clash = await findTagByName(organizationId, name)
    if (clash && clash.id !== tagId) throw new Error(`A "${name}" tag already exists.`)
    set.name = name
  }
  if (patch.color !== undefined) set.color = coerceTagColor(patch.color)
  await db
    .update(schema.patientTag)
    .set(set)
    .where(and(eq(schema.patientTag.id, tagId), eq(schema.patientTag.organizationId, organizationId)))
}

/** Delete a tag from the catalog (its assignments cascade away). */
export async function deletePatientTag(organizationId: string, tagId: string): Promise<void> {
  await db
    .delete(schema.patientTag)
    .where(and(eq(schema.patientTag.id, tagId), eq(schema.patientTag.organizationId, organizationId)))
}

// ── Assignments ─────────────────────────────────────────────────────────────

/** Tags currently on one patient (ordered by name). */
export async function getTagsForPatient(
  organizationId: string,
  patientId: string,
): Promise<PatientTagView[]> {
  const rows = await db
    .select({ id: schema.patientTag.id, name: schema.patientTag.name, color: schema.patientTag.color })
    .from(schema.patientTagAssignment)
    .innerJoin(schema.patientTag, eq(schema.patientTag.id, schema.patientTagAssignment.tagId))
    .where(
      and(
        eq(schema.patientTagAssignment.organizationId, organizationId),
        eq(schema.patientTagAssignment.patientId, patientId),
      ),
    )
    .orderBy(sql`lower(${schema.patientTag.name})`)
  return rows.map((r) => ({ id: r.id, name: r.name, color: coerceTagColor(r.color) }))
}

/**
 * Bulk: tags for many patients at once → Map<patientId, PatientTagView[]>.
 * One query for the whole patient-list page (avoids an N+1). Empty input short-
 * circuits.
 */
export async function getTagsForPatients(
  organizationId: string,
  patientIds: string[],
): Promise<Map<string, PatientTagView[]>> {
  const map = new Map<string, PatientTagView[]>()
  if (patientIds.length === 0) return map
  const rows = await db
    .select({
      patientId: schema.patientTagAssignment.patientId,
      id: schema.patientTag.id,
      name: schema.patientTag.name,
      color: schema.patientTag.color,
    })
    .from(schema.patientTagAssignment)
    .innerJoin(schema.patientTag, eq(schema.patientTag.id, schema.patientTagAssignment.tagId))
    .where(
      and(
        eq(schema.patientTagAssignment.organizationId, organizationId),
        inArray(schema.patientTagAssignment.patientId, patientIds),
      ),
    )
    .orderBy(sql`lower(${schema.patientTag.name})`)
  for (const r of rows) {
    const arr = map.get(r.patientId) ?? []
    arr.push({ id: r.id, name: r.name, color: coerceTagColor(r.color) })
    map.set(r.patientId, arr)
  }
  return map
}

/** Verify a patient belongs to the org (so an assignment can't orphan). */
async function patientInOrg(organizationId: string, patientId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.patient.id })
    .from(schema.patient)
    .where(and(eq(schema.patient.id, patientId), eq(schema.patient.organizationId, organizationId)))
    .limit(1)
  return !!row
}

/** Verify a tag belongs to the org. */
async function tagInOrg(organizationId: string, tagId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.patientTag.id })
    .from(schema.patientTag)
    .where(and(eq(schema.patientTag.id, tagId), eq(schema.patientTag.organizationId, organizationId)))
    .limit(1)
  return !!row
}

/** Assign a tag to a patient (idempotent — re-assigning is a no-op). */
export async function assignPatientTag(
  organizationId: string,
  patientId: string,
  tagId: string,
  userId: string | null,
): Promise<void> {
  if (!(await tagInOrg(organizationId, tagId))) throw new Error('Tag not found in this organization')
  if (!(await patientInOrg(organizationId, patientId))) throw new Error('Patient not found in this organization')
  await db
    .insert(schema.patientTagAssignment)
    .values({ patientId, tagId, organizationId, assignedBy: userId })
    .onConflictDoNothing()
}

/** Remove a tag from a patient. No-op if it wasn't assigned. */
export async function unassignPatientTag(
  organizationId: string,
  patientId: string,
  tagId: string,
): Promise<void> {
  await db
    .delete(schema.patientTagAssignment)
    .where(
      and(
        eq(schema.patientTagAssignment.organizationId, organizationId),
        eq(schema.patientTagAssignment.patientId, patientId),
        eq(schema.patientTagAssignment.tagId, tagId),
      ),
    )
}

/**
 * Bulk-assign one tag to many patients (the patients-list bulk action). Verifies
 * the tag + filters the ids to ones actually in the org, then inserts in one
 * statement (idempotent). Returns how many patients now carry the tag from this
 * call's id set.
 */
export async function assignTagToPatients(
  organizationId: string,
  patientIds: string[],
  tagId: string,
  userId: string | null,
): Promise<{ assigned: number }> {
  if (patientIds.length === 0) return { assigned: 0 }
  if (!(await tagInOrg(organizationId, tagId))) throw new Error('Tag not found in this organization')
  // Keep only ids that belong to this org (defense against a foreign id in the
  // selection set).
  const owned = await db
    .select({ id: schema.patient.id })
    .from(schema.patient)
    .where(and(eq(schema.patient.organizationId, organizationId), inArray(schema.patient.id, patientIds)))
  const ownedIds = owned.map((r) => r.id)
  if (ownedIds.length === 0) return { assigned: 0 }
  await db
    .insert(schema.patientTagAssignment)
    .values(ownedIds.map((patientId) => ({ patientId, tagId, organizationId, assignedBy: userId })))
    .onConflictDoNothing()
  return { assigned: ownedIds.length }
}

function isUniqueViolation(err: unknown): boolean {
  return !!err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === '23505'
}
