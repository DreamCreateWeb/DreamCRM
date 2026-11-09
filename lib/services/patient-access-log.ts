import 'server-only'
import { randomBytes } from 'node:crypto'
import { and, desc, eq, isNull, type SQL } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { clinicDayKey } from '@/lib/format-datetime'

/**
 * THE CHART ACCESS LOG — who opened which patient record, and who exported.
 *
 * The practice's own record, kept so the owner can answer "who looked at
 * this?" Nothing here is a compliance claim. Two laws:
 *  - WRITES ARE BEST-EFFORT. A log write that throws must never fail the page
 *    or the export it describes; it is swallowed and logged to the console.
 *  - EVERY READ AND WRITE IS ORG-SCOPED.
 */

export type PatientAccessAction = 'view' | 'export' | 'merge' | 'print' | 'two_step_on' | 'two_step_off'

export interface PatientAccessRow {
  id: string
  patientId: string | null
  userId: string
  userName: string | null
  action: PatientAccessAction
  detail: Record<string, unknown> | null
  at: Date
}

export async function recordPatientAccess(
  organizationId: string,
  userId: string,
  action: PatientAccessAction,
  patientId?: string | null,
  detail?: Record<string, unknown> | null,
): Promise<void> {
  try {
    await db.insert(schema.patientAccessLog).values({
      id: `pal_${randomBytes(10).toString('hex')}`,
      organizationId,
      patientId: patientId ?? null,
      userId,
      action,
      detail: detail ?? null,
    })
  } catch (e) {
    console.error('[patient-access-log] not recorded', e)
  }
}

async function readRows(where: SQL | undefined, limit: number): Promise<PatientAccessRow[]> {
  const rows = await db
    .select({
      id: schema.patientAccessLog.id,
      patientId: schema.patientAccessLog.patientId,
      userId: schema.patientAccessLog.userId,
      userName: schema.user.name,
      action: schema.patientAccessLog.action,
      detail: schema.patientAccessLog.detail,
      at: schema.patientAccessLog.at,
    })
    .from(schema.patientAccessLog)
    .leftJoin(schema.user, eq(schema.patientAccessLog.userId, schema.user.id))
    .where(where)
    .orderBy(desc(schema.patientAccessLog.at))
    .limit(limit)
  return rows.map((r) => ({
    ...r,
    action: r.action as PatientAccessAction,
    detail: (r.detail as Record<string, unknown> | null) ?? null,
  }))
}

/** Newest-first access to ONE record. */
export async function listPatientAccess(
  organizationId: string,
  patientId: string,
  limit = 20,
): Promise<PatientAccessRow[]> {
  try {
    return await readRows(
      and(
        eq(schema.patientAccessLog.organizationId, organizationId),
        eq(schema.patientAccessLog.patientId, patientId),
      ),
      limit,
    )
  } catch (e) {
    console.error('[patient-access-log] read failed', e)
    return []
  }
}

/** Newest-first exports across the practice (patient_id is null). */
export async function listRecentExports(organizationId: string, limit = 10): Promise<PatientAccessRow[]> {
  try {
    return await readRows(
      and(
        eq(schema.patientAccessLog.organizationId, organizationId),
        eq(schema.patientAccessLog.action, 'export'),
        isNull(schema.patientAccessLog.patientId),
      ),
      limit,
    )
  } catch (e) {
    console.error('[patient-access-log] exports read failed', e)
    return []
  }
}

/**
 * "Opened by Dana today, Priya yesterday" — the newest open per person, the
 * day said against the CLINIC's calendar (the server runs in UTC).
 */
export function whoLookedLine(rows: PatientAccessRow[], timeZone: string, now: Date = new Date()): string {
  const today = clinicDayKey(now, timeZone)
  const yesterday = clinicDayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000), timeZone)
  const seen = new Set<string>()
  const parts: string[] = []
  for (const r of rows) {
    if (r.action !== 'view' || seen.has(r.userId)) continue
    seen.add(r.userId)
    const day = clinicDayKey(r.at, timeZone)
    const when =
      day === today
        ? 'today'
        : day === yesterday
          ? 'yesterday'
          : new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric' }).format(r.at)
    parts.push(`${(r.userName ?? 'Someone').split(' ')[0]} ${when}`)
    if (parts.length === 4) break
  }
  return parts.length ? `Opened by ${parts.join(', ')}` : ''
}
