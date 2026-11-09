import 'server-only'
import { randomBytes } from 'crypto'
import { and, asc, eq, gte, lte } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clinicClosure } from '@/lib/db/schema/clinic'
import { clinicLocalDate, resolveClinicTimeZone } from '@/lib/clinic-timezone'
import { addDaysToKey, parseClosureInput, type ClosureInput, type ClosureRange } from '@/lib/closures'

/**
 * Holiday closures — the ONE service (ML-51). The pure half (the day-key
 * predicate, the presets) is lib/closures.ts. Every read filters by
 * `organization_id`, every insert sets it. Days are clinic-local DATE columns.
 */

function newId(): string {
  return `clo_${randomBytes(8).toString('hex')}`
}

const COLS = {
  id: clinicClosure.id,
  startsOn: clinicClosure.startsOn,
  endsOn: clinicClosure.endsOn,
  label: clinicClosure.label,
}

/** The clinic-local calendar day for an instant, as a day key. */
export function clinicDayKeyFor(now: Date, timeZone: string | null | undefined): string {
  const d = clinicLocalDate(now, resolveClinicTimeZone(timeZone))
  return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`
}

/** Closures overlapping [fromKey, toKey] (inclusive day keys), soonest first. */
export async function listClosures(organizationId: string, fromKey: string, toKey: string): Promise<ClosureRange[]> {
  return db
    .select(COLS)
    .from(clinicClosure)
    .where(and(eq(clinicClosure.organizationId, organizationId), lte(clinicClosure.startsOn, toKey), gte(clinicClosure.endsOn, fromKey)))
    .orderBy(asc(clinicClosure.startsOn))
}

/** Every closure that has not finished yet, as of the clinic's today. */
export async function listUpcomingClosures(
  organizationId: string,
  timeZone: string | null | undefined,
  now = new Date(),
): Promise<ClosureRange[]> {
  const today = clinicDayKeyFor(now, timeZone)
  return db
    .select(COLS)
    .from(clinicClosure)
    .where(and(eq(clinicClosure.organizationId, organizationId), gte(clinicClosure.endsOn, today)))
    .orderBy(asc(clinicClosure.startsOn))
}

/** Closures in the window starting at the clinic's today (public site / digest read). */
export async function listClosuresAhead(
  organizationId: string,
  timeZone: string | null | undefined,
  days: number,
  now = new Date(),
): Promise<ClosureRange[]> {
  const today = clinicDayKeyFor(now, timeZone)
  return listClosures(organizationId, today, addDaysToKey(today, days))
}

/** The closure covering this clinic-local day, or null (booking's one read). */
export async function closureOnDay(organizationId: string, dayKey: string): Promise<ClosureRange | null> {
  const [row] = await db
    .select(COLS)
    .from(clinicClosure)
    .where(and(eq(clinicClosure.organizationId, organizationId), lte(clinicClosure.startsOn, dayKey), gte(clinicClosure.endsOn, dayKey)))
    .limit(1)
  return row ?? null
}

export type ClosureResult = { ok: true; closure: ClosureRange } | { ok: false; error: string }

/** Add one closure. The same range + label twice is the same closure (idempotent). */
export async function addClosure(organizationId: string, input: ClosureInput): Promise<ClosureResult> {
  const parsed = parseClosureInput(input)
  if (!parsed.ok) return parsed
  const v = parsed.value
  const [dupe] = await db
    .select({ id: clinicClosure.id })
    .from(clinicClosure)
    .where(
      and(
        eq(clinicClosure.organizationId, organizationId),
        eq(clinicClosure.startsOn, v.startsOn),
        eq(clinicClosure.endsOn, v.endsOn),
        eq(clinicClosure.label, v.label),
      ),
    )
    .limit(1)
  if (dupe) return { ok: true, closure: { ...v, id: dupe.id } }
  const id = newId()
  await db.insert(clinicClosure).values({ id, organizationId, startsOn: v.startsOn, endsOn: v.endsOn, label: v.label })
  return { ok: true, closure: { ...v, id } }
}

/** Remove one closure of THIS clinic. False when it was not there. */
export async function removeClosure(organizationId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(clinicClosure)
    .where(and(eq(clinicClosure.organizationId, organizationId), eq(clinicClosure.id, id)))
    .returning({ id: clinicClosure.id })
  return rows.length > 0
}

/** Today's closure for a patient-facing blurb ("Closed today · Thanksgiving").
 *  Never throws — a failed read just means the blurb says what the grid says. */
export async function closureToday(
  organizationId: string,
  timeZone: string | null | undefined,
  now = new Date(),
): Promise<ClosureRange | null> {
  try {
    return await closureOnDay(organizationId, clinicDayKeyFor(now, timeZone))
  } catch {
    return null
  }
}
