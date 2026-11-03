import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * THE PATIENTS-LIST PAGE BOUND, RENDERED FOR REAL.
 *
 * R2 Slice 1 fixed the fan-outs and deliberately deferred pagination, for one
 * reason: the derived filters and the sort ran in JavaScript AFTER the load, so
 * a `LIMIT` would have truncated the wrong set — "the recall-due patients among
 * the first hundred" instead of "the first hundred recall-due patients".
 *
 * So the property under test is not "there is a limit". It is that NOTHING
 * narrows or reorders the roster after the limit has been applied — every
 * filter and the whole sort have to be in the statement Postgres runs. This
 * file asserts that against the real statement, through drizzle's own dialect
 * via the pg-proxy driver. No database.
 *
 * Since G2-16/G2-17 the New and Lapsed chips are the lifecycle DERIVATION in
 * SQL (the stored column is read for nothing) and the last-contact sort reads
 * `patient_message`, which carries an organization_id — so the standing
 * exception this file once pinned ("the one subquery that cannot be scoped")
 * is retired, and EVERY subquery under EVERY sort and chip is tenant-scoped.
 */

const captured: Array<{ sql: string; params: unknown[] }> = []
/** Rows the next statement resolves with, in call order. */
let nextRows: unknown[][] = []

vi.mock('@/lib/db', async () => {
  const schema = await vi.importActual<typeof import('@/lib/db/schema')>('@/lib/db/schema')
  const { drizzle } = await import('drizzle-orm/pg-proxy')
  const db = drizzle(
    async (sql: string, params: unknown[]) => {
      captured.push({ sql, params })
      return { rows: (nextRows.shift() ?? []) as never }
    },
    { schema },
  )
  return { db, schema }
})
// The intake door read (law 1, verification round) is not one of the SQL statements under test here.
vi.mock('@/lib/services/feature-switches', () => ({ getFeatureSwitchState: async () => ({ intake_forms: true }) }))
vi.mock('@/lib/services/clinic-cadence', () => ({
  getClinicCadence: vi.fn(async () => ({ recallMonths: 6, lapsedMonths: 18 })),
}))
// The clinic-timezone read (the birthday glyph's calendar, the New chip's
// 30-clinic-day cutoff) is a settings lookup, not one of the roster
// statements under test here either.
vi.mock('@/lib/services/clinic-timezone', () => ({ getClinicTimeZone: vi.fn(async () => 'America/New_York') }))
vi.mock('@/lib/services/patient-tags', () => ({
  getTagsForPatients: vi.fn(async () => new Map()),
  listPatientTags: vi.fn(async () => []),
}))

import {
  listPatients,
  listPatientsPage,
  type PatientListFilters,
  type PatientListSort,
} from '@/lib/services/patients'
import { DEFAULT_PATIENT_LIMIT, MAX_PATIENT_LIMIT } from '@/lib/types/patient-views'

/** The count statement, then the roster statement. */
const countSql = () => captured[0].sql.toLowerCase()
const rosterSql = () => captured[1].sql.toLowerCase()

/** One roster row, in the roster projection's column order. */
const rosterRow = (i: number) => [
  `pat_${i}`, 'Mia', 'Hayes', null, null, null, 'booking', 1,
  new Date('2026-01-01'), 1, null, null, null, null,
]

/** `total` comes back from the count query; the roster returns `n` patients. */
function seed(total: number, n: number) {
  nextRows = [[[total]], Array.from({ length: n }, (_, i) => rosterRow(i))]
}

