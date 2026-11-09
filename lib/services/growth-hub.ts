import 'server-only'
import { and, eq, gte, isNotNull, isNull, lt, ne, or } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { BACKFILL_PATIENT_SOURCES } from '@/lib/patient-acquisition'
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
 * One patient row is one person however many of those apply. The window is
 * the clinic-local month so far against the SAME POINT last month, on the
 * scoreboard's own basis (`firstSeenAt`, archived/merged out, bulk backfills
 * out — a CSV import can't fake a win).
 */

export interface WordOfMouthCounts {
  /** New patients this clinic-local month who came through a friend. */
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
      firstSeenAt: schema.patient.firstSeenAt,
    })
    .from(schema.patient)
    .where(
      and(
        eq(schema.patient.organizationId, organizationId),
        isNotNull(schema.patient.firstSeenAt),
        gte(schema.patient.firstSeenAt, lastMonthStart),
        lt(schema.patient.firstSeenAt, now),
        ne(schema.patient.lifecycle, 'archived'),
        isNull(schema.patient.mergedIntoPatientId),
        or(eq(schema.patient.source, 'referral'), isNotNull(schema.patient.referredByPatientId)),
      ),
    )

  const thisMonth = new Set<string>()
  const lastMonth = new Set<string>()
  const referrers = new Set<string>()
  for (const r of rows) {
    if (!r.firstSeenAt || BACKFILL_PATIENT_SOURCES.has(r.source ?? '')) continue
    const t = r.firstSeenAt.getTime()
    if (t >= monthStart.getTime()) {
      thisMonth.add(r.id)
      if (r.referredBy) referrers.add(r.referredBy)
    } else if (t < lastPoint.getTime()) {
      lastMonth.add(r.id)
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
    return 'no new patients through a friend yet — happy patients get asked after a great visit'
  }
  const n = `${c.thisMonth} new patient${c.thisMonth === 1 ? '' : 's'} through a friend this month`
  return `${n} · ${c.lastMonthSamePoint} at this point last month`
}
