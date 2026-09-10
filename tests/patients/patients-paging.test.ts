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
vi.mock('@/lib/services/clinic-cadence', () => ({
  getClinicCadence: vi.fn(async () => ({ recallMonths: 6, lapsedMonths: 18 })),
}))
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

/** `total` comes back from the count query; the roster returns `n` patients. */
function seed(total: number, n: number) {
  nextRows = [
    [[total]],
    Array.from({ length: n }, (_, i) => [
      `pat_${i}`, 'Mia', 'Hayes', null, null, null, 'booking', 'active',
      new Date('2026-01-01'), null, 1, null, null, null, null,
    ]),
  ]
}

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

  it('the whole-set entry point sends NO limit — bulk actions get the segment', async () => {
    seed(3, 3)
    const rows = await listPatients('org_1')
    expect(rosterSql()).not.toContain('limit $')
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
    expect(sql).toContain(`not in ('cancelled', 'no_show')`)
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
    // The PMS branch and the last-visit heuristic branch.
    expect(sql).toContain('"patient"."pms_recall_due_at" is not null')
    expect(sql).toContain('"patient"."recall_interval_months" is not null')
    expect(sql).toContain(`interval '30 days'`)
    // No `--` line comment may reach a rendered statement: one flattening and
    // everything after it is commented out.
    expect(sql).not.toContain('--')
  })

  it('every subquery it adds is tenant-scoped', async () => {
    await run({ status: 'recall_due', missingIntake: true, tagIds: ['tag_a'] })
    const sql = rosterSql()
    // Each correlated subquery names an organization_id filter of its own.
    const orgFilters = sql.match(/"organization_id" = \$/g) ?? []
    const subqueries = sql.match(/select 1 from|select max\(/g) ?? []
    expect(orgFilters.length).toBeGreaterThanOrEqual(subqueries.length)
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
      'select max("messages"."created_at")',
    )
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