const SUBQUERY = /select 1 from|select max\(|select min\(/g
const ORG_FILTER = /"organization_id" = \$/g

beforeEach(() => {
  captured.length = 0
  nextRows = []
})

describe('listPatientsPage — the bound', () => {
  it('asks Postgres for the page, and for the size of the whole filtered set', async () => {
    seed(4213, 100)
    const page = await listPatientsPage('org_1', {}, undefined, { limit: 100 })

    expect(countSql()).toContain('select count(*) from "patient"')
    expect(rosterSql()).toContain('limit $')
    expect(captured[1].params).toContain(100)
    // The header count is the FILTERED total, not the page — a clinic with
    // 4,213 patients must not read "100 patients".
    expect(page.total).toBe(4213)
    expect(page.rows).toHaveLength(100)
    expect(page.hasMore).toBe(true)
  })

  it('reports hasMore false once the page holds everything that matched', async () => {
    seed(7, 7)
    const page = await listPatientsPage('org_1', {}, undefined, { limit: 100 })
    expect(page.total).toBe(7)
    expect(page.hasMore).toBe(false)
  })

  it('clamps a hand-typed page size to the ceiling — the bound cannot be reopened', async () => {
    seed(50_000, 1)
    await listPatientsPage('org_1', {}, undefined, { limit: 999_999 })
    expect(captured[1].params).toContain(MAX_PATIENT_LIMIT)
  })

  it('falls back to the default rather than sending NaN to Postgres', async () => {
    seed(10, 1)
    await listPatientsPage('org_1', {}, undefined, { limit: Number.NaN })
    expect(captured[1].params).toContain(DEFAULT_PATIENT_LIMIT)
  })

  it('the whole-set entry point sends NO limit, and no count it would throw away', async () => {
    // `listPatients` returns only `.rows`, so counting there is a second full
    // pass — with every correlated subquery — whose answer is discarded. Three
    // consumers take this path, one of them a per-org cron. ONE statement.
    nextRows = [Array.from({ length: 3 }, (_, i) => rosterRow(i))]
    const rows = await listPatients('org_1')
    // The roster is the FIRST statement — no count ahead of it — and nothing
    // in the run counts at all.
    expect(captured[0].sql.toLowerCase()).toContain('from "patient"')
    expect(captured.some((c) => c.sql.toLowerCase().includes('count(*)'))).toBe(false)
    expect(captured[0].sql.toLowerCase()).not.toContain('limit $')
    expect(rows).toHaveLength(3)
  })

  it('returns the honest total even when the page itself is empty', async () => {
    nextRows = [[[0]], []]
    const page = await listPatientsPage('org_1', {}, undefined, { limit: 100 })
    expect(page).toEqual({ rows: [], total: 0, hasMore: false })
  })
})

describe('listPatientsPage — every filter is in the statement, not after it', () => {
  /** Both statements must carry the predicate: the page and its count have to
   *  describe the SAME set, or "showing 100 of N" is a lie. */
  const bothCarry = (needle: string) => {
    expect(countSql()).toContain(needle)
    expect(rosterSql()).toContain(needle)
  }

  async function run(filters: PatientListFilters) {
    captured.length = 0
    seed(1, 1)
    await listPatientsPage('org_1', filters, undefined, { limit: 100 })
  }

  it('hasBalance — a NULL PMS balance is not a balance', async () => {
    await run({ hasBalance: true })
    bothCarry('coalesce("patient"."pms_balance_cents", 0) > 0')
  })

  it('birthdayThisMonth — the month component of the ISO date column', async () => {
    await run({ birthdayThisMonth: true })
    bothCarry('substring("patient"."date_of_birth" from 6 for 2)')
  })

  it('missingIntake — a live visit inside the week AND no form on file', async () => {
    await run({ missingIntake: true })
    const sql = rosterSql()
    expect(sql).toContain('exists (')
    expect(sql).toContain('from "appointment"')
    expect(sql).toContain('"status" not in (')
    // Bound, not inlined — the whole predicate goes through drizzle's helpers
    // so every timestamp beside them rides the column's own encoder.
    expect(captured[1].params).toContain('cancelled')
    expect(captured[1].params).toContain('no_show')
    expect(sql).toContain('not exists (')
    expect(sql).toContain('from "form_submission"')
  })

  it('tagIds — OR semantics, as an EXISTS over the assignment table', async () => {
    await run({ tagIds: ['tag_a', 'tag_b'] })
    bothCarry('from "patient_tag_assignment"')
    expect(captured[1].params).toContain('tag_a')
    expect(captured[1].params).toContain('tag_b')
  })

  it('recall_due — the derivation’s own branches, scoped to the org', async () => {
    await run({ status: 'recall_due' })
    const sql = rosterSql()
    // 'scheduled' (near window, any status) and 'na' (any live future visit).
    expect(sql).toContain('not exists (')
    // The PMS branch and both fallbacks of the heuristic branch.
    expect(sql).toContain('"patient"."pms_recall_due_at" is not null')
    expect(sql).toContain('"patient"."recall_interval_months" > 0')
    expect(sql).toContain('"patient"."recall_interval_months" is not null')
    expect(sql).toContain(`interval '30 days'`)
    // No `--` line comment may reach a rendered statement: one flattening and
    // everything after it is commented out.
    expect(sql).not.toContain('--')
  })

  it('new — the lifecycle DERIVATION in SQL, never the stored column', async () => {
    await run({ status: 'new' })
    const sql = rosterSql()
    bothCarry("then 'new'")
    expect(sql).toContain("end = 'new'")
    // Every branch of the derivation is in the statement, in its order —
    // archived, lead, new, lapsed, at_risk, active.
    const order = ["then 'archived'", "then 'lead'", "then 'new'", "then 'lapsed'", "then 'at_risk'", "else 'active'"]
    const positions = order.map((o) => sql.indexOf(o))
    expect(positions.every((p) => p >= 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
    // The stored column is consulted for nothing.
    expect(sql).not.toContain('"patient"."lifecycle"')
    // The backfill gate is bound, not typed, and NULL-safe.
    expect(sql).toContain('"patient"."source" is null or "patient"."source" not in (')
    expect(captured[1].params).toContain('pms_import')
    expect(captured[1].params).toContain('import')
  })

  it('inactive — the same derivation, asked for "lapsed"', async () => {
    await run({ status: 'inactive' })
    bothCarry("end = 'lapsed'")
    expect(rosterSql()).not.toContain('"patient"."lifecycle"')
  })

  it('every subquery it adds is tenant-scoped — exactly, under every sort and both lifecycle chips', async () => {
    // An earlier cut of this asserted `>=`, which tolerated one unscoped
    // subquery, and its regex missed `select min(` entirely; a later cut
    // pinned ONE standing exception (the last-contact sort over `messages`,
    // which had no org column). That exception is retired — the sort reads
    // `patient_message` now. Equality against subqueries + 1, under every
    // sort, so a new correlated read cannot arrive without its own filter.
    for (const field of ['name', 'lastVisit', 'nextVisit', 'balance', 'created', 'lastActivity'] as const) {
      for (const status of ['recall_due', 'new', 'inactive'] as const) {
        captured.length = 0
        seed(1, 1)
        await listPatientsPage(
          'org_1',
          { status, missingIntake: true, tagIds: ['tag_a'] },
          { field, direction: 'asc' },
          { limit: 100 },
        )
        const sql = rosterSql()
        const subqueries = (sql.match(SUBQUERY) ?? []).length
        const orgFilters = (sql.match(ORG_FILTER) ?? []).length
        expect(subqueries, `${field}/${status}`).toBeGreaterThan(0)
        // +1 for the outer patient.organization_id the whole query hangs on.
        expect(orgFilters, `${field}/${status}`).toBe(subqueries + 1)
      }
    }
  })

  it('the per-page reads are tenant-scoped too — the last-contact cell reads patient_message by org', async () => {
    captured.length = 0
    seed(2, 2)
    await listPatientsPage('org_1', {}, undefined, { limit: 100 })
    const contact = captured.find((c) => c.sql.toLowerCase().includes('from "patient_message"'))
    expect(contact).toBeDefined()
    const sql = contact!.sql.toLowerCase()
    expect(sql).toContain('select distinct on ("patient_message"."patient_id") "patient_id", "sent_at", "direction" from "patient_message"')
    expect(sql).toContain('"patient_message"."organization_id" = $')
    expect(sql).toContain('order by "patient_message"."patient_id", "patient_message"."sent_at" desc')
    // Nothing reads the generic conversations tables for a patient's contact.
    expect(captured.some((c) => c.sql.toLowerCase().includes('"conversation_members"'))).toBe(false)
    // Every per-page statement after the roster names the org.
    for (const c of captured.slice(2)) {
      expect(c.sql.toLowerCase(), c.sql).toContain('"organization_id" = $')
    }
  })
})

describe('listPatientsPage — the sort is in the statement too', () => {
  async function sortedBy(sort: PatientListSort) {
    captured.length = 0
    seed(1, 1)
    await listPatientsPage('org_1', {}, sort, { limit: 100 })
    return rosterSql()
  }

  it('name sorts case-insensitively, last name first', async () => {
    const sql = await sortedBy({ field: 'name', direction: 'asc' })
    expect(sql).toContain('order by lower("patient"."last_name") asc')
    expect(sql).toContain('lower("patient"."first_name") asc')
  })

  it('the three derived sorts become scalar subqueries', async () => {
    expect(await sortedBy({ field: 'lastVisit', direction: 'desc' })).toContain(
      'order by (\n    select max("appointment"."start_time")',
    )
    expect(await sortedBy({ field: 'nextVisit', direction: 'asc' })).toContain(
      'select min("appointment"."start_time")',
    )
    expect(await sortedBy({ field: 'lastActivity', direction: 'desc' })).toContain(
      'select max("patient_message"."sent_at")',
    )
  })

  it('the last-contact sort reads the SAME table as the cell, scoped to the org and the row', async () => {
    const sql = await sortedBy({ field: 'lastActivity', direction: 'desc' })
    expect(sql).toContain('from "patient_message"')
    expect(sql).toContain('"patient_message"."organization_id" = $')
    expect(sql).toContain('"patient_message"."patient_id" = "patient"."id"')
    expect(sql).not.toContain('"messages"')
  })

  it('a patient with nothing on the books sorts LAST in "soonest next visit"', async () => {
    // The JS comparator coerced a missing next visit to +∞; NULLS LAST is that
    // same statement in SQL. Getting this backwards would put every patient
    // with no upcoming visit at the top of the page.
    expect(await sortedBy({ field: 'nextVisit', direction: 'asc' })).toContain('asc nulls last')
    expect(await sortedBy({ field: 'nextVisit', direction: 'desc' })).toContain('desc nulls first')
  })

  it('a missing last visit / balance sorts FIRST ascending (the JS `?? 0`)', async () => {
    expect(await sortedBy({ field: 'lastVisit', direction: 'asc' })).toContain('asc nulls first')
    expect(await sortedBy({ field: 'balance', direction: 'asc' })).toContain(
      'coalesce("patient"."pms_balance_cents", 0) asc',
    )
  })

  it('every sort ends on the patient id, so a page boundary is stable', async () => {
    for (const field of ['name', 'lastVisit', 'nextVisit', 'balance', 'created', 'lastActivity'] as const) {
      const sql = await sortedBy({ field, direction: 'asc' })
      expect(sql, field).toMatch(/"patient"\."id" asc limit \$/)
    }
  })
})

describe('listPatientsPage — the row reads the derivation, not the column', () => {
  it('a roster row with no visits and no bookings is a lead; an imported one is active', async () => {
    captured.length = 0
    nextRows = [
      [[2]],
      [
        ['pat_lead', 'Mia', 'Hayes', null, null, null, 'lead_form', 1, new Date('2025-01-01'), 1, null, null, null, null],
        ['pat_import', 'Ira', 'Hayes', null, null, null, 'import', 1, new Date(), 1, null, null, null, null],
      ],
    ]
    const page = await listPatientsPage('org_1', {}, undefined, { limit: 100 })
    const byId = new Map(page.rows.map((r) => [r.id, r]))
    expect(byId.get('pat_lead')!.lifecycle).toBe('lead')
    expect(byId.get('pat_lead')!.flags.newPatient).toBe(true)
    // A backfilled roster member imported TODAY is neither new nor a lead,
    // and ★ does not fire on "no visit on file" for them.
    expect(byId.get('pat_import')!.lifecycle).toBe('active')
    expect(byId.get('pat_import')!.flags.newPatient).toBe(false)
    expect(byId.get('pat_import')!.lastContactAt).toBeNull()
    expect(byId.get('pat_import')!.lastContactDirection).toBeNull()
  })
})
