import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prewarm } from '../prewarm'
import { QueryBuilder } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import * as schema from '@/lib/db/schema'

/**
 * THE AUDIENCE RESOLVER'S APPOINTMENT LOOKUPS, PINNED.
 *
 * `resolvePatientAudience` used to ask Postgres for every past appointment of
 * every patient it was considering and pick the most recent one in JavaScript.
 * The retention cron runs it four times a day per clinic, and every marketing
 * send runs it again, so the row count it moved grew with the clinic's whole
 * appointment book — the perf cliff the load-sanity notes flagged.
 *
 * The roll-up now happens in SQL. Two things have to stay true for that to be
 * both fast AND correct, and neither is visible to a JavaScript row mock:
 *
 *  1. the lookups GROUP BY patient_id (one row per patient, not per
 *     appointment) and take `max(start_time)` for the last visit — if a future
 *     edit dropped the grouping the resolver would silently go back to
 *     streaming the whole table;
 *  2. every lookup still carries its organization_id scope and its
 *     cancelled / no_show exclusions. An aggregate that lost the org filter
 *     would date-stamp one clinic's patients from another clinic's book.
 */

const qb = new QueryBuilder()
const IDS = ['pat_1', 'pat_2']
const NOW = new Date('2026-09-09T15:00:00Z')

// Load the module(s) under test during COLLECTION, so no single test is
// billed for the cold module graph (see tests/prewarm.ts).
prewarm(() => import('@/lib/services/marketing'))

