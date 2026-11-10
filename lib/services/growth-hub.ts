import 'server-only'
import { and, eq, isNotNull, isNull, ne, or } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { BACKFILL_PATIENT_SOURCES } from '@/lib/patient-acquisition'
import { getJourneyForPatients } from '@/lib/services/patient-journey'
import { clinicMonthStart, clinicSamePointLastMonth } from '@/lib/clinic-timezone'

/**
 * WORD OF MOUTH on the Growth hub (ML-39, G3-19).
 *
 * The channel every dentist says matters most gets a number. It counts
 * distinct PEOPLE — new patients whose own record says a friend sent them —
 * never events, never a stamped guess:
 *  - `patient.source = 'referral'` (the front desk or an intake said so), or
 *  - `patient.referred_by_patient_id` set (the portal share link's
 *    attribution, stamped once at first booking).
 * One patient row is one person however many of those apply. The event is
 * SEATED (ML-39b — "new patients" means seated, never first-seen): the
 * person's first completed visit (`firstSeatedAt` from the journey spine,
 * pms_import/csv_import history never mints) falls in the clinic-local month
 * so far, against the SAME POINT last month. Archived/merged out, bulk
 * backfills out — a CSV import can't fake a win.
 */

export interface WordOfMouthCounts {
  /** Referred patients first SEATED this clinic-local month. */
  thisMonth: number
  /** The same measure at the same point last month. */
  lastMonthSamePoint: number
  /** Distinct existing patients who did the referring this month. */
  referrersThisMonth: number
}

export async function getWordOfMouthCounts(
  organizationId: string,
  timeZone: string,
  now: Date = new Date(),
): Promise<WordOfMouthCounts> {
  const monthStart = clinicMonthStart(now, timeZone)
  const lastMonthStart = clinicMonthStart(now, timeZone, -1)
  const lastPoint = clinicSamePointLastMonth(now, timeZone)

  const rows = await db
    .select({
      id: schema.patient.id,
      source: schema.patient.source,
      referredBy: schema.patient.referredByPatientId,
    })
    .from(schema.patient)
    .where(
      and(
        eq(schema.patient.organizationId, organizationId),
        ne(schema.patient.lifecycle, 'archived'),
        isNull(schema.patient.mergedIntoPatientId),
        or(eq(schema.patient.source, 'referral'), isNotNull(schema.patient.referredByPatientId)),
      ),
    )

  const people = new Map<string, { source: string | null; referredBy: string | null }>()
  for (const r of rows) {
    if (BACKFILL_PATIENT_SOURCES.has(r.source ?? '')) continue
    const prev = people.get(r.id)
    people.set(r.id, { source: r.source, referredBy: prev?.referredBy ?? r.referredBy })
  }
  const journeys = await getJourneyForPatients(organizationId, Array.from(people.keys()))

  const thisMonth = new Set<string>()
  const lastMonth = new Set<string>()
  const referrers = new Set<string>()
  for (const [id, r] of Array.from(people.entries())) {
    const seated = journeys.get(id)?.firstSeatedAt
    if (!seated) continue
    const t = seated.getTime()
    if (t >= monthStart.getTime() && t < now.getTime()) {
      thisMonth.add(id)
      if (r.referredBy) referrers.add(r.referredBy)
    } else if (t >= lastMonthStart.getTime() && t < lastPoint.getTime()) {
      lastMonth.add(id)
    }
  }
  return {
    thisMonth: thisMonth.size,
    lastMonthSamePoint: lastMonth.size,
    referrersThisMonth: referrers.size,
  }
}

/** The hub row's one-line value — honest at zero, never a fake trend. */
export function wordOfMouthLine(c: WordOfMouthCounts): string {
  if (c.thisMonth === 0 && c.lastMonthSamePoint === 0) {
    return 'no seated patients through a friend yet — happy patients get asked after a great visit'
  }
  const n = `${c.thisMonth} patient${c.thisMonth === 1 ? '' : 's'} seated through a friend this month`
  return `${n} · ${c.lastMonthSamePoint} at this point last month`
}