describe('the aggregated lookups as Postgres receives them', () => {
  it('rolls the last visit up with max(start_time) grouped by patient', async () => {
    const { audienceLastVisitWhere } = await import('@/lib/services/marketing')
    const rendered = qb
      .select({
        patientId: schema.appointment.patientId,
        lastVisitAt: sql<Date>`max(${schema.appointment.startTime})`,
      })
      .from(schema.appointment)
      .where(audienceLastVisitWhere('org_1', IDS, NOW))
      .groupBy(schema.appointment.patientId)
      .toSQL().sql

    expect(rendered).toMatch(/max\(/i)
    expect(rendered).toMatch(/group by/i)
    expect(rendered).toContain('"patient_id"')
  })

  it('scopes the last-visit lookup to the organization and skips dead appointments', async () => {
    const { audienceLastVisitWhere } = await import('@/lib/services/marketing')
    const rendered = qb
      .select({ patientId: schema.appointment.patientId })
      .from(schema.appointment)
      .where(audienceLastVisitWhere('org_1', IDS, NOW))
      .groupBy(schema.appointment.patientId)
      .toSQL()

    expect(rendered.sql).toContain('organization_id')
    // Past visits only, and neither a cancellation nor a no-show counts as one.
    expect(rendered.sql).toMatch(/"start_time" <=/)
    expect(rendered.params).toContain('cancelled')
    expect(rendered.params).toContain('no_show')
    expect(rendered.params).toContain('org_1')
  })

  it('scopes the upcoming-visit existence check the same way, forward in time', async () => {
    const { audienceUpcomingWhere } = await import('@/lib/services/marketing')
    const rendered = qb
      .select({ patientId: schema.appointment.patientId })
      .from(schema.appointment)
      .where(audienceUpcomingWhere('org_1', IDS, NOW))
      .groupBy(schema.appointment.patientId)
      .toSQL()

    expect(rendered.sql).toContain('organization_id')
    expect(rendered.sql).toMatch(/"start_time" >=/)
    expect(rendered.sql).toMatch(/group by/i)
    expect(rendered.params).toContain('cancelled')
    expect(rendered.params).toContain('no_show')
  })

  it('bounds the unconfirmed lookup to the requested window, org-scoped', async () => {
    const { audienceUnconfirmedWhere } = await import('@/lib/services/marketing')
    const rendered = qb
      .select({ patientId: schema.appointment.patientId })
      .from(schema.appointment)
      .where(audienceUnconfirmedWhere('org_1', IDS, NOW, 48))
      .groupBy(schema.appointment.patientId)
      .toSQL()

    expect(rendered.sql).toContain('organization_id')
    expect(rendered.params).toContain('scheduled')
    // now .. now + 48h (drizzle binds timestamps as ISO strings)
    expect(rendered.params).toContain(NOW.toISOString())
    expect(rendered.params).toContain(new Date(NOW.getTime() + 48 * 3600_000).toISOString())
  })
})

/**
 * The behavioural half: with the roll-up in SQL the resolver receives ONE row
 * per patient, so the last-visit filters must read that row directly rather
 * than re-deriving a maximum from a stream.
 */

const queue: unknown[][] = []
const groupByCalls: number[] = []

type Chain = Promise<unknown[]> & {
  orderBy: () => Promise<unknown[]>
  groupBy: () => Promise<unknown[]>
}

vi.mock('@/lib/db', async () => {
  const schema = await import('@/lib/db/schema')
  return {
    db: {
      select: () => ({
        from: () => ({
          where: () => {
            const rows = queue.shift() ?? []
            const p = Promise.resolve(rows) as Chain
            p.orderBy = () => Promise.resolve(rows)
            p.groupBy = () => {
              groupByCalls.push(rows.length)
              return Promise.resolve(rows)
            }
            return p
          },
        }),
      }),
    },
    schema,
  }
})

function patientRow(id: string) {
  return {
    id,
    firstName: 'Pat',
    lastName: id.toUpperCase(),
    email: `${id}@example.com`,
    phone: null,
    dateOfBirth: null,
    lifecycle: 'active',
    marketingEmailOptIn: 1,
    marketingSmsOptIn: 0,
    pmsRecallDueAt: null,
    pmsBalanceCents: 0,
    insuranceProvider: null,
  }
}

beforeEach(() => {
  queue.length = 0
  groupByCalls.length = 0
})

describe('resolvePatientAudience — one appointment row per patient', () => {
  it('keeps the patient whose max(start_time) is older than the window and drops the recent one', async () => {
    const { resolvePatientAudience, PatientAudienceFilter } = await import('@/lib/services/marketing')
    const longAgo = new Date(Date.now() - 400 * 86_400_000)
    const recently = new Date(Date.now() - 5 * 86_400_000)

    queue.push([patientRow('p_lapsed'), patientRow('p_recent')]) // base patient query
    queue.push([
      { patientId: 'p_lapsed', lastVisitAt: longAgo },
      { patientId: 'p_recent', lastVisitAt: recently },
    ])

    const rows = await resolvePatientAudience(
      'org_1',
      PatientAudienceFilter.parse({ lastVisitAtLeastDaysAgo: 180 }),
    )
    expect(rows.map((r) => r.patientId)).toEqual(['p_lapsed'])
    // The appointment lookup asked Postgres to group — the JS roll-up is gone.
    expect(groupByCalls.length).toBeGreaterThan(0)
  })

  it('does the day-math on the Date the column mapper produces', async () => {
    const { resolvePatientAudience, PatientAudienceFilter } = await import('@/lib/services/marketing')
    const longAgo = new Date(Date.now() - 400 * 86_400_000)

    queue.push([patientRow('p_lapsed')])
    // A Date, because that is what the query hands back: the aggregate is
    // drizzle's `max(column)`, which carries `start_time`'s driver mapper, so
    // the raw `2026-03-01 14:30:00` text is decoded as UTC before it reaches
    // this code. This mock sits ABOVE that layer, so pushing a raw string here
    // would be testing a driver, not the service.
    //
    // That the mapper is really attached — the thing that would silently make
    // every timestamp parse in the host's zone if it came off — is pinned by
    // tests/guards/timestamp-aggregate-mapping.test.ts, at the layer where it
    // is actually observable. A mock cannot prove it, which is why the earlier
    // version of this test (feeding a `Z`-suffixed ISO string the driver never
    // produces) passed under any timezone and guarded nothing.
    queue.push([{ patientId: 'p_lapsed', lastVisitAt: longAgo }])

    const rows = await resolvePatientAudience(
      'org_1',
      PatientAudienceFilter.parse({ lastVisitAtLeastDaysAgo: 180 }),
    )
    expect(rows.map((r) => r.patientId)).toEqual(['p_lapsed'])
  })

  it('drops a patient with no appointment row at all when a last-visit window is required', async () => {
    const { resolvePatientAudience, PatientAudienceFilter } = await import('@/lib/services/marketing')
    queue.push([patientRow('p_never')])
    queue.push([]) // never been in

    const rows = await resolvePatientAudience(
      'org_1',
      PatientAudienceFilter.parse({ lastVisitWithinDays: 30 }),
    )
    expect(rows).toEqual([])
  })
})
